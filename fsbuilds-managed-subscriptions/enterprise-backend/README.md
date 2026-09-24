# SyncWrx Subscription Management Backend

A mock subscription management platform sitting on top of FastSpring, which
acts as **storefront, checkout, and merchant of record**.

This is the "third-party software that handles everything and tells FastSpring
what to do" half of the managed subscriptions demo.

---

## What owns what

| FastSpring owns | This backend owns |
|---|---|
| Storefront and checkout | **When** a subscription bills |
| Payment methods and card data | Retry / dunning policy on failed payments |
| Actually moving money | Plan change decisions (upgrade/downgrade) |
| Tax, VAT, invoices, receipts | MRR, ARR, churn, MRR movement |
| Refunds and chargebacks | Which subscriptions are past due vs churned |
| Customer account portal | Involuntary vs voluntary churn attribution |
| Merchant-of-record compliance | |

That split is what a subscription management platform actually *is* when the
payment provider is a merchant of record: the provider handles money and
compliance, the platform handles billing logic and revenue intelligence. This
backend never sees card data.

**Why this backend is mandatory here, not optional:** a Managed subscription
has no FastSpring-tracked billing cycle at all. If the billing loop in
`server/billing.js` never runs, nobody is ever charged. For a Standard
FastSpring subscription this whole service would be redundant.

---

## The loop

```
  storefront (:4000)                    this backend (:4100)
        |                                       |
        |-- customer subscribes -->  FastSpring |
        |                                       |
        |        subscription.activated ------->| records sub, sets its own
        |                                       | nextBillingDate, +new MRR
        |                                       |
        |                    [billing loop sees it's due]
        |                                       |
        |                                       |-- POST /subscriptions/charge --> FastSpring
        |                                       |
        |    subscription.charge.completed ---->| advance schedule, clear dunning
        |              or .failed  ------------>| -> dunning: retry in 1/3/5 days
        |                                       |    -> exhausted: involuntary churn
```

Note that both halves go **through FastSpring** — the storefront and this
backend never talk to each other directly. That's the accurate shape for a
real integration.

---

## Setup

### 1. API credentials

FastSpring app > **Developer Tools > APIs > API Credentials**. Server-to-server
only; never exposed to a browser. Put them in `.env` as
`FASTSPRING_API_USERNAME` / `FASTSPRING_API_PASSWORD`.

There is **one active credential pair per Store**, and resetting it invalidates
the old pair everywhere it's already in use — so if something else is already
using them, reuse the existing pair rather than generating new ones.

### 2. Webhook

FastSpring app > **Developer Tools > Webhooks**. Point it at
`<your-ngrok-url>/webhooks/fastspring` and subscribe to at least:

- `subscription.activated`
- `subscription.charge.completed`
- `subscription.charge.failed`
- `subscription.deactivated`
- `subscription.payment.overdue`
- `subscription.paused` / `subscription.resumed`

Set a **Secret Key** on the webhook and put the same value in `.env` as
`FASTSPRING_WEBHOOK_SECRET`. Every inbound request is verified against the
`X-FS-Signature` header (HMAC-SHA256 of the raw body, base64). Without the
secret set, the server still runs but accepts webhooks unverified and warns
loudly on every request.

### 3. Expose the port publicly

FastSpring's webhooks need to reach this server over the internet:

```bash
ngrok http 4100
```

Use the printed `https://…ngrok…` URL as the webhook URL above. **ngrok's
free-tier URL changes every restart** — if subscriptions stop appearing on the
dashboard, check this first.

### 4. Plan catalog

`config/plans.js` maps each FastSpring product path to its `interval` and
`amount`. This has to exist locally: FastSpring isn't tracking a billing cycle
for managed subscriptions, so the interval here is the source of truth for both
scheduling and MRR normalization. Keep it in sync with FastSpring's real
prices by hand — nothing validates it for you.

### 5. Run it

```bash
npm install
cp .env.example .env
# fill in credentials per the steps above
npm start
```

Success looks like `Subscription backend running at http://localhost:4100`.
Open that URL for the dashboard.

---

## Demoing it without waiting a month

Real billing cycles are months long. Two ways to make a full cycle observable:

- **"Mark due" button** on any subscription sets its next billing date to now;
  the next billing run picks it up. Doesn't touch FastSpring.
