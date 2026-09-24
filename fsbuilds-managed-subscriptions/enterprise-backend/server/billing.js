/**
 * BILLING ENGINE + DUNNING
 * ============================================================================
 * This is the module that earns this backend its existence.
 *
 * For a STANDARD FastSpring subscription, FastSpring runs the billing cycle and
 * its own retry/notification flow on a declined rebill. For a MANAGED
 * subscription there is no FastSpring-side schedule at all - if this loop
 * doesn't run, nobody ever gets charged. Everything below is the part that
 * subscription management platforms own when the payment provider is only
 * acting as the merchant of record.
 *
 * Two responsibilities:
 *   1. Scheduling  - decide which subscriptions are due and charge them.
 *   2. Dunning     - when a charge fails, retry on a schedule instead of
 *                    immediately treating the customer as churned.
 *
 * Dunning matters disproportionately: failed payments (involuntary churn) are
 * consistently one of the largest and most recoverable sources of subscription
 * revenue loss, which is why platforms like Recurly and Chargebee treat
 * recovery as a first-class workflow rather than an afterthought.
 */

const store = require("./store");
const fastspring = require("./fastspring");
const subscriptions = require("./subscriptions");

/**
 * Days to wait before each retry after a failed charge. Length of this array
 * is the max number of retries - after the last one, the subscription is
 * treated as involuntarily churned.
 *
 * The spacing is deliberate: retrying immediately mostly re-hits the same
 * decline reason, while spreading attempts over days gives a customer time to
 * fix an expired card or for a temporary hold to clear.
 */
const RETRY_SCHEDULE_DAYS = [1, 3, 5];

function retryDelayMs(attempt) {
  const days = RETRY_SCHEDULE_DAYS[attempt] ?? RETRY_SCHEDULE_DAYS[RETRY_SCHEDULE_DAYS.length - 1];
  const demoMinutes = parseInt(process.env.DEMO_RETRY_MINUTES || "", 10);
  if (demoMinutes > 0) return demoMinutes * 60 * 1000;
  return days * 24 * 60 * 60 * 1000;
}

function isDue(sub, now) {
  if (sub.status !== "active") return false;
  if (!sub.nextBillingDate) return false;
  return new Date(sub.nextBillingDate).getTime() <= now;
}

function isRetryDue(sub, now) {
  if (sub.status !== "past_due" || !sub.dunning) return false;
  if (!sub.dunning.nextRetryAt) return false;
  return new Date(sub.dunning.nextRetryAt).getTime() <= now;
}

/**
 * Ask FastSpring to charge a subscription.
 *
 * Note what this does NOT do: mark the subscription paid. A successful response
 * only means FastSpring accepted the request. The actual outcome arrives later
 * as a subscription.charge.completed or .failed webhook, handled in webhooks.js.
 * Treating the API response as the outcome is the classic way to end up showing
 * revenue that never actually landed.
 */
async function chargeOne(subscriptionId) {
  const sub = store.get(subscriptionId);
  if (!sub) throw new Error(`Unknown subscription: ${subscriptionId}`);

  store.upsert(subscriptionId, { lastChargeRequestedAt: new Date().toISOString() }, "charge_requested");

  // Log the transaction as pending - will resolve to completed/failed via webhook
  store.recordTransaction({
    subscriptionId,
    event: "charge.requested",
    status: "pending",
    amount: sub.pendingPrice || sub.price || null,
    product: sub.product,
    planName: sub.planName,
  });

  try {
    const response = await fastspring.chargeSubscriptions([subscriptionId]);

    // Partial failures come back inside a 200 response, per-subscription -
    // so a 200 alone isn't success. Check the entry itself.
    const entries = response && (response.subscriptions || response.subscription);
    const entry = Array.isArray(entries) ? entries[0] : null;
    if (entry && entry.result === "error") {
      const message =
        (entry.error && (entry.error.subscription || Object.values(entry.error)[0])) ||
        "FastSpring rejected the charge";
      handleChargeFailure(subscriptionId, message);
      return { accepted: false, error: message, response };
    }

    return { accepted: true, response };
  } catch (err) {
    const message = err.data ? JSON.stringify(err.data) : err.message;
    handleChargeFailure(subscriptionId, message);
    return { accepted: false, error: message };
  }
}

