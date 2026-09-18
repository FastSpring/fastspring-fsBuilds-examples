import { Pool } from 'pg';
import crypto from 'crypto';
import type { GoogleTransactionReport } from './google';

// /reportTransaction previously trusted amountMicros/currency computed
// client-side from a deep link query param (?amount=150) — a real $4.99
// FastSpring order could get reported to Google as $15.00. This table holds
// the actual order data from FastSpring's order.completed webhook (signed,
// server-to-server, trusted), keyed by the Google external transaction token.
// Durable, not a cache.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS google_external_transactions (
    token TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    pre_tax_amount NUMERIC(12,2) NOT NULL,
    tax_amount NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Added once Google reporting moved from "client polls and retries" to
  -- "webhook reports immediately, client is just a fallback" (see webhook.ts,
  -- server.ts, app/utils/google.ts). fastspring_order_id is used as Google's
  -- externalTransactionId — stable and already unique, instead of a fresh
  -- client-generated GUID per attempt — so a redelivered webhook or a client
  -- fallback racing it reports idempotently on Google's side rather than
  -- risking a duplicate. reported_at records that the report already
  -- succeeded, so the fallback path can skip re-reporting.
  ALTER TABLE google_external_transactions ADD COLUMN IF NOT EXISTS fastspring_order_id TEXT;
  ALTER TABLE google_external_transactions ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ;

  -- /validateGooglePurchase previously had no record of which Play purchase
  -- tokens had already been granted, so the same valid token could be
  -- resubmitted and currency granted every time. status tracks the grant
  -- itself, not just the claim: an earlier version claimed the token (INSERT)
  -- before confirming the grant succeeded, so a UGS failure after the claim
  -- committed meant the player paid Google, the token was marked used
  -- forever, and no currency was ever granted with no way to retry. 'pending'
  -- reserves the token against concurrent double-processing; only a
  -- transition to 'granted' means currency was actually given; 'failed'
  -- means a retry with the same token should re-attempt the grant instead of
  -- being told it's already handled.
  CREATE TABLE IF NOT EXISTS google_play_purchases (
    purchase_token TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- FastSpring redelivers a webhook whenever the handler returns non-2xx.
  -- The Google-report side of that is made idempotent via reported_at (see
  -- markGoogleTransactionReported above), but the currency-grant side
  -- (ugs.virtualPurchase) has no such guard on its own — this table dedupes
  -- by FastSpring's own per-delivery event id (event.id, not event.data.id,
  -- the order id) so a redelivery of an event already fully granted skips
  -- re-granting instead of minting currency a second time. status follows
  -- the same pending/granted/failed shape as google_play_purchases and for
  -- the same reason: only mark an event granted after every item in it has
  -- actually been granted, so a failure partway through an item list can be
  -- reclaimed and retried by a later redelivery instead of the whole event
  -- being silently marked done.
  CREATE TABLE IF NOT EXISTS fastspring_processed_events (
    event_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Apple's 7-day link-out commission window starts the moment the player taps
  -- through the disclosure notice — Apple never sees that tap, so it has to be
  -- recorded here. Every token also has to be reportable later even if it never
  -- converts to a sale, so this is a durable table, not a cache: no TTL, no
  -- eviction. order_reference and reported_at stay null until later build
  -- steps (Webhook Listener, Apple Reporting) start filling them in.
  CREATE TABLE IF NOT EXISTS apple_external_purchase_taps (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    token TEXT NOT NULL,
    token_type TEXT NOT NULL,
    tapped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    order_reference TEXT,
    reported_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_apple_ext_purchase_taps_token
    ON apple_external_purchase_taps (token);
  -- Added when the Webhook Listener started matching completed FastSpring
  -- orders back to taps. IF NOT EXISTS so this runs safely against a table
  -- created before these columns existed.
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS order_completed_at TIMESTAMPTZ;
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS within_commission_window BOOLEAN;
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS order_total NUMERIC(12,2);
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS order_tax NUMERIC(12,2);
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS order_currency TEXT;
  -- Added for Apple Reporting's required taxCountry field (three-letter code
  -- expected — see app/utils/iso-country-codes.ts for the alpha-2 -> alpha-3
  -- conversion applied before storing).
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS order_tax_country TEXT;
  -- Which product was being bought when the tap happened — needed for Apple
  -- Reporting's required productIdentifier field. Nothing upstream captured
  -- this before Apple Reporting needed it.
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS product_id TEXT;
  -- EU storefronts request BOTH an Acquisition and a Services token per
  -- purchase attempt (see AppleExternalPurchaseManager.GetExternalPurchaseTokens),
  -- recorded as two separate rows here. This ties them back together so
  -- Apple Reporting can tell "these two tokens are the same purchase" apart
  -- from "these are two different taps that just happen to be close in
  -- time" -- tapped_at alone isn't a safe correlation key across two
  -- sequential inserts. Japan's single-token flow still gets one, covering
  -- a group of exactly one row.
  ALTER TABLE apple_external_purchase_taps ADD COLUMN IF NOT EXISTS purchase_attempt_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_apple_ext_purchase_taps_attempt
    ON apple_external_purchase_taps (purchase_attempt_id);
`;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — cannot persist Google/Apple external purchase data without storage.');
    }

    const isUnencryptedNetwork =
      process.env.DATABASE_URL.includes('localhost') ||
      process.env.DATABASE_URL.includes('.railway.internal');

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // A public hosted Postgres (Railway's public proxy included) terminates
      // TLS with a cert that isn't in Node's default trust store, hence
      // rejectUnauthorized: false. Two cases don't want SSL at all: local
      // Postgres on localhost, and Railway's private network
      // (RAILWAY_PRIVATE_DOMAIN / *.railway.internal) — that traffic is
      // already encrypted at the WireGuard layer, so Postgres there doesn't
      // speak TLS and forcing it here breaks the connection.
      ssl: isUnencryptedNetwork ? undefined : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        // A transient failure here (DB unreachable at cold start, a brief
        // network blip) must not permanently disable reporting for the rest
        // of the process's life — clear the cached promise so the next call
        // retries instead of re-throwing this same stale rejection forever.
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

export interface GoogleTransactionRecord {
  fastspringOrderId: string;
  preTaxAmount: number;
  taxAmount: number;
  currency: string;
  completedAtMs: number;
}

// Upserts on token — FastSpring can redeliver a webhook for the same order,
// and this should just overwrite with the same (or corrected) values rather
// than error.
export async function saveGoogleTransactionRecord(
  playerId: string,
  token: string,
  record: GoogleTransactionRecord
): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `INSERT INTO google_external_transactions (token, player_id, fastspring_order_id, pre_tax_amount, tax_amount, currency, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token) DO UPDATE SET
       player_id = EXCLUDED.player_id,
       fastspring_order_id = EXCLUDED.fastspring_order_id,
       pre_tax_amount = EXCLUDED.pre_tax_amount,
       tax_amount = EXCLUDED.tax_amount,
       currency = EXCLUDED.currency,
       completed_at = EXCLUDED.completed_at`,
    [token, playerId, record.fastspringOrderId, record.preTaxAmount, record.taxAmount, record.currency, new Date(record.completedAtMs)]
  );
}

// The actual shape a SELECT * returns — pg driver column names, not the
// camelCase GoogleTransactionRecord callers write with. Typed explicitly so
// reading a field is a compile-time-checked access, not a guess at a string
// key on an `any`.
export interface GoogleTransactionRow {
  token: string;
  player_id: string;
  fastspring_order_id: string | null;
  pre_tax_amount: string;
  tax_amount: string;
  currency: string;
  completed_at: Date;
  reported_at: Date | null;
  created_at: Date;
}

export async function getGoogleTransactionRecord(token: string): Promise<GoogleTransactionRow | null> {
  await ensureSchema();

  const result = await getPool().query<GoogleTransactionRow>(
    `SELECT * FROM google_external_transactions WHERE token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

// Maps a stored row to the shape reportTransactionToGoogle() actually wants
// — the one place that does the snake_case-to-camelCase, numeric-string-to-
// number, and Date-to-epoch-ms conversions, instead of every caller
// reaching into the raw row and redoing them by hand.
export function toGoogleTransactionReport(token: string, row: GoogleTransactionRow): GoogleTransactionReport {
  return {
    externalTransactionToken: token,
    externalTransactionId: row.fastspring_order_id ?? token,
    preTaxAmount: Number(row.pre_tax_amount),
    taxAmount: Number(row.tax_amount),
    currency: row.currency,
    completedAtMs: row.completed_at.getTime()
  };
}

export async function markGoogleTransactionReported(token: string): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `UPDATE google_external_transactions SET reported_at = now() WHERE token = $1`,
    [token]
  );
}

