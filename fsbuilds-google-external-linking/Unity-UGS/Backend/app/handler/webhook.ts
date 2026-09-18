import * as crypto from "crypto";
import * as ugs from "../utils/ugs";
import * as db from "../utils/db";
import { reportTransactionToGoogle } from "../utils/google";
import { alpha2ToAlpha3 } from "../utils/iso-country-codes";

// FastSpring signs every webhook delivery: HMAC-SHA256 over the exact raw
// request body, base64-encoded, sent in the X-FS-Signature header. Without
// verifying this, anyone who can reach this endpoint could forge an
// order.completed-shaped body with an arbitrary playerId and item list and
// mint themselves currency — there was previously no check here at all.
const WEBHOOK_SECRET = process.env.FASTSPRING_WEBHOOK_SECRET;

function getHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

// Constant-time comparison via crypto.timingSafeEqual — a plain === would
// leak how many leading bytes matched through response timing.
function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!WEBHOOK_SECRET || !signatureHeader) return false;

  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export const handler = async (req) => {
  if (!WEBHOOK_SECRET) {
    // Fail closed, not open: a "verification" that silently no-ops when
    // unconfigured isn't a real control. This does mean webhook processing
    // halts entirely until FASTSPRING_WEBHOOK_SECRET is set to match the
    // secret configured on this store's webhook in the FastSpring dashboard.
    console.error('[webhook] FASTSPRING_WEBHOOK_SECRET is not set — refusing to process any webhook until it is configured.');
    return createResponse({ success: false, reason: 'Webhook signing secret not configured' }, 500);
  }

  // On Express (server.ts), rawBody is the exact bytes captured before
  // JSON parsing (see server.ts's express.json({ verify })) — re-stringifying
  // the already-parsed req.body could differ byte-for-byte (key order,
  // whitespace, unicode escaping) from what FastSpring actually signed. On
  // Lambda/API Gateway (serverless.yml), req.body is already the raw string
  // as received, so it doubles as the raw body directly.
  const rawBody: Buffer = req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(req.body, 'utf8');
  const signatureHeader = getHeader(req.headers, 'x-fs-signature');

  if (!isValidSignature(rawBody, signatureHeader)) {
    console.error('[webhook] Rejected: missing or invalid X-FS-Signature header.');
    return createResponse({ success: false, reason: 'Invalid signature' }, 401);
  }

  const body = JSON.parse(req.body);
  const events = body.events;

  if (!Array.isArray(events)) {
    return createResponse({ success: false }, 400);
  }

  let token;
  try {
    token = await ugs.tokenExchange();
  } catch (e) {
    // DEVELOPMENT/DEBUGGING: Error logging — recommended to keep for production visibility
    console.error('[webhook] Token exchange error:', e);
    return createResponse({ success: false, reason: "Error logging in UGS" }, 500);
  }

  try {
    for (const event of events) {
      const playerId = event.data.tags.playerId;
      const items = event.data.items;

      // FastSpring redelivers a webhook whenever the handler returns
      // non-2xx — e.g. if this throws for one event after reportToGoogle
      // already fully succeeded for it, the whole handler 500s and the same
      // event comes back later. ugs.virtualPurchase has no idempotency of
      // its own, so this dedupes by FastSpring's own per-delivery event id
      // (event.id, distinct from event.data.id, the order id). Claiming
      // only reserves the event as in-progress — it's marked granted only
      // after every item actually succeeds, so a failure partway through a
      // redelivery can be reclaimed and retried rather than the whole event
      // being silently treated as done (the same claim/grant/fail shape
      // used for Google Play purchases in server.ts, and for the same
      // reason: claim-before-confirming-success permanently drops work that
      // fails partway through).
      const grantItems = async () => {
        if (!event.id) {
          for (const item of items) {
            const productId = item.sku || item.product;
            if (productId) {
              await ugs.virtualPurchase(token.accessToken, playerId, productId.toUpperCase());
            }
          }
          return;
        }

        const claim = await db.claimFastSpringEventForGrant(event.id);
        if (claim !== 'grant') {
          console.log(`[webhook] Skipping event ${event.id} (${claim})`);
          return;
        }

        try {
          for (const item of items) {
            const productId = item.sku || item.product;
            if (productId) {
              await ugs.virtualPurchase(token.accessToken, playerId, productId.toUpperCase());
            }
          }
          await db.markFastSpringEventGranted(event.id);
        } catch (e) {
          await db.markFastSpringEventFailed(event.id);
          throw e;
        }
      };

      // Granting currency and reporting to Google read from the same event
      // but don't depend on each other or need to happen in order, so they
      // run concurrently rather than paying their latency one after the
      // other on every webhook call.
      const googleExternalTransactionToken = event.data.tags.googleExternalTransactionToken;
      const reportToGoogle = googleExternalTransactionToken
        ? reportGoogleExternalTransaction(playerId, googleExternalTransactionToken, event)
        : Promise.resolve();

      await Promise.all([grantItems(), reportToGoogle]);

      // Apple External Purchase Link attribution: encode.ts tags the order with
      // externalPurchaseToken1 (and, on EU storefronts, externalPurchaseToken2 —
      // Acquisition + Services, since Apple wants both requested and both
      // accounted for) only when this checkout was reached via the iOS steering
      // path. Those taps, not this webhook, are what actually started Apple's
      // 7-day commission window — this just matches each one up and records the
      // facts (order total/tax/currency, whether it landed inside the window).
      // What to report to Apple, and which of a paired Acquisition/Services
      // token the actual sale attaches to, is decided later by the reporting
      // job — currency was already granted above regardless of whether this
      // matching succeeds.
      const tags = event.data.tags ?? {};
      const externalPurchaseTokens = [tags.externalPurchaseToken1, tags.externalPurchaseToken2].filter(Boolean);

      for (const externalPurchaseToken of externalPurchaseTokens) {
        try {
          const match = await db.matchTapToOrder(
            externalPurchaseToken,
            event.data.id,
            new Date(event.data.changed),
            event.data.total,
            event.data.tax,
            event.data.currency,
            alpha2ToAlpha3(event.data.address?.country)
          );
          if (!match) {
            console.warn('[webhook] externalPurchaseToken tag present but no matching tap record found — nothing to attribute.');
          }
        } catch (e) {
          console.error('[webhook] Failed to match tap to order:', e);
        }
      }
    }
  } catch (e) {
    // DEVELOPMENT/DEBUGGING: Error logging — recommended to keep for production visibility
    console.error('[webhook] Virtual purchase error:', e);
    return createResponse({ success: false, reason: "Error granting product in UGS" }, 500);
  }

  return createResponse({ success: true }, 200);
};

