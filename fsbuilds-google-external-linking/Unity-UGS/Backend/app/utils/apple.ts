import jwt from 'jsonwebtoken';

// TODO: confirm this matches Unity's iOS Player Settings > Bundle Identifier
// (currently unset there) and the Bundle ID registered in App Store Connect.
// Using the existing Android package name as the convention for now.
const APPLE_BUNDLE_ID = 'com.ollieinteractive.fastspringpoc';

const PRODUCTION_BASE_URL = 'https://api.storekit.apple.com';
const SANDBOX_BASE_URL = 'https://api.storekit-sandbox.apple.com';

function generateAppStoreServerJWT(): string {
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;

  if (!issuerId || !keyId || !privateKey) {
    throw new Error('APPLE_ISSUER_ID, APPLE_KEY_ID, or APPLE_PRIVATE_KEY is not set.');
  }

  const now = Math.floor(Date.now() / 1000);
  // Apple's max token lifetime is 20 minutes (1200s) — staying well under it.
  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 900,
      aud: 'appstoreconnect-v1',
      bid: APPLE_BUNDLE_ID
    },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: keyId, typ: 'JWT' } }
  );
}

// signedTransactionInfo / signedRenewalInfo are JWS Compact Serialization
// (header.payload.signature, base64url). We only ever need to read the payload
// here, never the client-supplied copy's signature — see the comment on
// fetchAuthoritativeTransaction for why.
function decodeJwsPayload(jws: string): any {
  const payloadSegment = jws.split('.')[1];
  const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
  return JSON.parse(json);
}

// Pulls the transaction id out of the client's copy of signedTransactionInfo.
// This is only ever used as a pointer to look up the authoritative version below —
// never trusted as evidence of a real purchase on its own.
export function extractTransactionId(clientSignedTransactionInfo: string): string {
  return decodeJwsPayload(clientSignedTransactionInfo).transactionId;
}

// Fetches the transaction directly from Apple's own server (Get Transaction Info:
// GET /inApps/v1/transactions/{transactionId}), rather than trusting the client's
// signedTransactionInfo as-is. What comes back from this call, not what the client
// sent, is what determines whether currency gets granted. Since it arrives over an
// authenticated HTTPS connection straight from Apple, this does not additionally
// verify the JWS signature chain locally — Apple already verified it before this
// response was generated. Apple doesn't say in advance whether a transaction id is
// a sandbox or production one, so production is tried first with a fallback to
// sandbox on a 404, matching the pattern most third-party App Store Server API
// integrations use for this same ambiguity.
export async function fetchAuthoritativeTransaction(transactionId: string): Promise<any> {
  const token = generateAppStoreServerJWT();
  const headers = { Authorization: `Bearer ${token}` };

  let notFoundError: Error | null = null;
  for (const base of [PRODUCTION_BASE_URL, SANDBOX_BASE_URL]) {
    const response = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, { headers });

    if (response.ok) {
      const data = await response.json() as { signedTransactionInfo: string };
      return decodeJwsPayload(data.signedTransactionInfo);
    }

    if (response.status === 404) {
      notFoundError = new Error(`Transaction ${transactionId} not found (checked production and sandbox)`);
      continue;
    }

    throw new Error(`Apple transaction lookup failed: ${response.status} ${await response.text()}`);
  }

  throw notFoundError;
}

// External purchase tokens (from ExternalPurchaseCustomLink, the External
// Purchase Link steering program) are NOT a JWS like signedTransactionInfo —
// per Apple's own docs, they're just Base64URL-encoded JSON, no signature
// segments to strip. Decoded fields include externalPurchaseId (what the
// reporting API below actually wants), tokenCreationDate, bundleId,
// appAppleId, and for custom-link tokens specifically, tokenType and
// tokenExpirationDate.
export function decodeExternalPurchaseToken(token: string): any {
  return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
}

// Sandbox tokens self-identify: their externalPurchaseId always starts with
// "SANDBOX" (Apple's documented behavior for this token type) — unlike App
// Store Server API transaction ids above, no need to try both environments.
function isSandboxExternalPurchaseId(externalPurchaseId: string): boolean {
  return externalPurchaseId.startsWith('SANDBOX');
}

export interface OneTimeBuyLineItem {
  lineItemId: string;
  creationDate: number; // UNIX ms
  pricingCurrency: string;
  reportingCurrency: string;
  amountTaxExclusive: number; // milli-units of reportingCurrency
  amountTaxInclusive: number; // milli-units
  netAmountTaxExclusive: number; // milli-units
  taxAmount: number; // milli-units
  taxCountry: string; // three-letter country code
  productIdentifier: string;
  quantity: number;
  eventType: 'BUY';
  productType: 'ONE_TIME_BUY';
}

// Reports one external purchase token to Apple's External Purchase Server API
// (PUT /externalPurchase/v1/reports) — a different API from the App Store
// Server API used for native IAP above (different path, different resource),
// but the same JWT (same aud claim, same signing key) authenticates both.
export async function submitExternalPurchaseReport(report: {
  requestIdentifier: string;
  externalPurchaseId: string;
  status: 'LINE_ITEM' | 'NO_LINE_ITEM';
  lineItems?: OneTimeBuyLineItem[];
}): Promise<void> {
  const base = isSandboxExternalPurchaseId(report.externalPurchaseId) ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
  const token = generateAppStoreServerJWT();

  const response = await fetch(`${base}/externalPurchase/v1/reports`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(report)
  });

  if (!response.ok) {
    throw new Error(`Apple external purchase report failed: ${response.status} ${await response.text()}`);
  }
}