export type GooglePlayPurchaseClaim = 'grant' | 'already_granted' | 'already_pending';

// Decides what the caller should do next for this purchaseToken, without
// ever marking it as granted itself — that only happens via
// markGooglePlayPurchaseGranted, once the currency grant actually succeeds.
// - 'grant': first time this token has ever been seen, OR a previous
//   attempt failed and this call atomically reclaimed it (the UPDATE ...
//   WHERE status = 'failed' is itself the race-safe guard for reclaiming —
//   only one concurrent caller can flip it from 'failed' back to 'pending').
//   The caller must attempt the grant and then call
//   markGooglePlayPurchaseGranted/Failed with the outcome.
// - 'already_granted': currency was already given for this token; do
//   nothing further.
// - 'already_pending': another request is currently mid-grant for this
//   token (a real concurrent race, not a retry after failure) — the caller
//   should tell the client to retry shortly, not grant anything.
export async function claimGooglePlayPurchaseForGrant(
  purchaseToken: string,
  playerId: string,
  productId: string
): Promise<GooglePlayPurchaseClaim> {
  await ensureSchema();

  const inserted = await getPool().query(
    `INSERT INTO google_play_purchases (purchase_token, player_id, product_id, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (purchase_token) DO NOTHING`,
    [purchaseToken, playerId, productId]
  );
  if ((inserted.rowCount ?? 0) > 0) {
    return 'grant';
  }

  const reclaimed = await getPool().query(
    `UPDATE google_play_purchases SET status = 'pending', updated_at = now()
     WHERE purchase_token = $1 AND status = 'failed'`,
    [purchaseToken]
  );
  if ((reclaimed.rowCount ?? 0) > 0) {
    return 'grant';
  }

  const existing = await getPool().query<{ status: string }>(
    `SELECT status FROM google_play_purchases WHERE purchase_token = $1`,
    [purchaseToken]
  );
  return existing.rows[0]?.status === 'granted' ? 'already_granted' : 'already_pending';
}

