/**
 * FASTSPRING API CLIENT
 * ============================================================================
 * Every outbound call to FastSpring lives here. HTTP Basic Auth with the API
 * credentials from .env (Developer Tools > APIs > API Credentials) - these are
 * server-to-server only and must never reach the browser.
 *
 * WHAT FASTSPRING OWNS vs WHAT THIS BACKEND OWNS
 * FastSpring is the storefront, checkout, and merchant of record: it holds the
 * payment methods, runs the actual charges, handles tax/compliance, and owns
 * the customer billing relationship. This backend never touches card data - it
 * only ever tells FastSpring "charge this subscription now" and reacts to what
 * comes back. That division is the whole point of the MoR model.
 */

const BASE = "https://api.fastspring.com";

function authHeader() {
  const { FASTSPRING_API_USERNAME, FASTSPRING_API_PASSWORD } = process.env;
  if (!FASTSPRING_API_USERNAME || !FASTSPRING_API_PASSWORD) {
    throw new Error(
      "FASTSPRING_API_USERNAME / FASTSPRING_API_PASSWORD are not set in .env - " +
        "see README for how to find these in FastSpring's Developer Tools."
    );
  }
  const encoded = Buffer.from(
    `${FASTSPRING_API_USERNAME}:${FASTSPRING_API_PASSWORD}`
  ).toString("base64");
  return `Basic ${encoded}`;
}

async function request(method, endpoint, body) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(`FastSpring ${method} ${endpoint} failed (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Charge a managed subscription immediately.
 *
 * This is the endpoint that makes managed subscriptions "managed" - FastSpring
 * tracks no schedule of its own, so nothing bills until this is called.
 *
 * IMPORTANT: a 200 here means FastSpring ACCEPTED the request, not that the
 * money moved. The real outcome arrives asynchronously as a
 * subscription.charge.completed or subscription.charge.failed webhook. Never
 * mark a subscription paid based on this response alone.
 *
 * Partial failures in a batch are reported per-subscription rather than as a
 * whole-batch failure, so check each entry's `result` individually. FastSpring
 * recommends a max of ~50 IDs per request.
 */
async function chargeSubscriptions(subscriptionIds) {
  return request("POST", "/subscriptions/charge", {
    subscriptions: subscriptionIds.map((id) => ({ subscription: id })),
  });
}

/**
 * Change the product (upgrade/downgrade) and/or quantity on a subscription.
 *
 * `prorate: true` asks FastSpring to calculate prorated charges/credits for the
 * switch. NOT VERIFIED against a live managed subscription in this build -
 * proration is well documented for standard subscriptions, but managed
 * subscriptions have no billing period for FastSpring to prorate against, so
 * the behavior here may differ or be ignored. Test before relying on it, and
 * treat this backend's own MRR math (which updates immediately on plan change)
 * as the source of truth for reporting either way.
 */
async function changePlan(subscriptionId, productPath, quantity, prorate) {
  return request("POST", "/subscriptions", {
    subscriptions: [
      {
        subscription: subscriptionId,
        product: productPath,
        quantity: quantity || 1,
        prorate: !!prorate,
      },
    ],
  });
}

/**
 * Preview prorated charges/credits for a change WITHOUT applying it, so a
 * dashboard can show "this upgrade will cost $X now" before committing.
 * Same caveat as changePlan() about managed subscriptions.
 */
async function estimateProration(subscriptionId, productPath, quantity) {
  return request("POST", "/subscriptions/estimate", {
    subscriptions: [
      {
        subscription: subscriptionId,
        product: productPath,
        quantity: quantity || 1,
        prorate: true,
        preview: true,
      },
    ],
  });
}

/**
 * Cancel a subscription.
 *
 * Default (immediate=false) cancels at the end of the current period - the
 * customer keeps access to what they paid for. Passing immediate=true adds
 * billingPeriod=0, which deactivates right away.
 *
 * CONFIRMED GOTCHA: FastSpring does NOT send a subscription.canceled webhook
 * for managed subscriptions (nor when billingPeriod=0 is used). So this
 * backend cannot learn about its own cancellations by waiting for a webhook -
 * it records the cancellation locally at the moment it issues the call. See
 * subscriptions.js's cancel handler.
 */
async function cancelSubscription(subscriptionId, immediate) {
  const query = immediate ? "?billingPeriod=0" : "";
  return request("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}${query}`);
}

/** Pause billing. FastSpring sends subscription.paused when this takes effect. */
async function pauseSubscription(subscriptionId) {
  return request("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/pause`);
}

/** Resume a paused subscription. */
async function resumeSubscription(subscriptionId) {
  return request("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/resume`);
}

/** Fetch current state straight from FastSpring - useful for reconciliation. */
async function getSubscription(subscriptionId) {
  return request("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

module.exports = {
  chargeSubscriptions,
  changePlan,
  estimateProration,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getSubscription,
};
