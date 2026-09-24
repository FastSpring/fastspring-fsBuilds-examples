/**
 * PLAN CATALOG
 * ============================================================================
 * Maps FastSpring product paths to the billing interval and list price this
 * backend uses for scheduling and revenue math.
 *
 * WHY THIS FILE HAS TO EXIST (it isn't duplication for its own sake):
 * A Managed subscription has NO FastSpring-tracked billing cycle - FastSpring's
 * own product setup docs say to skip the Billing Cycle field entirely for that
 * subscription type. FastSpring is not tracking "monthly" or "yearly" for these
 * products anywhere. That means:
 *
 *   - The billing SCHEDULE is this backend's responsibility, not FastSpring's.
 *     Nothing charges unless this backend calls the charge endpoint.
 *   - The interval below is the source of truth for when a subscription is due
 *     and for normalizing revenue into MRR. It is not read from FastSpring and
 *     will not be validated against it.
 *
 * `amount` is a fallback only. When a webhook gives a real price for a
 * subscription, that wins (see store.js's priceFor()). Keep these in sync with
 * FastSpring's actual product prices anyway, so revenue math is still sane
 * before the first webhook arrives for a given plan.
 */

module.exports = {
  "essentials-monthly": { name: "Essentials", interval: "month", amount: 19.99 },
  "essentials-yearly": { name: "Essentials", interval: "year", amount: 199.99 },
  "professional-monthly": { name: "Professional", interval: "month", amount: 39.99 },
  "professional-yearly": { name: "Professional", interval: "year", amount: 399.99 },
  "advanced-monthly": { name: "Advanced", interval: "month", amount: 59.99 },
  "advanced-yearly": { name: "Advanced", interval: "year", amount: 599.99 },
};
