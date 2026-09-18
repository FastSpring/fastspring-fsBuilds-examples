import { google } from 'googleapis';

// Exported so server.ts's /validateGooglePurchase (which also calls the
// Play Developer API directly) doesn't hardcode a second copy of the same
// string — one source of truth for a rebrand/package change to update.
export const PACKAGE_NAME = 'com.ollieinteractive.fastspringpoc';

// Google's priceMicros is the amount in millionths of the currency unit
// (1,000,000 micros = 1 unit) — e.g. $4.99 -> "4990000".
function toPriceMicros(amount: number): string {
  return String(Math.round(Number(amount) * 1_000_000));
}

export interface GoogleTransactionReport {
  externalTransactionToken: string;
  // FastSpring's own order id, not a fresh per-attempt GUID — Google's API
  // treats externalTransactionId as the idempotency key for this call, so a
  // stable id means a redelivered webhook (or a client fallback racing the
  // webhook) reports safely instead of risking a duplicate.
  externalTransactionId: string;
  preTaxAmount: number;
  taxAmount: number;
  currency: string;
  completedAtMs: number;
}

// Cached the same way ugs.ts caches its JWKS (module-level, created once) —
// a fresh GoogleAuth + getClient() + getAccessToken() round trip on every
// single report call would mean re-authenticating with Google once per
// webhook event, serialized in front of the actual report. The GoogleAuth
// *instance* is what's cached, not a resolved client: google-auth-library
// already caches the client (and that client's own access token) internally
// once getClient() has been called on a given instance once, and the typed
// androidpublisher client (used by /validateGooglePurchase) specifically
// wants a GoogleAuth instance, not an already-resolved client — caching the
// instance is what lets both call sites share one, instead of one caching a
// client the other can't use.
let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | null = null;

export function getGoogleAuth() {
  if (!cachedAuth) {
    const serviceAccountJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
    cachedAuth = new google.auth.GoogleAuth({
      credentials: serviceAccountJson,
      scopes: ['https://www.googleapis.com/auth/androidpublisher']
    });
  }
  // Non-null by construction: the branch above always assigns it before
  // this line runs. TS can't narrow a mutable module-level `let` captured
  // by an exported function on its own, hence the assertion.
  return cachedAuth!;
}

// Extracted out of server.ts's old inline /reportTransaction handler so both
// the webhook (the primary, immediate trigger) and /reportTransaction (a
// fallback for when that hasn't happened yet) call the exact same code.
//
// Uses raw fetch rather than googleapis's typed androidpublisher client
// (already used elsewhere in this backend, e.g. /validateGooglePurchase) —
// that's deliberate, not an oversight: externalContentLinkDetails, the field
// this program actually needs, is undocumented in the public discovery doc
// the typed client is generated from (see the comment below), so the typed
// client can't be trusted to pass it through untouched.
export async function reportTransactionToGoogle(
  report: GoogleTransactionReport
): Promise<{ ok: boolean; status: number; data: any }> {
  const client = await getGoogleAuth().getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse?.token;

  if (!accessToken) {
    throw new Error('Failed to obtain Google access token');
  }

  // externalContentLinkDetails is the correct field for External Content Links
  // transactions: Google's parser accepts it and its linkType subfield (probed
  // 2026-08-28 — unknown fields get "Cannot find field", this one doesn't), but
  // it is hidden from the public discovery doc and its value is currently
  // stripped before backend validation ("must be set" even when set) — pending
  // Google-side visibility/allowlist for this API consumer. externalOfferDetails
  // is rejected outright for this program ("must only be set for external offer
  // transactions").
  const requestBody: any = {
    originalPreTaxAmount: {
      priceMicros: toPriceMicros(report.preTaxAmount),
      currency: report.currency
    },
    originalTaxAmount: {
      priceMicros: toPriceMicros(report.taxAmount),
      currency: report.currency
    },
    transactionTime: new Date(report.completedAtMs).toISOString(),
    oneTimeTransaction: {
      externalTransactionToken: report.externalTransactionToken
    },
    userTaxAddress: {
      regionCode: 'US'
    },
    externalContentLinkDetails: {
      linkType: 'LINK_TO_DIGITAL_CONTENT_OFFER'
    }
  };

  // Full request/response bodies carry real transaction amounts, currency,
  // and the external transaction token — only log them unredacted when
  // explicitly opted into for debugging, not unconditionally in every
  // environment.
  const verbose = process.env.DEBUG_GOOGLE_REPORTING === 'true';
  if (verbose) {
    console.log('[google] Outgoing body:', JSON.stringify(requestBody));
  }

  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/externalTransactions?externalTransactionId=${encodeURIComponent(report.externalTransactionId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
  );
  const data = await response.json();

  if (verbose) {
    console.log('[google] Raw REST response:', response.status, JSON.stringify(data));
  } else {
    console.log(`[google] Reported externalTransactionId=${report.externalTransactionId}: ${response.status}${response.ok ? '' : ' (rejected)'}`);
  }

  return { ok: response.ok, status: response.status, data };
}
