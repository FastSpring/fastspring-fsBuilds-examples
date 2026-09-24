/**
 * STORE
 * ============================================================================
 * Persistence for subscription records and MRR-movement events.
 *
 * Deliberately a JSON file, not a database: this is a demo backend and a file
 * keeps setup to zero while still surviving restarts (an in-memory store loses
 * all revenue history every time you restart, which makes MRR/churn charts
 * useless for a demo you're showing to someone). Swap this module for a real
 * database if this ever becomes more than a demo - nothing else imports `fs`.
 *
 * SUBSCRIPTION RECORD SHAPE
 *   subscription      FastSpring subscription ID (the key)
 *   product           FastSpring product path, e.g. "advanced-monthly"
 *   account           FastSpring account ID
 *   status            active | past_due | canceled | deactivated | paused
 *   price             real price from FastSpring when known, else plan fallback
 *   interval          month | year | week (from the plan catalog)
 *   nextBillingDate   ISO string - THIS backend's schedule, not FastSpring's
 *   cancelAtPeriodEnd true when canceled but still serving until period end
 *   dunning           { attempts, nextRetryAt, lastError } when a charge failed
 *   history           append-only log of what happened to this subscription
 */

const fs = require("fs");
const path = require("path");
const plans = require("../config/plans");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "subscriptions.json");

let db = { subscriptions: {}, mrrEvents: [] };

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      db.subscriptions = db.subscriptions || {};
      db.mrrEvents = db.mrrEvents || [];
    }
  } catch (err) {
    // Don't crash on a corrupt file - a demo backend losing its history is
    // annoying, but silently starting from scratch without saying so is worse.
    console.error("Could not read data file - starting with an empty store:", err.message);
    db = { subscriptions: {}, mrrEvents: [] };
  }
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Could not write data file:", err.message);
  }
}

load();

// ---------------------------------------------------------------------------
// Revenue helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes any billing interval to a monthly figure, so a yearly plan and a
 * monthly plan can be added together into one MRR number. This is the standard
 * way subscription platforms report MRR - a $600/yr plan counts as $50 MRR,
 * not $600 in whichever month it happened to bill.
 */
function toMonthly(price, interval) {
  if (!price) return 0;
  switch (interval) {
    case "year":
      return price / 12;
    case "week":
      return (price * 52) / 12;
    case "month":
    default:
      return price;
  }
}

function monthlyValue(sub) {
  if (!sub) return 0;
  return toMonthly(sub.price, sub.interval);
}

function planFor(productPath) {
  return plans[productPath] || { name: productPath, interval: "month", amount: 0 };
}

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

function all() {
  return Object.values(db.subscriptions);
}

function get(id) {
  return db.subscriptions[id] || null;
}

function addHistory(sub, event, detail) {
  sub.history = sub.history || [];
  sub.history.push({ at: new Date().toISOString(), event, detail: detail || null });
  // Keep the log bounded - plenty for a demo, and stops the file growing forever.
  if (sub.history.length > 50) sub.history = sub.history.slice(-50);
}

function upsert(id, patch, historyEvent, historyDetail) {
  const existing = db.subscriptions[id] || { subscription: id, history: [] };
  const sub = { ...existing, ...patch };
  if (historyEvent) addHistory(sub, historyEvent, historyDetail);
  db.subscriptions[id] = sub;
  save();
  return sub;
}

// ---------------------------------------------------------------------------
// MRR movement
// ---------------------------------------------------------------------------

/**
 * Records a change in recurring revenue. Types mirror how subscription
 * platforms break down MRR movement, because a single MRR number doesn't tell
 * you WHY it moved:
 *   new          a subscription started
 *   expansion    an existing subscription moved to a higher-value plan
 *   contraction  an existing subscription moved to a lower-value plan
 *   churn        a subscription stopped generating revenue (negative amount)
 *   reactivation a previously-churned subscription came back
 */
function recordMrrEvent(type, subscriptionId, amount) {
  db.mrrEvents.push({
    at: new Date().toISOString(),
    type,
    subscription: subscriptionId,
    amount: Math.round(amount * 100) / 100,
  });
  save();
}

function mrrEvents() {
  return db.mrrEvents;
}

/**
 * Transaction log - every charge attempt and its outcome.
 * Separate from MRR events (which are about revenue movement) - this is
 * the audit trail of actual FastSpring charge requests and confirmations.
 */
function recordTransaction(tx) {
  db.transactions = db.transactions || [];
  db.transactions.unshift({
    ...tx,
    at: tx.at || new Date().toISOString(),
  });
  // Keep last 200 - plenty for a demo, doesn't grow unbounded
  if (db.transactions.length > 200) db.transactions = db.transactions.slice(0, 200);
  save();
}

function transactions(limit) {
  return (db.transactions || []).slice(0, limit || 50);
}

module.exports = {
  all,
  get,
  upsert,
  addHistory,
  save,
  planFor,
  toMonthly,
  monthlyValue,
  recordMrrEvent,
  mrrEvents,
  recordTransaction,
  transactions,
};
