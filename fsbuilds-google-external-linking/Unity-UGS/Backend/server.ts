import express from 'express';
import dotenv from 'dotenv';
import { handler as encodeHandler } from './app/handler/encode';
import { handler as webhookHandler } from './app/handler/webhook';
import * as ugs from './app/utils/ugs';
import * as db from './app/utils/db';
import { reportTransactionToGoogle, getGoogleAuth, PACKAGE_NAME } from './app/utils/google';
import * as apple from './app/utils/apple';
import { google } from 'googleapis';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(express.json({
  // Captures the exact raw bytes of the request body before JSON parsing.
  // /webhook needs these to verify FastSpring's HMAC signature — re-
  // stringifying the already-parsed req.body could differ byte-for-byte
  // (key order, whitespace, unicode escaping) from what FastSpring signed.
  verify: (req: any, _res, buf: Buffer) => {
    req.rawBody = buf;
  }
}));

// Log every incoming request so Railway logs show whether the app/store page
// reached the server at all during a test run
app.use((req, _res, next) => {
  console.log(`[request] ${req.method} ${req.path}`);
  next();
});

app.use(express.static('./WebCode'));

// DEVELOPMENT/DEBUGGING: Version endpoint to verify Railway deployment
// Not required for production — can be removed
app.get('/version', (_req, res) => res.json({ version: '2.0', errorLogging: true }));

// /spend, /earn, /earnEggs, and /checkLevelUp all trust a raw client-
// reported integer with no server-side game state to validate it against
// (EggGameManager.cs runs the entire round — timer, spawns, hit detection,
// scoring — client-side; there's no round record on the server a Cloud
// Code script could check a reported amount against). This is a baseline
// sanity bound, not real anti-cheat: it only rejects obviously-garbage
// input (negative, zero, non-integer, or wildly out of range), not a
// moderately-inflated but plausible-looking value. This repo is a
// FastSpring integration demo, not a shipped game with a real coin
// economy, so a real fix (server-authoritative rounds) isn't warranted
// here — this just stops the most trivial abuse case.
//
// Separate caps per unit, not one flat number: EggGameManager's 30-second
// round sends the same _score value as both /earnEggs's score and
// /checkLevelUp's xpEarned, and real purchased amounts (GOOGLE_PRODUCT_GRANTS
// below) top out around 100 — a single cap sized loosely enough for coins
// would let an obviously-implausible egg/xp value straight through. These
// are still rough, generous ceilings for a demo, not tuned game-balance
// numbers — revisit with real design input if this economy ever matters.
const MAX_COIN_AMOUNT = 5000; // /spend, /earn
const MAX_EGG_AMOUNT = 1000; // /earnEggs — eggs are the rarer currency; real packs are ~10
const MAX_XP_AMOUNT = 5000; // /checkLevelUp — same underlying per-round score as coins

function parsePlausibleAmount(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) {
    return null;
  }
  return value;
}