export async function markGooglePlayPurchaseGranted(purchaseToken: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE google_play_purchases SET status = 'granted', updated_at = now() WHERE purchase_token = $1`,
    [purchaseToken]
  );
}

export async function markGooglePlayPurchaseFailed(purchaseToken: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE google_play_purchases SET status = 'failed', updated_at = now() WHERE purchase_token = $1`,
    [purchaseToken]
  );
}

export type FastSpringEventClaim = 'grant' | 'already_granted' | 'already_pending';

// Same shape and reasoning as claimGooglePlayPurchaseForGrant: claiming an
// event id does not itself mean granted — only markFastSpringEventGranted
// does, once every item in the event has actually been granted. A failed
// attempt can be reclaimed ('failed' -> 'pending') by a later redelivery
// instead of the event being silently treated as done.
export async function claimFastSpringEventForGrant(eventId: string): Promise<FastSpringEventClaim> {
  await ensureSchema();

  const inserted = await getPool().query(
    `INSERT INTO fastspring_processed_events (event_id, status) VALUES ($1, 'pending') ON CONFLICT (event_id) DO NOTHING`,
    [eventId]
  );
  if ((inserted.rowCount ?? 0) > 0) {
    return 'grant';
  }

  const reclaimed = await getPool().query(
    `UPDATE fastspring_processed_events SET status = 'pending', processed_at = now()
     WHERE event_id = $1 AND status = 'failed'`,
    [eventId]
  );
  if ((reclaimed.rowCount ?? 0) > 0) {
    return 'grant';
  }

  const existing = await getPool().query<{ status: string }>(
    `SELECT status FROM fastspring_processed_events WHERE event_id = $1`,
    [eventId]
  );
  return existing.rows[0]?.status === 'granted' ? 'already_granted' : 'already_pending';
}

