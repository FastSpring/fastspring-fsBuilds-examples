/**
 * SUBSCRIPTION LIFECYCLE
 * ============================================================================
 * State transitions for a subscription, and the MRR movement each one causes.
 *
 * Every function here does two things: tell FastSpring what to do (via the API
 * client) and record what that means for revenue locally. The second half
 * matters as much as the first - FastSpring knows about orders and charges, but
 * "this was an upgrade worth +$40 MRR" is a modelling decision this backend
 * owns.
 */

const store = require("./store");
const fastspring = require("./fastspring");

/** Next billing date from now, per this backend's own schedule. */
function computeNextBillingDate(interval, from) {
  const date = from ? new Date(from) : new Date();

  // Demo affordance: compress cycles so a billing run is observable in a demo
  // instead of requiring a month of waiting. Set DEMO_CYCLE_MINUTES in .env to
  // make every interval that many minutes long. Unset = real calendar cycles.
  const demoMinutes = parseInt(process.env.DEMO_CYCLE_MINUTES || "", 10);
  if (demoMinutes > 0) {
    return new Date(date.getTime() + demoMinutes * 60 * 1000).toISOString();
  }

  switch (interval) {
    case "year":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "week":
      date.setDate(date.getDate() + 7);
      break;
    case "month":
    default:
      date.setMonth(date.getMonth() + 1);
      break;
  }
  return date.toISOString();
}

/**
 * A new subscription arrived (normally via the subscription.activated webhook).
 * Idempotent: FastSpring can deliver a webhook more than once, and counting the
 * same activation twice would inflate MRR permanently.
 */
function activate({ subscriptionId, productPath, accountId, price, intervalUnit, intervalLength, siteId, planDisplayName }) {
  const existing = store.get(subscriptionId);
  if (existing && existing.status === "active") return existing;

  const plan = store.planFor(productPath);
  const resolvedPrice = typeof price === "number" && price > 0 ? price : plan.amount;
  const wasChurned = existing && ["canceled", "deactivated"].includes(existing.status);

  // intervalUnit/intervalLength from the webhook payload (subscription object,
  // Webhook Expansion enabled) are more reliable than the plan catalog entry,
  // since they reflect what FastSpring actually set on this subscription.
  // Fall back to the plan catalog if the webhook didn't include them
  // (e.g. Webhook Expansion not enabled, or a managed sub with no cycle).
  // "adhoc" means managed subscription - no real billing cycle, skip it
  const resolvedInterval = (intervalUnit && intervalUnit !== "adhoc" ? intervalUnit : null) || plan.interval;

  const sub = store.upsert(
    subscriptionId,
    {
      product: productPath,
      planName: planDisplayName || plan.name,
      interval: resolvedInterval,
      intervalUnit: intervalUnit || null,
      intervalLength: intervalLength || null,
      price: resolvedPrice,
      account: accountId || (existing && existing.account) || null,
      status: "active",
      cancelAtPeriodEnd: false,
      dunning: null,
      churnedAt: null,
      churnReason: null,
      siteId: siteId || (existing && existing.siteId) || null,
      nextBillingDate: computeNextBillingDate(resolvedInterval),
    },
    wasChurned ? "reactivated" : "activated",
    `${plan.name} (${resolvedInterval})`
  );

  store.recordMrrEvent(wasChurned ? "reactivation" : "new", subscriptionId, store.monthlyValue(sub));
  return sub;
}

/**
 * Upgrade or downgrade. Tells FastSpring to switch the product, then records
 * the revenue delta as expansion (moving up) or contraction (moving down).
 *
 * The local record updates on a successful API response rather than waiting for
 * a webhook, because subscription.updated doesn't reliably tell us the old
 * price - and the delta is the whole point of the event.
 */