app.post('/encode', async (req, res) => {
  try {
    const result = await encodeHandler({
      headers: { Authorization: req.headers.authorization },
      body: JSON.stringify(req.body)
    });
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('[encode] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/spend', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const amount = parsePlausibleAmount(req.body.amount, MAX_COIN_AMOUNT);

    if (!token || amount === null) {
      return res.status(400).json({ success: false, reason: 'Missing token or invalid amount' });
    }

    const playerId = await ugs.validateUnityToken(token);
    const serviceToken = await ugs.tokenExchange();
    const result = await ugs.spendCoins(serviceToken.accessToken, playerId, amount);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[spend] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/earn', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const amount = parsePlausibleAmount(req.body.amount, MAX_COIN_AMOUNT);

    if (!token || amount === null) {
      return res.status(400).json({ success: false, reason: 'Missing token or invalid amount' });
    }

    const playerId = await ugs.validateUnityToken(token);
    const serviceToken = await ugs.tokenExchange();
    const result = await ugs.earnCoins(serviceToken.accessToken, playerId, amount);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[earn] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/earnEggs', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const score = parsePlausibleAmount(req.body.score, MAX_EGG_AMOUNT);

    if (!token || score === null) {
      return res.status(400).json({ success: false, reason: 'Missing token or invalid score' });
    }

    const playerId = await ugs.validateUnityToken(token);
    const serviceToken = await ugs.tokenExchange();
    const result = await ugs.earnEggs(serviceToken.accessToken, playerId, score);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[earnEggs] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const result = await webhookHandler({
      headers: req.headers,
      rawBody: (req as any).rawBody,
      body: JSON.stringify(req.body)
    });
    res.status(result.statusCode).json(JSON.parse(result.body));
  } catch (error) {
    console.error('[webhook] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/checkLevelUp', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const xpEarned = parsePlausibleAmount(req.body.xpEarned, MAX_XP_AMOUNT);

    if (!token || xpEarned === null) {
      return res.status(400).json({ success: false, reason: 'Missing token or invalid xpEarned' });
    }

    const playerId = await ugs.validateUnityToken(token);
    const serviceToken = await ugs.tokenExchange();
    const result = await ugs.checkLevelUp(serviceToken.accessToken, playerId, xpEarned);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[checkLevelUp] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// The webhook (app/handler/webhook.ts) is now the primary trigger — it
// reports to Google immediately once it has real order data, which is the
// common case. This endpoint is the fallback for whatever's left: the
// webhook hasn't landed yet, or it landed but the report attempt itself
// failed. A short retry covers the first case; "usually" isn't good enough
// to build the whole system on, but as a fallback rather than the only path,
// 3 attempts x 1.5s is a reasonable wait before telling the client to come
// back later rather than blocking on it.
async function getGoogleTransactionRecordWithRetry(token: string, attempts = 3, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const record = await db.getGoogleTransactionRecord(token);
    if (record) return record;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

// Records the moment a player taps through Apple's disclosure notice, before
// they're sent to the web checkout. Apple's 7-day link-out commission window
// starts at that tap and Apple never sees it, so this is the system of record
// for it — durable storage, not a cache, since Apple can ask for these
// records (including taps that never became a sale) on audit.
app.post('/recordExternalPurchaseTap', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { externalPurchaseToken, externalPurchaseTokenType, productId, purchaseAttemptId } = req.body;

    if (!token || !externalPurchaseToken || !externalPurchaseTokenType || !productId) {
      return res.status(400).json({ success: false, reason: 'Missing token, externalPurchaseToken, externalPurchaseTokenType, or productId' });
    }

    const playerId = await ugs.validateUnityToken(token);
    const result = await db.recordExternalPurchaseTap(playerId, externalPurchaseToken, externalPurchaseTokenType, productId, purchaseAttemptId ?? null);

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[recordExternalPurchaseTap] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/reportTransaction', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { externalTransactionToken } = req.body;

    if (!token || !externalTransactionToken) {
      return res.status(400).json({ success: false, reason: 'Missing required fields' });
    }

    // Only used to confirm the token is a legitimate signed Unity token —
    // the lookup below is keyed by externalTransactionToken alone (a
    // Postgres primary key, globally unique), not by player, so the
    // playerId this returns isn't needed further.
    await ugs.validateUnityToken(token);

    const record = await getGoogleTransactionRecordWithRetry(externalTransactionToken);
    if (!record) {
      // Not a failure — the webhook likely just hasn't landed yet. 202 tells
      // the client "try again shortly," not "something is wrong."
      return res.status(202).json({ success: false, reason: 'Order not yet recorded — the order.completed webhook may not have arrived yet' });
    }

    if (record.reported_at) {
      // Already reported — almost always by the webhook itself, immediately
      // after it saved this record. Nothing left to do.
      return res.status(200).json({ success: true, result: { alreadyReported: true } });
    }

    // The record exists but the webhook's own report attempt hasn't
    // happened yet or failed — report it now, using the same stable
    // FastSpring order id the webhook would have used, so this stays safe
    // even if both paths end up racing.
    const result = await reportTransactionToGoogle(db.toGoogleTransactionReport(externalTransactionToken, record));

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.data });
    }

    await db.markGoogleTransactionReported(externalTransactionToken);

    res.status(200).json({ success: true, result: result.data });
  } catch (error: any) {
    console.error('[reportTransaction] Server error:', error.message);
    console.error('[reportTransaction] Error details:', JSON.stringify(error?.response?.data || {}, null, 2));
    res.status(500).json({ error: String(error) });
  }
});

// The one source of truth for what each Google Play productId grants —
// also what makes an unrecognized productId a hard error below instead of
// a silent no-op grant.
const GOOGLE_PRODUCT_GRANTS: Record<string, { currencyId: string; amount: number }> = {
  coinpack_100: { currencyId: 'COINS', amount: 100 },
  uncommoneggs_10: { currencyId: 'UNCOMMON_EGG', amount: 10 },
  rareeggs_10: { currencyId: 'RARE_EGG', amount: 10 },
  legendaryeggs_10: { currencyId: 'LEGENDARY_EGG', amount: 10 }
};

app.post('/validateGooglePurchase', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { productId, purchaseToken } = req.body;

    if (!token || !productId || !purchaseToken) {
      return res.status(400).json({ success: false, reason: 'Missing required fields' });
    }

    const grant = GOOGLE_PRODUCT_GRANTS[productId];
    if (!grant) {
      return res.status(400).json({ success: false, reason: `Unrecognized productId: ${productId}` });
    }

    // Validate UGS token
    const playerId = await ugs.validateUnityToken(token);

    // Validate Google Play purchase — reuses the same cached, already-
    // authenticated client as /reportTransaction and the webhook's Google
    // reporting (see app/utils/google.ts), instead of a second GoogleAuth
    // instance re-authenticating from scratch here too.
    const auth = getGoogleAuth();
    const androidPublisher = google.androidpublisher({ version: 'v3', auth });
    const purchaseInfo = await androidPublisher.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken
    });

    if (purchaseInfo.data.purchaseState !== 0) {
      return res.status(400).json({ success: false, reason: 'Purchase not valid' });
    }

    // Claim the purchase token before granting anything — the claim is the
    // race-safe guard against the same purchaseToken being resubmitted
    // concurrently, since Google's own validation above just confirms the
    // token is real, not that it hasn't already been redeemed here. Claiming
    // does NOT mean granted, though: a claim only moves to 'granted' after
    // the currency grant below actually succeeds, and moves to 'failed' (so
    // a later retry with the same token can reclaim and retry the grant)
    // if it doesn't. Marking the token used before confirming the grant
    // succeeded used to mean a UGS failure here permanently consumed a real
    // Google payment with no currency ever given and no way to recover it.
    const claim = await db.claimGooglePlayPurchaseForGrant(purchaseToken, playerId, productId);
    if (claim === 'already_granted') {
      return res.status(200).json({ success: true, result: { alreadyGranted: true } });
    }
    if (claim === 'already_pending') {
      return res.status(202).json({ success: false, reason: 'Purchase is already being processed — try again shortly' });
    }

    try {
      const serviceToken = await ugs.tokenExchange();
      const result = await ugs.grantCurrency(serviceToken.accessToken, playerId, grant.currencyId, grant.amount);
      await db.markGooglePlayPurchaseGranted(purchaseToken);
      res.status(200).json({ success: true, result });
    } catch (grantError) {
      await db.markGooglePlayPurchaseFailed(purchaseToken);
      throw grantError;
    }
  } catch (error) {
    console.error('[validateGooglePurchase] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Validates a real native Apple In-App Purchase (v1 iOS compliance path — no
// External Purchase entitlement yet, so real StoreKit IAP is required). The
// client sends its own copy of signedTransactionInfo only to point us at a
// transaction id; what actually gets trusted is Apple's own server response for
// that id (see app/utils/apple.ts for why).
app.post('/validateApplePurchase', async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { productId, signedTransactionInfo } = req.body;

    if (!token || !productId || !signedTransactionInfo) {
      return res.status(400).json({ success: false, reason: 'Missing token, productId, or signedTransactionInfo' });
    }

    const playerId = await ugs.validateUnityToken(token);

    const transactionId = apple.extractTransactionId(signedTransactionInfo);
    const transaction = await apple.fetchAuthoritativeTransaction(transactionId);

    if (transaction.revocationDate) {
      return res.status(400).json({ success: false, reason: 'Transaction was refunded or revoked' });
    }
    if (transaction.productId !== productId) {
      return res.status(400).json({ success: false, reason: 'Product id on the transaction does not match the request' });
    }

    // Matches the FastSpring catalog id ("coinpack-150") and grant amount, not
    // /validateGooglePurchase's coinpack_100/100 naming, so the same "Buy Coins"
    // button works for both the FastSpring path (Android/Editor, and iOS once
    // the External Purchase entitlement is granted) and this native fallback —
    // same product, same 150-coin result, regardless of which one runs.
    const serviceToken = await ugs.tokenExchange();
    let result;

    if (productId === 'coinpack-150') {
      result = await ugs.grantCurrency(serviceToken.accessToken, playerId, 'COINS', 150);
    }

    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[validateApplePurchase] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Apple Reporting: sends every un-reported external purchase tap to Apple's
// External Purchase Server API. Meant to run on a schedule (Apple requires
// reporting at least monthly, before the 15th) — see runReportExternalPurchases
// below, which both this route and the in-process scheduler (see
// startExternalPurchaseReportingScheduler) call, so there's exactly one
// implementation regardless of how it's triggered.
//
// Every unreported tap gets one of three outcomes:
// - Matched to a completed order -> reported as LINE_ITEM with the sale's
//   details.
// - Not matched, but still within Apple's 7-day window -> skipped for now;
//   it might still convert to a sale before the window closes.
// - Not matched, and past the 7-day window -> reported as NO_LINE_ITEM.
//   Apple requires reporting tokens that never convert too, not just ones
//   that do.
//
// EU purchases request BOTH an Acquisition and a Services token (see
// AppleExternalPurchaseManager.GetExternalPurchaseTokens), recorded as two
// rows sharing one purchase_attempt_id. Per Apple's own guidance (quoted in
// docs/apple-external-purchase-compliance.md): "When a customer has both an
// ACQUISITION and SERVICES token in the same active period, you can report
// transactions using just the SERVICES token, and report the ACQUISITION
// token without any transactions." So a pair that both matched the same
// order reports the sale once, against the SERVICES token, with the
// ACQUISITION token reported alongside as NO_LINE_ITEM — not as two
// independent LINE_ITEM reports of the same sale.
app.post('/reportExternalPurchases', async (_req, res) => {
  try {
    const result = await runReportExternalPurchases();
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[reportExternalPurchases] Server error:', error);
    res.status(500).json({ error: String(error) });
  }
});

async function runReportExternalPurchases() {
  const reported: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const taps = await db.getUnreportedTaps();

  // Group by purchase_attempt_id (falling back to the tap's own id as a
  // group of one, for taps recorded before this column existed, or a
  // Japan single-token tap, which is always a group of one anyway).
  const groups = new Map<string, typeof taps>();
  for (const tap of taps) {
    const key = tap.purchase_attempt_id || tap.id;
    const group = groups.get(key);
    if (group) group.push(tap);
    else groups.set(key, [tap]);
  }

  for (const group of groups.values()) {
    const services = group.find((t) => t.token_type === 'SERVICES');
    const acquisition = group.find((t) => t.token_type === 'ACQUISITION');
    const bothMatchedSameOrder =
      group.length === 2 &&
      services &&
      acquisition &&
      services.order_reference &&
      acquisition.order_reference === services.order_reference;

    if (bothMatchedSameOrder) {
      await reportMatchedTap(services!, 'LINE_ITEM', reported, failed);
      await reportUnmatchedOrPairedNoLineItem(acquisition!, reported, failed, { forceNoLineItem: true });
      continue;
    }

    for (const tap of group) {
      if (tap.order_reference) {
        await reportMatchedTap(tap, 'LINE_ITEM', reported, failed);
      } else {
        await reportUnmatchedOrPairedNoLineItem(tap, reported, failed, { forceNoLineItem: false, skipped });
      }
    }
  }

  return { reported, skipped, failed };
}

async function reportMatchedTap(
  tap: any,
  status: 'LINE_ITEM',
  reported: string[],
  failed: { id: string; error: string }[]
) {
  try {
    if (!tap.order_tax_country) {
      failed.push({ id: tap.id, error: 'Missing taxCountry — order had no address.country, or it did not map to an ISO alpha-3 code' });
      return;
    }

    const { externalPurchaseId } = apple.decodeExternalPurchaseToken(tap.token);
    const total = Number(tap.order_total);
    const tax = Number(tap.order_tax);

    await apple.submitExternalPurchaseReport({
      requestIdentifier: crypto.randomUUID(),
      externalPurchaseId,
      status,
      lineItems: [{
        lineItemId: tap.id,
        creationDate: new Date(tap.order_completed_at).getTime(),
        pricingCurrency: tap.order_currency,
        reportingCurrency: tap.order_currency,
        // Apple wants milli-units of the reporting currency.
        amountTaxExclusive: Math.round((total - tax) * 1000),
        amountTaxInclusive: Math.round(total * 1000),
        netAmountTaxExclusive: Math.round((total - tax) * 1000),
        taxAmount: Math.round(tax * 1000),
        taxCountry: tap.order_tax_country,
        productIdentifier: tap.product_id,
        quantity: 1,
        eventType: 'BUY',
        productType: 'ONE_TIME_BUY'
      }]
    });

    await db.markTapReported(tap.id);
    reported.push(tap.id);
  } catch (error) {
    console.error(`[reportExternalPurchases] Failed to report matched tap ${tap.id}:`, error);
    failed.push({ id: tap.id, error: String(error) });
  }
}

async function reportUnmatchedOrPairedNoLineItem(
  tap: any,
  reported: string[],
  failed: { id: string; error: string }[],
  opts: { forceNoLineItem: boolean; skipped?: string[] }
) {
  try {
    if (!opts.forceNoLineItem) {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const tappedAtMs = new Date(tap.tapped_at).getTime();
      if (Date.now() - tappedAtMs < sevenDaysMs) {
        opts.skipped?.push(tap.id);
        return;
      }
    }

    const { externalPurchaseId } = apple.decodeExternalPurchaseToken(tap.token);
    await apple.submitExternalPurchaseReport({
      requestIdentifier: crypto.randomUUID(),
      externalPurchaseId,
      status: 'NO_LINE_ITEM'
    });

    await db.markTapReported(tap.id);
    reported.push(tap.id);
  } catch (error) {
    console.error(`[reportExternalPurchases] Failed to report tap ${tap.id} as NO_LINE_ITEM:`, error);
    failed.push({ id: tap.id, error: String(error) });
  }
}

// Apple requires reporting external purchase tokens at least monthly
// (before the 15th); daily is the recommendation this project follows (see
// docs/apple-external-purchase-compliance.md). Nothing external (no Railway
// Cron Job, no platform scheduler) is required for this to run — it's a
// plain in-process timer that calls the same runReportExternalPurchases()
// the HTTP route uses, so the route stays a valid manual/on-demand trigger
// (e.g. for testing) while this loop is what actually keeps it current in
// production. A single `running` guard means a run that takes longer than
// the interval can't overlap itself; it can't overlap a manual POST to
// /reportExternalPurchases either, for the same reason.
let externalPurchaseReportingRunning = false;
const EXTERNAL_PURCHASE_REPORTING_INTERVAL_MS = 24 * 60 * 60 * 1000;

function startExternalPurchaseReportingScheduler() {
  const runOnce = async () => {
    if (externalPurchaseReportingRunning) {
      console.log('[reportExternalPurchases] Scheduled run skipped — a run is already in progress.');
      return;
    }
    externalPurchaseReportingRunning = true;
    try {
      const result = await runReportExternalPurchases();
      console.log('[reportExternalPurchases] Scheduled run complete:', JSON.stringify(result));
    } catch (error) {
      console.error('[reportExternalPurchases] Scheduled run failed:', error);
    } finally {
      externalPurchaseReportingRunning = false;
    }
  };

  setInterval(runOnce, EXTERNAL_PURCHASE_REPORTING_INTERVAL_MS);
  // Also run shortly after startup rather than only 24h from now — a short
  // delay so the DB pool/schema (lazily created on first query) isn't racing
  // against the very first request the process handles.
  setTimeout(runOnce, 30_000);
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startExternalPurchaseReportingScheduler();
});

// DEVELOPMENT/DEBUGGING: Startup error handlers for Railway debugging
// Not required for production but recommended for visibility
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
  process.exit(1);
});