export async function markFastSpringEventGranted(eventId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE fastspring_processed_events SET status = 'granted', processed_at = now() WHERE event_id = $1`,
    [eventId]
  );
}

export async function markFastSpringEventFailed(eventId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE fastspring_processed_events SET status = 'failed', processed_at = now() WHERE event_id = $1`,
    [eventId]
  );
}

export async function recordExternalPurchaseTap(
  playerId: string,
  token: string,
  tokenType: string,
  productId: string,
  purchaseAttemptId: string | null = null
) {
  await ensureSchema();

  const id = crypto.randomUUID();
  const result = await getPool().query(
    `INSERT INTO apple_external_purchase_taps (id, player_id, token, token_type, product_id, purchase_attempt_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, tapped_at`,
    [id, playerId, token, tokenType, productId, purchaseAttemptId]
  );

  return result.rows[0];
}

// Matches a completed FastSpring order back to the tap that started it, using
// the Apple external purchase token as the correlation key (threaded through
// FastSpring's own tags mechanism — see encode.ts and webhook.ts). Returns
// null when no tap is found for that token, which is expected for any order
// that isn't part of the Apple External Purchase Link flow, not an error.
export async function matchTapToOrder(
  token: string,
  orderReference: string,
  orderCompletedAt: Date,
  total: number,
  tax: number,
  currency: string,
  taxCountryAlpha3: string | null
) {
  await ensureSchema();

  const existing = await getPool().query(
    `SELECT id, tapped_at FROM apple_external_purchase_taps WHERE token = $1`,
    [token]
  );

  if (existing.rows.length === 0) {
    return null;
  }

  const { id, tapped_at } = existing.rows[0];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const withinCommissionWindow = orderCompletedAt.getTime() - new Date(tapped_at).getTime() <= sevenDaysMs;

  await getPool().query(
    `UPDATE apple_external_purchase_taps
     SET order_reference = $1, order_completed_at = $2, within_commission_window = $3,
         order_total = $4, order_tax = $5, order_currency = $6, order_tax_country = $7
     WHERE id = $8`,
    [orderReference, orderCompletedAt, withinCommissionWindow, total, tax, currency, taxCountryAlpha3, id]
  );

  return { id, withinCommissionWindow };
}

// Reads back every tap whose order has been matched (order_reference is set)
// but hasn't been sent to Apple yet (reported_at is still null) — this is
// exactly the queue the next build step (Apple Reporting) needs to send in
// its monthly batch. Also returns unmatched taps older than a grace period,
// since Apple requires reporting tokens that never converted to a sale too.
export async function getUnreportedTaps() {
  await ensureSchema();

  const result = await getPool().query(
    `SELECT * FROM apple_external_purchase_taps WHERE reported_at IS NULL ORDER BY tapped_at ASC`
  );
  return result.rows;
}

export async function markTapReported(id: string) {
  await ensureSchema();
  await getPool().query(
    `UPDATE apple_external_purchase_taps SET reported_at = now() WHERE id = $1`,
    [id]
  );
}