async function changePlan(subscriptionId, newProductPath, { prorate = true, quantity = 1 } = {}) {
  const sub = store.get(subscriptionId);
  if (!sub) throw new Error(`Unknown subscription: ${subscriptionId}`);

  const oldMonthly = store.monthlyValue(sub);
  const newPlan = store.planFor(newProductPath);

  const response = await fastspring.changePlan(subscriptionId, newProductPath, quantity, prorate);

  const updated = store.upsert(
    subscriptionId,
    {
      product: newProductPath,
      planName: newPlan.name,
      interval: newPlan.interval,
      price: newPlan.amount,
      // Interval may have changed (e.g. monthly -> yearly), so the schedule
      // has to be recomputed rather than left on the old cadence.
      nextBillingDate: computeNextBillingDate(newPlan.interval),
    },
    "plan_changed",
    `${sub.planName || sub.product} -> ${newPlan.name} (${newPlan.interval})`
  );

  const delta = store.monthlyValue(updated) - oldMonthly;
  if (delta > 0) store.recordMrrEvent("expansion", subscriptionId, delta);
  else if (delta < 0) store.recordMrrEvent("contraction", subscriptionId, delta);

  return { subscription: updated, delta, fastspringResponse: response };
}

/** Prorated cost preview for a prospective change, without applying it. */
async function previewPlanChange(subscriptionId, newProductPath, quantity = 1) {
  return fastspring.estimateProration(subscriptionId, newProductPath, quantity);
}

/**
 * Cancel. `immediate` deactivates now; otherwise it ends at period end and the
 * customer keeps access until then.
 *
 * Records churn locally rather than waiting for a webhook, because FastSpring
 * confirmed it does NOT send subscription.canceled for managed subscriptions
 * (or for any cancel using billingPeriod=0). Waiting for that webhook would
 * mean churn silently never being recorded.
 */
async function cancel(subscriptionId, { immediate = false, reason = "voluntary" } = {}) {
  const sub = store.get(subscriptionId);
  if (!sub) throw new Error(`Unknown subscription: ${subscriptionId}`);

  const response = await fastspring.cancelSubscription(subscriptionId, immediate);

  if (immediate) {
    markChurned(subscriptionId, reason);
  } else {
    // Still generating revenue until the period ends, so no churn event yet -
    // recording it now would understate MRR for the rest of the paid period.
    store.upsert(
      subscriptionId,
      { cancelAtPeriodEnd: true, pendingChurnReason: reason },
      "cancel_scheduled",
      `Ends ${sub.nextBillingDate || "at period end"}`
    );
  }

  return { subscription: store.get(subscriptionId), fastspringResponse: response };
}

/**
 * Move a subscription to churned and record the negative MRR event. Called on
 * immediate cancel, when a scheduled cancel reaches its end date, and when
 * dunning gives up.
 */
function markChurned(subscriptionId, reason) {
  const sub = store.get(subscriptionId);
  if (!sub) return null;
  if (["canceled", "deactivated"].includes(sub.status)) return sub;

  const lostMrr = store.monthlyValue(sub);
  const updated = store.upsert(
    subscriptionId,
    {
      status: "canceled",
      cancelAtPeriodEnd: false,
      churnedAt: new Date().toISOString(),
      churnReason: reason || sub.pendingChurnReason || "voluntary",
      dunning: null,
      nextBillingDate: null,
    },
    "churned",
    reason || sub.pendingChurnReason || "voluntary"
  );

  store.recordMrrEvent("churn", subscriptionId, -lostMrr);
  return updated;
}

async function pause(subscriptionId) {
  const response = await fastspring.pauseSubscription(subscriptionId);
  store.upsert(subscriptionId, { status: "paused" }, "paused");
  return { subscription: store.get(subscriptionId), fastspringResponse: response };
}

async function resume(subscriptionId) {
  const sub = store.get(subscriptionId);
  const response = await fastspring.resumeSubscription(subscriptionId);
  store.upsert(
    subscriptionId,
    {
      status: "active",
      nextBillingDate: computeNextBillingDate(sub ? sub.interval : "month"),
    },
    "resumed"
  );
  return { subscription: store.get(subscriptionId), fastspringResponse: response };
}

module.exports = {
  activate,
  changePlan,
  previewPlanChange,
  cancel,
  markChurned,
  pause,
  resume,
  computeNextBillingDate,
};