/**
 * A charge succeeded (called from the webhook handler, not from chargeOne).
 * Clears any dunning state and advances the schedule.
 */
function handleChargeSuccess(subscriptionId) {
  const sub = store.get(subscriptionId);
  if (!sub) return null;

  const recovered = sub.status === "past_due";

  return store.upsert(
    subscriptionId,
    {
      status: "active",
      dunning: null,
      lastChargedAt: new Date().toISOString(),
      nextBillingDate: subscriptions.computeNextBillingDate(sub.interval),
    },
    recovered ? "payment_recovered" : "charge_completed",
    recovered ? "Recovered through dunning retry" : null
  );
}

/**
 * A charge failed. Moves the subscription into dunning, or gives up if the
 * retry schedule is exhausted.
 *
 * Note the status is `past_due`, not `canceled` - the customer hasn't left,
 * their payment didn't go through. Metrics count past_due as still active for
 * exactly this reason; writing it off immediately would report recoverable
 * payment failures as real churn.
 */
function handleChargeFailure(subscriptionId, errorMessage) {
  const sub = store.get(subscriptionId);
  if (!sub) return null;

  const attempts = (sub.dunning && sub.dunning.attempts) || 0;

  if (attempts >= RETRY_SCHEDULE_DAYS.length) {
    // Retries exhausted - this is involuntary churn, tracked separately from
    // voluntary cancellation because it's the recoverable kind.
    store.upsert(
      subscriptionId,
      { dunning: { ...(sub.dunning || {}), lastError: errorMessage, nextRetryAt: null } },
      "dunning_exhausted",
      errorMessage
    );
    return subscriptions.markChurned(subscriptionId, "dunning_exhausted");
  }

  const nextRetryAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
  return store.upsert(
    subscriptionId,
    {
      status: "past_due",
      dunning: { attempts: attempts + 1, nextRetryAt, lastError: errorMessage },
    },
    "charge_failed",
    `Attempt ${attempts + 1} of ${RETRY_SCHEDULE_DAYS.length} - next retry ${nextRetryAt}`
  );
}

/**
 * One pass of the billing loop. Charges everything due, retries everything in
 * dunning whose retry time has arrived, and closes out subscriptions that were
 * scheduled to cancel at period end.
 */
async function runBillingCycle() {
  const now = Date.now();
  const results = { charged: [], retried: [], ended: [], skipped: 0 };

  for (const sub of store.all()) {
    // Scheduled cancellation reaching its end date - stop serving, record churn.
    if (sub.cancelAtPeriodEnd && sub.nextBillingDate && new Date(sub.nextBillingDate).getTime() <= now) {
      subscriptions.markChurned(sub.subscription, sub.pendingChurnReason || "voluntary");
      results.ended.push(sub.subscription);
      continue;
    }

    if (isDue(sub, now)) {
      const result = await chargeOne(sub.subscription);
      results.charged.push({ subscription: sub.subscription, ...result });
      continue;
    }

    if (isRetryDue(sub, now)) {
      const result = await chargeOne(sub.subscription);
      results.retried.push({ subscription: sub.subscription, ...result });
      continue;
    }

    results.skipped += 1;
  }

  if (results.charged.length || results.retried.length || results.ended.length) {
    console.log(
      `Billing cycle: ${results.charged.length} charged, ${results.retried.length} retried, ` +
        `${results.ended.length} ended, ${results.skipped} not due`
    );
  }
  return results;
}

let timer = null;

function startScheduler() {
  const intervalMs = parseInt(process.env.BILLING_CHECK_INTERVAL_MS || "", 10) || 60 * 1000;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    runBillingCycle().catch((err) => console.error("Billing cycle error:", err.message));
  }, intervalMs);
  console.log(`Billing scheduler running every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = {
  runBillingCycle,
  startScheduler,
  chargeOne,
  handleChargeSuccess,
  handleChargeFailure,
  RETRY_SCHEDULE_DAYS,
};
