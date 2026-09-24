/**
 * SYNCWRX SUBSCRIPTION MANAGEMENT BACKEND
 * ============================================================================
 * A mock subscription management platform sitting on top of FastSpring, which
 * acts as storefront, checkout, and merchant of record.
 *
 * DIVISION OF RESPONSIBILITY
 *   FastSpring owns: the storefront and checkout, payment methods and card
 *     data, actually moving money, tax/VAT, invoices and receipts, refunds,
 *     the customer-facing account portal, compliance as merchant of record.
 *   This backend owns: when a subscription bills (managed subscriptions have
 *     no FastSpring-side schedule), retry/dunning policy on failed payments,
 *     plan change decisions, and all recurring-revenue reporting - MRR, ARR,
 *     churn, and MRR movement.
 *
 * That split is what a subscription management platform actually is when the
 * payment provider is a merchant of record: the provider handles money and
 * compliance, the platform handles billing logic and revenue intelligence.
 *
 * Modules:
 *   store.js         persistence + MRR normalization
 *   fastspring.js    every outbound FastSpring API call
 *   subscriptions.js lifecycle transitions and their revenue impact
 *   billing.js       the billing loop and dunning engine
 *   metrics.js       MRR / ARR / churn / movement
 *   webhooks.js      inbound events from FastSpring
 */

require("dotenv").config();
const express = require("express");

const store = require("./store");
const billing = require("./billing");
const metrics = require("./metrics");
const webhooks = require("./webhooks");
const subscriptions = require("./subscriptions");
const plans = require("../config/plans");

const app = express();
const PORT = process.env.PORT || 4100;

// ---------------------------------------------------------------------------
// Webhooks - mounted BEFORE the global JSON parser so the raw body survives
// for signature verification.
// ---------------------------------------------------------------------------
app.post(
  "/webhooks/fastspring",
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  webhooks.createHandler()
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Read APIs
// ---------------------------------------------------------------------------

app.get("/api/transactions", (_req, res) => {
  // Attach the store's siteId to every transaction so the dashboard can build
  // deep links even when Webhook Expansion isn't enabled (siteId is stable per
  // store, so using the env var as a fallback is safe).
  const siteIdFallback = process.env.FASTSPRING_SITE_ID || null;
  const txs = store.transactions(50).map((tx) => ({
    ...tx,
    siteId: tx.siteId || siteIdFallback,
  }));
  res.json(txs);
});

app.get("/api/subscriptions", (_req, res) => {
  res.json(
    store.all().sort((a, b) => (a.activatedAt || "").localeCompare(b.activatedAt || ""))
  );
});

app.get("/api/subscriptions/:id", (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: "Not found" });
  res.json(sub);
});

app.get("/api/metrics", (req, res) => {
  const windowDays = parseInt(req.query.windowDays, 10) || 30;
  res.json(metrics.summary(windowDays));
});

app.get("/api/plans", (_req, res) => {
  res.json(
    Object.entries(plans).map(([path, plan]) => ({
      path,
      ...plan,
      monthlyValue: Math.round(store.toMonthly(plan.amount, plan.interval) * 100) / 100,
    }))
  );
});

// ---------------------------------------------------------------------------
// Write APIs - each wraps a FastSpring call plus local revenue bookkeeping
// ---------------------------------------------------------------------------

function asyncRoute(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      console.error(`${req.method} ${req.path} failed:`, err.message);
      res.status(err.status || 500).json({ error: err.message, detail: err.data || null });
    });
  };
}