- **`DEMO_CYCLE_MINUTES` / `DEMO_RETRY_MINUTES`** in `.env` compress every
  interval and dunning retry to that many minutes, so a full
  bill → fail → retry → recover loop runs in minutes. Leave blank for real
  calendar cycles.

Suggested demo script:
1. Subscribe on the storefront → subscription appears here, MRR goes up.
2. Click **Mark due**, then **Run billing cycle now** → charge fires.
3. Change plan to a higher tier → watch **Expansion** MRR move.
4. Cancel at period end → note MRR *doesn't* drop yet (still paid through).
5. Cancel immediately → MRR drops, churn recorded.

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/subscriptions` | All subscription records |
| `GET` | `/api/subscriptions/:id` | One subscription with history |
| `GET` | `/api/metrics?windowDays=30` | MRR, ARR, churn, MRR movement |
| `GET` | `/api/plans` | Plan catalog with normalized monthly values |
| `POST` | `/api/subscriptions/:id/charge` | Charge now (manual rebill) |
| `POST` | `/api/subscriptions/:id/change-plan` | Upgrade/downgrade (`{product, prorate}`) |
| `POST` | `/api/subscriptions/:id/preview-change` | Prorated cost preview, no change applied |
| `POST` | `/api/subscriptions/:id/cancel` | Cancel (`{immediate, reason}`) |
| `POST` | `/api/subscriptions/:id/pause` / `/resume` | Pause / resume billing |
| `POST` | `/api/billing/run` | Run the billing loop immediately |
| `POST` | `/api/subscriptions/:id/simulate-due` | **Demo only** — mark due now |
| `POST` | `/webhooks/fastspring` | Inbound FastSpring events (signed) |

---

## How the metrics work

- **MRR** normalizes every plan to a monthly figure, so a $599.99/yr plan
  counts as $50.00 MRR rather than a spike in whichever month it billed.
- **`past_due` counts as active.** A declined card is not a lost customer.
  It only becomes churn when dunning gives up — otherwise recoverable payment
  failures would be reported as real churn.
- **MRR movement** breaks the change into new / expansion / contraction /
  churn / reactivation, which reconciles to the net change. A single MRR
  number doesn't tell you *why* it moved.
- **Churn is reported two ways** — customer churn (subscriptions lost) and
  revenue churn (MRR lost). They diverge when the customers who leave are
  worth more or less than average, so reporting only one is misleading.
- **Involuntary churn is broken out separately** — subscriptions lost to
  failed payments rather than a deliberate cancel. It's the recoverable kind,
  and lumping it in with voluntary churn hides the fix.
- **Churn rates show `n/a`, not 0%, when there was no baseline** at the start
  of the window (normal in a fresh demo where everything was created during the
  window). Showing 0% right after losing a customer would read as "no churn".

---

## Things that are NOT verified against live FastSpring

Being explicit so nothing here reads as more proven than it is:

- **Proration on managed subscriptions.** `prorate: true` is passed on plan
  changes and is well documented for standard subscriptions, but a managed
  subscription has no billing period for FastSpring to prorate against, so the
  behavior may differ or be ignored. This backend's own MRR math updates
  immediately on plan change either way and is the source of truth for
  reporting. **Test this before demoing an upgrade as "prorated".**
- **Charge rate limits.** FastSpring's older docs described renewal limits
  (per day / per 30 days) on on-demand subscriptions. Whether equivalent limits
  apply to the current `/subscriptions/charge` endpoint is unconfirmed — worth
  checking before any high-volume batch demo.
- **`subscription.canceled` does not fire for managed subscriptions** — this
  one *is* confirmed in FastSpring's docs. It's why cancellations are recorded
  locally at the time of the API call rather than waiting for a webhook.
  Handled, but worth knowing if you extend the webhook logic.

---

## Structure

```
config/plans.js       product path -> interval + price (source of truth locally)
server/
  index.js            express wiring, REST API, scheduler startup
  store.js            JSON persistence, MRR normalization
  fastspring.js       every outbound FastSpring API call
  subscriptions.js    lifecycle transitions + their revenue impact
  billing.js          billing loop + dunning engine
  metrics.js          MRR / ARR / churn / movement
  webhooks.js         inbound events, signature verification
public/               dashboard
data/                 subscriptions.json (gitignored, created on first run)
```

Persistence is a JSON file on purpose — zero setup, but it survives restarts so
revenue history isn't wiped every time you stop the server. Swap `store.js` for
a real database if this ever becomes more than a demo; nothing else touches the
filesystem.
