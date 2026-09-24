/**
 * WEBHOOK RECEIVER
 * ============================================================================
 * Inbound events from FastSpring. This is the "FastSpring reports everything
 * back" half of the two-way loop - the backend tells FastSpring to charge, and
 * FastSpring tells the backend what actually happened.
 *
 * SIGNATURE VERIFICATION
 * FastSpring signs the RAW request body with HMAC-SHA256 using the webhook's
 * Secret Key, base64-encoded, in the X-FS-Signature header. The raw bytes must
 * be captured before JSON parsing and verified against those exact bytes -
 * re-serializing the parsed JSON changes key order and whitespace and breaks
 * verification in ways that are painful to debug.
 */

const crypto = require("crypto");
const store = require("./store");
const billing = require("./billing");
const subscriptions = require("./subscriptions");

function isValidSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true; // unverified mode - warned about below
  if (!signatureHeader) return false;

  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  // Constant-time compare so this can't leak how many characters matched.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Pulls a price out of a webhook payload if one is present. Real prices from
 * FastSpring beat the plan catalog's fallback amounts, since they reflect
 * discounts, currency, and anything else applied at checkout.
 */
function extractPrice(data) {
  const candidates = [data.price, data.subtotal, data.total];
  for (const value of candidates) {
    if (typeof value === "number" && value > 0) return value;
  }
  return null;
}