/** Update subscription price for this period without changing the plan. */
app.post(
  "/api/subscriptions/:id/update-price",
  asyncRoute(async (req, res) => {
    const { price, note } = req.body || {};
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: "A valid price greater than 0 is required." });
    }

    // Confirmed from FastSpring's managed subscription docs:
    // POST /subscriptions with pricing.price.USD = new amount updates the
    // price for the next charge without changing the plan product. Each
    // rebill charges the original amount unless explicitly updated this way.
    const response = await fetch("https://api.fastspring.com/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: (() => {
          const { FASTSPRING_API_USERNAME, FASTSPRING_API_PASSWORD } = process.env;
          if (!FASTSPRING_API_USERNAME || !FASTSPRING_API_PASSWORD)
            throw new Error("FASTSPRING_API_USERNAME / FASTSPRING_API_PASSWORD not set in .env");
          return "Basic " + Buffer.from(`${FASTSPRING_API_USERNAME}:${FASTSPRING_API_PASSWORD}`).toString("base64");
        })(),
      },
      body: JSON.stringify({
        subscriptions: [{
          subscription: req.params.id,
          pricing: { price: { USD: Number(price) } },
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Update the local record so the dashboard reflects the pending price
    // immediately rather than waiting for a webhook (subscription.updated
    // fires for this, but doesn't carry the new price in its payload).
    store.upsert(
      req.params.id,
      { pendingPrice: Number(price) },
      "price_updated",
      note ? `Custom price $${price}: ${note}` : `Custom price $${price}`
    );

    res.json({ accepted: true, price: Number(price), fastspringResponse: data });
  })
);

/** Charge now, ignoring the schedule. The manual "rebill" button. */
app.post(
  "/api/subscriptions/:id/charge",
  asyncRoute(async (req, res) => {
    const result = await billing.chargeOne(req.params.id);
    res.json(result);
  })
);

/** Upgrade or downgrade. */
app.post(
  "/api/subscriptions/:id/change-plan",
  asyncRoute(async (req, res) => {
    const { product, prorate = true, quantity = 1 } = req.body || {};
    if (!product) return res.status(400).json({ error: "product is required" });
    const result = await subscriptions.changePlan(req.params.id, product, { prorate, quantity });
    res.json(result);
  })
);

/** Preview prorated cost of a change without applying it. */
app.post(
  "/api/subscriptions/:id/preview-change",
  asyncRoute(async (req, res) => {
    const { product, quantity = 1 } = req.body || {};
    if (!product) return res.status(400).json({ error: "product is required" });
    res.json(await subscriptions.previewPlanChange(req.params.id, product, quantity));
  })
);

app.post(
  "/api/subscriptions/:id/cancel",
  asyncRoute(async (req, res) => {
    const { immediate = false, reason = "voluntary" } = req.body || {};
    res.json(await subscriptions.cancel(req.params.id, { immediate, reason }));
  })
);

app.post(
  "/api/subscriptions/:id/pause",
  asyncRoute(async (req, res) => {
    res.json(await subscriptions.pause(req.params.id));
  })
);

app.post(
  "/api/subscriptions/:id/resume",
  asyncRoute(async (req, res) => {
    res.json(await subscriptions.resume(req.params.id));
  })
);

/** Run the billing loop immediately instead of waiting for the next tick. */
app.post(
  "/api/billing/run",
  asyncRoute(async (_req, res) => {
    res.json(await billing.runBillingCycle());
  })
);

/**
 * DEMO ONLY: mark a subscription due right now, so the next billing run picks
 * it up. Lets you demonstrate a full billing cycle in seconds instead of
 * waiting a month. Does not touch FastSpring - it only moves this backend's
 * own schedule.
 */
app.post("/api/subscriptions/:id/simulate-due", (req, res) => {
  const sub = store.get(req.params.id);
  if (!sub) return res.status(404).json({ error: "Not found" });
  store.upsert(
    req.params.id,
    { nextBillingDate: new Date().toISOString() },
    "simulated_due",
    "Demo: forced due now"
  );
  res.json(store.get(req.params.id));
});

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`Subscription backend running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint at http://localhost:${PORT}/webhooks/fastspring`);
  console.log(
    "Reminder: this port needs a public tunnel (e.g. ngrok) before FastSpring's " +
      "webhooks can reach it - see README."
  );
  billing.startScheduler();
});