// Google External Content Links reporting: encode.ts tags the order with
// googleExternalTransactionToken only when this checkout was reached via
// the Android steering path. By this point we already have everything the
// Google report needs, so report it now instead of waiting for the
// client's return trip to ask — that used to be a race (delayed webhook ->
// client gives up on a 202 -> transaction silently never reported).
// /reportTransaction (server.ts) still exists as a fallback for the rare
// case this fails or the client's request somehow beats this. Errors here
// are caught and logged, never thrown — this must never block the item
// grant this function runs alongside.
async function reportGoogleExternalTransaction(playerId: string, externalTransactionToken: string, event: any): Promise<void> {
  try {
    // A redelivery of an event already fully reported must not report to
    // Google a second time — unlike server.ts's /reportTransaction, which
    // already checks this, this path previously had no such guard, so a
    // redelivery triggered by an unrelated failure elsewhere in the same
    // webhook call (see grantItems above) would silently re-report.
    const existing = await db.getGoogleTransactionRecord(externalTransactionToken);
    if (existing?.reported_at) {
      return;
    }

    // FastSpring's own order id doubles as Google's externalTransactionId —
    // stable and already unique, so a redelivered webhook reports
    // idempotently on Google's side instead of needing a fresh id
    // generated per attempt.
    const fastspringOrderId = event.data.id;

    // Default rather than let an INSERT into a NOT NULL column throw and
    // silently drop the whole record — a zero-tax or fully-discounted
    // order might omit these fields rather than send an explicit
    // 0/currency code.
    const preTaxAmount = event.data.subtotal ?? 0;
    const taxAmount = event.data.tax ?? 0;
    const currency = event.data.currency || 'USD';
    const completedAtMs = event.data.changed;

    await db.saveGoogleTransactionRecord(playerId, externalTransactionToken, {
      fastspringOrderId,
      preTaxAmount,
      taxAmount,
      currency,
      completedAtMs
    });

    const result = await reportTransactionToGoogle({
      externalTransactionToken,
      externalTransactionId: fastspringOrderId,
      preTaxAmount,
      taxAmount,
      currency,
      completedAtMs
    });

    if (result.ok) {
      await db.markGoogleTransactionReported(externalTransactionToken);
    } else {
      console.error('[webhook] Google reporting rejected:', result.status, JSON.stringify(result.data));
    }
  } catch (e) {
    // Leave reported_at unset either way — /reportTransaction's fallback
    // path will pick this up if the client asks. Whether the record itself
    // failed to save or the Google call failed, there's nothing further to
    // do from here.
    console.error('[webhook] Failed to record/report Google transaction:', e);
  }
}

function createResponse(body: any, status: number) {
  return {
    "statusCode": status,
    "headers": {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT"
    },
    "body": JSON.stringify(body),
    "isBase64Encoded": false
  };
}