function handleEvent(event) {
  const type = event.type;
  const data = event.data || {};

  // With Webhook Expansion enabled, data.subscription may be a full object
  // rather than a bare ID string (confirmed from real charge.completed payload).
  // Extract the string ID from either shape.
  const rawSub = data.subscription || data.id;
  const subId = rawSub && typeof rawSub === "object"
    ? (rawSub.subscription || rawSub.id)
    : rawSub;

  if (!subId) {
    console.warn(`Webhook "${type}" had no subscription ID - skipping.`);
    return;
  }

  switch (type) {
    case "subscription.activated":
      subscriptions.activate({
        subscriptionId: subId,
        // Confirmed from real expanded payload: product path is at data.product.product
        // (data.product is an object with expansion enabled, not a bare string).
        // data.display is the customer-facing name, flat on data.
        productPath: (data.product && data.product.product) || data.product || data.sku,
        // data.account is an object with expansion enabled; .id is the account ID
        accountId: (data.account && (data.account.id || data.account.account)) || null,
        // data.price is flat on data (not nested), confirmed $1,499.99
        price: typeof data.price === "number" ? data.price : extractPrice(data),
        // intervalUnit/intervalLength are flat on data (not nested in a subscription object)
        // "adhoc" = managed subscription with no fixed schedule, as expected
        intervalUnit: data.intervalUnit || null,
        intervalLength: data.intervalLength || null,
        // planName: use data.display (flat) - "Professional" in this case
        planDisplayName: data.display || null,
        // siteId not present in subscription.activated payload even with expansion -
        // only appears on order-level events. Use FASTSPRING_SITE_ID env var instead.
        siteId: null,
      });
      console.log(`Activated: ${subId}`);
      break;

    // The real outcome of a charge request. Note this fires for charges this
    // backend triggered AND any charge FastSpring processes - so it's the
    // single source of truth for "did the money actually move".
    case "subscription.charge.completed":
      billing.handleChargeSuccess(subId);
      store.recordTransaction({
        subscriptionId: subId,
        event: "charge.completed",
        status: "completed",
        fastspringOrderId: (data.order && typeof data.order === "object" ? data.order.order : data.order) || null,
        fastspringReference: (data.order && data.order.reference) || null,
        // siteId confirmed in the subscription.charge.completed payload as order.siteId
        // Used to build the real FastSpring deep link:
        // https://app.fastspring.com/subscription/home.xml?mRef=Subscription:{subId}&cRef=BasicStoreSite:{siteId}
        siteId: (data.order && data.order.siteId) || null,
        invoiceUrl: (data.order && data.order.invoiceUrl) || null,
        amount: (data.order && data.order.total) || data.total || (store.get(subId) && store.get(subId).price) || null,
        product: (rawSub && typeof rawSub === "object" ? rawSub.product : null) || (store.get(subId) && store.get(subId).product) || null,
        planName: (rawSub && typeof rawSub === "object" ? rawSub.display : null) || (store.get(subId) && store.get(subId).planName) || null,
        intervalUnit: (rawSub && typeof rawSub === "object" ? rawSub.intervalUnit : null) || null,
        intervalLength: (rawSub && typeof rawSub === "object" ? rawSub.intervalLength : null) || null,
      });
      if (store.get(subId) && store.get(subId).pendingPrice) {
        store.upsert(subId, { pendingPrice: null }, "pending_price_cleared");
      }
      console.log(`Charge completed: ${subId}`);
      break;

    case "subscription.charge.failed":
      billing.handleChargeFailure(subId, "FastSpring reported charge.failed");
      store.recordTransaction({
        subscriptionId: subId,
        event: "charge.failed",
        status: "failed",
        amount: extractPrice(data) || (store.get(subId) && store.get(subId).price) || null,
        product: data.product || (store.get(subId) && store.get(subId).product) || null,
        planName: store.get(subId) && store.get(subId).planName || null,
      });
      console.log(`Charge FAILED: ${subId}`);
      break;

    // Fires when a customer misses a payment on FastSpring's side. Recorded but
    // doesn't drive dunning here - charge.failed is what this backend acts on,
    // and reacting to both would double-count retry attempts.
    case "subscription.payment.overdue":
      store.upsert(subId, { status: "past_due" }, "payment_overdue");
      break;

    case "subscription.deactivated":
      subscriptions.markChurned(subId, "deactivated");
      console.log(`Deactivated: ${subId}`);
      break;

    // NOTE: FastSpring does NOT send this for managed subscriptions, so this
    // case mostly won't fire in this build. Cancellations initiated here are
    // recorded locally at the time of the API call instead (see
    // subscriptions.js's cancel()). Handled anyway so a standard subscription
    // or a customer-portal cancellation isn't silently missed.
    case "subscription.canceled":
      store.upsert(subId, { cancelAtPeriodEnd: true }, "cancel_received_from_fastspring");
      break;

    case "subscription.uncanceled":
      store.upsert(
        subId,
        { cancelAtPeriodEnd: false, pendingChurnReason: null },
        "cancel_reversed"
      );
      break;

    case "subscription.paused":
      store.upsert(subId, { status: "paused" }, "paused");
      break;

    case "subscription.resumed":
      store.upsert(subId, { status: "active" }, "resumed");
      break;

    case "subscription.updated":
      // Recorded for the audit trail only. Plan-change revenue math happens in
      // subscriptions.changePlan() at the time of the change, because this
      // payload doesn't reliably carry the PREVIOUS price - and without the
      // old value there's no way to tell expansion from contraction.
      store.upsert(subId, {}, "updated_by_fastspring",
        (data.product && typeof data.product === "object" ? data.product.product : data.product) || null);
      break;

    default:
      if (store.get(subId)) store.upsert(subId, {}, `unhandled:${type}`);
      console.log(`Unhandled webhook type (logged only): ${type}`);
  }
}

function createHandler() {
  return (req, res) => {
    const secret = process.env.FASTSPRING_WEBHOOK_SECRET;
    const signature = req.header("X-FS-Signature");

    if (!isValidSignature(req.rawBody, signature, secret)) {
      console.warn("Rejected webhook: signature missing or did not match.");
      return res.status(401).json({ error: "Invalid signature" });
    }

    if (!secret) {
      console.warn(
        "FASTSPRING_WEBHOOK_SECRET is not set - accepting webhooks WITHOUT verifying " +
          "they came from FastSpring. Fine for a first local test, not for anything else."
      );
    }

    const events = (req.body && req.body.events) || [];
    events.forEach((event) => {
      try {
        handleEvent(event);
      } catch (err) {
        // One bad event shouldn't cost us the whole batch, and FastSpring needs
        // a prompt 200 regardless or it'll keep redelivering.
        console.error(`Error handling webhook event ${event.type}:`, err.message);
      }
    });

    res.status(200).json({ received: events.length });
  };
}

module.exports = { createHandler, isValidSignature };
