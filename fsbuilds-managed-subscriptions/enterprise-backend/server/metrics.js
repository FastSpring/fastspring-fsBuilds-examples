/**
 * METRICS
 * ============================================================================
 * MRR, ARR, churn, and MRR movement.
 *
 * These are computed HERE, not fetched from FastSpring. FastSpring reports on
 * orders and transactions; recurring-revenue metrics are a modelling decision
 * on top of that (how you normalize a yearly plan into a monthly figure, what
 * counts as churned, whether a downgrade is contraction or partial churn).
 * Subscription management platforms own this layer, which is exactly why it
 * lives in this backend rather than being read from the payment provider.
 *
 * Every figure below derives from two things: the current subscription records
 * and the append-only MRR event log. No separate reporting pipeline.
 */

const store = require("./store");

const ACTIVE_STATUSES = ["active", "past_due"];

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Current MRR: every subscription still generating revenue, normalized to a
 * monthly figure.
 *
 * `past_due` counts as active on purpose - a failed payment being retried is
 * not the same as a lost customer, and writing it off as churn the moment a
 * card declines would make involuntary churn look like real churn. It only
 * becomes churn when dunning gives up (see billing.js).
 */
function currentMrr() {
  return round(
    store
      .all()
      .filter((s) => ACTIVE_STATUSES.includes(s.status))
      .reduce((sum, s) => sum + store.monthlyValue(s), 0)
  );
}

function currentArr() {
  return round(currentMrr() * 12);
}

function countsByStatus() {
  const counts = {};
  store.all().forEach((s) => {
    counts[s.status] = (counts[s.status] || 0) + 1;
  });
  return counts;
}

/**
 * MRR movement over a window - the breakdown of WHY revenue moved, which is
 * the part a single MRR number hides. New + expansion - contraction - churn
 * reconciles to the net change over the period.
 */
function mrrMovement(windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = store.mrrEvents().filter((e) => new Date(e.at).getTime() >= cutoff);

  const movement = { new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0 };
  events.forEach((e) => {
    if (movement[e.type] === undefined) return;
    movement[e.type] += e.amount;
  });

  Object.keys(movement).forEach((k) => {
    movement[k] = round(movement[k]);
  });
  movement.net = round(
    movement.new + movement.expansion + movement.reactivation + movement.contraction + movement.churn
  );
  return movement;
}

/**
 * Churn over a window, both ways subscription platforms report it:
 *
 *   customerChurnRate  churned subscriptions / subscriptions active at window start
 *   revenueChurnRate   churned MRR / MRR at window start
 *
 * They differ when churned customers are worth more or less than average - a
 * few large accounts leaving can mean low customer churn but severe revenue
 * churn, which is why reporting only one of them is misleading.
 *
 * "Active at window start" is reconstructed by taking today's active count and
 * reversing the events in the window. That is honest for a demo but it is an
 * approximation: it can't see subscriptions that both started and churned
 * before the window began.
 */
function churn(windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const events = store.mrrEvents().filter((e) => new Date(e.at).getTime() >= cutoff);

  const churnEvents = events.filter((e) => e.type === "churn");
  const newEvents = events.filter((e) => e.type === "new");

  const activeNow = store.all().filter((s) => ACTIVE_STATUSES.includes(s.status)).length;
  const startingActive = activeNow - newEvents.length + churnEvents.length;

  const mrrNow = currentMrr();
  const movement = mrrMovement(windowDays);
  const startingMrr = mrrNow - movement.net;

  // churn amounts are stored negative; flip for a readable rate
  const churnedMrr = round(Math.abs(churnEvents.reduce((sum, e) => sum + e.amount, 0)));

  // When nothing was active at the start of the window there is no meaningful
  // denominator, so the rate is null rather than 0. Reporting 0% right after
  // losing a customer would read as "no churn happened" - the opposite of the
  // truth. This is the normal case for a fresh demo where every subscription
  // was created during the window.
  return {
    windowDays,
    churnedSubscriptions: churnEvents.length,
    churnedMrr,
    startingActive: Math.max(startingActive, 0),
    startingMrr: round(Math.max(startingMrr, 0)),
    customerChurnRate:
      startingActive > 0 ? round((churnEvents.length / startingActive) * 100) : null,
    revenueChurnRate: startingMrr > 0 ? round((churnedMrr / startingMrr) * 100) : null,
  };
}

/**
 * Involuntary churn: subscriptions lost to failed payments rather than a
 * deliberate cancellation. Broken out separately because it's the one kind of
 * churn that's directly recoverable through better dunning - lumping it in
 * with voluntary churn hides the fix.
 */
function involuntaryChurn(windowDays) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const lost = store.all().filter((s) => {
    if (s.status !== "canceled" && s.status !== "deactivated") return false;
    if (!s.churnedAt || new Date(s.churnedAt).getTime() < cutoff) return false;
    return s.churnReason === "dunning_exhausted";
  });
  return {
    count: lost.length,
    mrr: round(lost.reduce((sum, s) => sum + store.monthlyValue(s), 0)),
  };
}

function summary(windowDays = 30) {
  return {
    mrr: currentMrr(),
    arr: currentArr(),
    activeSubscriptions: store.all().filter((s) => ACTIVE_STATUSES.includes(s.status)).length,
    totalSubscriptions: store.all().length,
    countsByStatus: countsByStatus(),
    movement: mrrMovement(windowDays),
    churn: churn(windowDays),
    involuntaryChurn: involuntaryChurn(windowDays),
  };
}

module.exports = { summary, currentMrr, currentArr, mrrMovement, churn, involuntaryChurn };
