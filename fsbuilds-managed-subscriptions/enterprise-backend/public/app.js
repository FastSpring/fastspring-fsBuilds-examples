/**
 * SyncWrx Subscription Management Dashboard
 *
 * Core demo flow: seller sees a subscription, decides whether to:
 *   Path A — Update the price for the next billing period, then charge
 *   Path B — Charge at the current plan price
 *
 * FastSpring executes every charge. This dashboard decides when and how much.
 */

let plans = [];
let activeModalId = null;

const money = (n) =>
  n != null
    ? "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

const rate = (n) => (n === null || n === undefined ? "n/a" : `${n}%`);

const STATUS_LABEL = {
  active: "Active", past_due: "Past due",
  canceled: "Canceled", deactivated: "Deactivated", paused: "Paused",
};

// ─── Data loading ────────────────────────────────────────────────────────────

async function loadPlans() {
  try { plans = await fetch("/api/plans").then((r) => r.json()); }
  catch { plans = []; }
}

async function refresh() {
  let metrics, subs, txs;
  try {
    [metrics, subs, txs] = await Promise.all([
      fetch("/api/metrics").then((r) => r.json()),
      fetch("/api/subscriptions").then((r) => r.json()),
      fetch("/api/transactions").then((r) => r.json()),
    ]);
  } catch {
    document.getElementById("subscriptions").innerHTML =
      '<div class="empty">Could not reach the backend — is the server still running?</div>';
    return;
  }

  renderMetrics(metrics);
  renderMovement(metrics);
  renderSubscriptions(subs);
  renderTransactions(txs);

  if (activeModalId) {
    const sub = subs.find((s) => s.subscription === activeModalId);
    if (sub) syncModalStatus(sub);
  }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function renderMetrics(m) {
  const churn = m.churn || {};
  document.getElementById("metrics").innerHTML = `
    <div class="metric">
      <div class="metric-label">MRR</div>
      <div class="metric-value">${money(m.mrr)}</div>
      <div class="metric-sub">Normalized monthly</div>
    </div>
    <div class="metric">
      <div class="metric-label">ARR</div>
      <div class="metric-value">${money(m.arr)}</div>
      <div class="metric-sub">MRR × 12</div>
    </div>
    <div class="metric">
      <div class="metric-label">Active</div>
      <div class="metric-value">${m.activeSubscriptions || 0}</div>
      <div class="metric-sub">${m.totalSubscriptions || 0} total</div>
    </div>
    <div class="metric">
      <div class="metric-label">Customer churn</div>
      <div class="metric-value">${rate(churn.customerChurnRate)}</div>
      <div class="metric-sub">${
        churn.customerChurnRate === null
          ? `${churn.churnedSubscriptions ?? 0} lost, no baseline yet`
          : `${churn.churnedSubscriptions ?? 0} lost / ${churn.windowDays ?? 30}d`
      }</div>
    </div>
    <div class="metric">
      <div class="metric-label">Revenue churn</div>
      <div class="metric-value">${rate(churn.revenueChurnRate)}</div>
      <div class="metric-sub">${money(churn.churnedMrr)} MRR lost</div>
    </div>
    <div class="metric">
      <div class="metric-label">Involuntary churn</div>
      <div class="metric-value">${(m.involuntaryChurn && m.involuntaryChurn.count) || 0}</div>
      <div class="metric-sub">${money(m.involuntaryChurn && m.involuntaryChurn.mrr)} from failed payments</div>
    </div>`;
}

function renderMovement(m) {
  const mv = m.movement || {};
  document.getElementById("window-label").textContent =
    `(last ${m.churn ? m.churn.windowDays : 30} days)`;
  const cell = (label, value, pos) => `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${pos ? "pos" : value < 0 ? "neg" : ""}">${money(value)}</div>
    </div>`;
  document.getElementById("movement").innerHTML = [
    cell("New", mv.new, mv.new > 0),
    cell("Expansion", mv.expansion, mv.expansion > 0),
    cell("Reactivation", mv.reactivation, mv.reactivation > 0),
    cell("Contraction", mv.contraction, false),
    cell("Churn", mv.churn, false),
    cell("Net", mv.net, mv.net > 0),
  ].join("");
}

// ─── Subscription table ───────────────────────────────────────────────────────

function renderSubscriptions(subs) {
  const el = document.getElementById("subscriptions");
  if (!subs.length) {
    el.innerHTML = `<div class="empty">No subscriptions yet — subscribe on the storefront (port 4000)
      and the <code>subscription.activated</code> webhook will populate this automatically.</div>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Subscription</th><th>Plan</th><th>MRR</th>
        <th>Status</th><th>Next bill</th><th></th>
      </tr></thead>
      <tbody>${subs.map(subRow).join("")}</tbody>
    </table>`;

  el.querySelectorAll("[data-manage]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.manage));
  });
  el.querySelectorAll("[data-mark-due]").forEach((btn) => {
    btn.addEventListener("click", () => quickMarkDue(btn.dataset.markDue, btn));
  });
}

function subRow(sub) {
  const mrr = sub.interval === "year" ? sub.price / 12
    : sub.interval === "week" ? (sub.price * 52) / 12
    : sub.price;
  const isEnded = ["canceled", "deactivated"].includes(sub.status);
  const dunning = sub.dunning
    ? `<div class="dunning">Retry ${sub.dunning.attempts} — next ${fmt(sub.dunning.nextRetryAt)}</div>`
    : "";
  const pendingCancel = sub.cancelAtPeriodEnd
    ? `<div class="dunning">Cancels at period end</div>` : "";
  const pendingPrice = sub.pendingPrice
    ? `<div class="pending-price">↑ Price override: ${money(sub.pendingPrice)} pending</div>` : "";

  return `<tr>
    <td><code>${sub.subscription.slice(0, 14)}…</code></td>
    <td>${sub.planName || sub.product || "—"}
        <div class="metric-sub">${sub.product || ""}</div></td>
    <td>${money(mrr)}<div class="metric-sub">${money(sub.price)}/${sub.interval || "?"}</div>${pendingPrice}</td>
    <td>
      <span class="status status-${sub.status}">${STATUS_LABEL[sub.status] || sub.status}</span>
      ${dunning}${pendingCancel}
    </td>
    <td>${fmt(sub.nextBillingDate)}</td>
    <td>${isEnded
      ? '<span class="metric-sub">Ended</span>'
      : `<button class="primary" data-manage="${sub.subscription}">Manage</button>
         <button data-mark-due="${sub.subscription}">Mark due</button>`
    }</td>
  </tr>`;
}

// ─── Transaction log ──────────────────────────────────────────────────────────

// FastSpring's Spring dashboard URL — links open there for payment-level detail
// (card data, authorization codes, settlement status) that this backend doesn't
// hold. That's the honest handoff: we own subscription context, FastSpring owns
// the payment detail as merchant of record.
// Confirmed FastSpring deep link format from a real subscription URL:
// https://app.fastspring.com/subscription/home.xml?mRef=Subscription:{subId}&cRef=BasicStoreSite:{siteId}
// siteId comes from order.siteId in the webhook payload (Webhook Expansion enabled).
const FS_SUB_URL = (subscriptionId, siteId) =>
  subscriptionId && siteId
    ? `https://app.fastspring.com/subscription/home.xml?mRef=Subscription:${subscriptionId}&cRef=BasicStoreSite:${siteId}`
    : "https://app.fastspring.com";

function renderTransactions(txs) {
  const el = document.getElementById("tx-log");
  if (!txs || !txs.length) {
    el.innerHTML = `<div class="empty">No transactions yet — charge a subscription to see activity here.</div>`;
    return;
  }

  const badgeClass = { completed: "tx-badge-completed", failed: "tx-badge-failed",
                       pending: "tx-badge-pending" };
  const badgeLabel = { completed: "Completed", failed: "Failed", pending: "Pending" };

  el.innerHTML = `
    <div class="tx-list">
      ${txs.map((tx) => {
        const fsLink = tx.invoiceUrl || FS_SUB_URL(tx.subscriptionId, tx.siteId);
        const fsLinkLabel = tx.invoiceUrl ? "View invoice ↗"
          : (tx.subscriptionId && tx.siteId) ? "View in FastSpring ↗"
          : "FastSpring ↗";
        console.log("TX link debug:", { subscriptionId: tx.subscriptionId, siteId: tx.siteId, invoiceUrl: tx.invoiceUrl, fsLink });
        return `
        <div class="tx-row">
          <div>
            <div class="tx-event">${tx.planName || tx.product || tx.subscriptionId}</div>
            <div class="tx-detail">
              ${tx.event.replace(".", " ")}
              ${tx.fastspringReference ? `&nbsp;·&nbsp; <code>${tx.fastspringReference}</code>` : ""}
              &nbsp;·&nbsp; <code>${tx.subscriptionId ? tx.subscriptionId.slice(0, 14) + "…" : "—"}</code>
            </div>
          </div>
          <span class="tx-badge ${badgeClass[tx.status] || "tx-badge-info"}">
            ${badgeLabel[tx.status] || tx.status}
          </span>
          <div class="tx-amount">${money(tx.amount)}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            <div class="tx-time">${fmt(tx.at)}</div>
            <a class="fs-link" href="${fsLink}" target="_blank" rel="noopener">
              ${fsLinkLabel}
            </a>
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

// ─── Manage modal ─────────────────────────────────────────────────────────────

function openModal(subscriptionId) {
  activeModalId = subscriptionId;
  fetch(`/api/subscriptions/${encodeURIComponent(subscriptionId)}`)
    .then((r) => r.json())
    .then((sub) => {
      document.getElementById("modal").innerHTML = buildModal(sub);
      document.getElementById("modal-overlay").hidden = false;
      wireModal(sub);
    })
    .catch(() => alert("Could not load subscription."));
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
  activeModalId = null;
  refresh();
}

function syncModalStatus(sub) {
  const el = document.getElementById("modal-current-status");
  if (el) el.innerHTML =
    `<span class="status status-${sub.status}">${STATUS_LABEL[sub.status] || sub.status}</span>`;
}

function buildModal(sub) {
  const monthly = sub.interval === "year" ? sub.price / 12
    : sub.interval === "week" ? (sub.price * 52) / 12
    : sub.price;

  return `
    <div class="modal-header">
      <div>
        <div class="modal-title">Manage Subscription</div>
        <div class="modal-sub">
          <code>${sub.subscription.slice(0, 18)}…</code>
          &nbsp;·&nbsp; ${sub.planName || sub.product}
        </div>
      </div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>

    <div class="modal-summary">
      <div class="modal-kv">
        <div class="modal-kv-label">Status</div>
        <div class="modal-kv-value" id="modal-current-status">
          <span class="status status-${sub.status}">${STATUS_LABEL[sub.status] || sub.status}</span>
        </div>
      </div>
      <div class="modal-kv">
        <div class="modal-kv-label">Plan price</div>
        <div class="modal-kv-value">${money(sub.price)} / ${sub.interval}</div>
      </div>
      <div class="modal-kv">
        <div class="modal-kv-label">MRR</div>
        <div class="modal-kv-value">${money(monthly)}</div>
      </div>
      <div class="modal-kv">
        <div class="modal-kv-label">Next bill</div>
        <div class="modal-kv-value">${fmt(sub.nextBillingDate) || "—"}</div>
      </div>
      ${sub.pendingPrice ? `
      <div class="modal-kv" style="grid-column:1/-1">
        <div class="modal-kv-label">Pending price override</div>
        <div class="modal-kv-value pending">${money(sub.pendingPrice)} (set for next charge)</div>
      </div>` : ""}
    </div>

    <!-- ── Path chooser ──────────────────────────────── -->
    <div class="modal-paths">
      <button class="path-btn" id="path-a-btn" data-path="a">
        <span class="path-icon">✏️</span>
        <span class="path-label">Update price, then charge</span>
        <span class="path-desc">Set a new amount for this period in FastSpring, then trigger the charge.</span>
      </button>
      <button class="path-btn" id="path-b-btn" data-path="b">
        <span class="path-icon">⚡</span>
        <span class="path-label">Charge at current price</span>
        <span class="path-desc">Trigger the charge immediately at the plan's existing price.</span>
      </button>
    </div>

    <!-- ── Path A: price update ───────────────────────── -->
    <div class="modal-panel" id="panel-a">
      <div class="modal-panel-title">Path A — Update price then charge</div>
      <div class="modal-explainer">
        This calls <code>POST /subscriptions</code> with a new
        <code>pricing.price.USD</code> value in FastSpring, then triggers a
        charge. The updated price is what FastSpring will bill. The plan itself
        doesn't change — only this period's amount. For example: "Your next
        billing cycle, your subscription will be $X."
      </div>
      <div class="form-row">
        <label class="form-label">New price (USD)</label>
        <input id="new-price" type="number" min="0.01" step="0.01"
               placeholder="${sub.price}" value="${sub.pendingPrice || ""}" class="form-input" />
        <div class="current-val">Current plan price: ${money(sub.price)} / ${sub.interval}</div>
      </div>
      <div class="form-row">
        <label class="form-label">Reason (optional — for your records)</label>
        <input id="price-note" type="text" placeholder="e.g. Annual price increase — communicated via email"
               class="form-input" />
      </div>
      <div class="modal-actions">
        <button id="btn-set-price">Set price only</button>
        <button id="btn-set-and-charge" class="primary">Set price &amp; charge now →</button>
      </div>
      <div id="result-a" class="modal-result" hidden></div>
    </div>

    <!-- ── Path B: charge now ─────────────────────────── -->
    <div class="modal-panel" id="panel-b">
      <div class="modal-panel-title">Path B — Charge at current price</div>
      <div class="modal-explainer">
        Triggers <code>POST /subscriptions/charge</code> in FastSpring immediately.
        FastSpring charges the payment method on file at
        <strong>${money(sub.pendingPrice || sub.price)}</strong>${sub.pendingPrice ? " (pending override)" : ""}.
        Confirmation arrives asynchronously via the
        <code>subscription.charge.completed</code> webhook — the status updates
        automatically once FastSpring responds.
      </div>
      <div class="modal-actions">
        <button id="btn-charge" class="primary">Charge now → FastSpring</button>
      </div>
      <div id="result-b" class="modal-result" hidden></div>
    </div>

    <!-- ── Other actions ──────────────────────────────── -->
    <div style="padding: 0 24px 20px; border-top: 1px solid var(--border); margin-top: 4px;">
      <div class="modal-panel-title" style="border-top:none;padding-top:16px">Other actions</div>
      <div class="modal-actions">
        <button id="btn-cancel">Cancel subscription</button>
      </div>
      <div id="result-other" class="modal-result" hidden></div>
    </div>

    <!-- ── History ────────────────────────────────────── -->
    ${sub.history && sub.history.length ? `
    <div style="padding: 0 24px 24px; border-top: 1px solid var(--border);">
      <div class="modal-panel-title" style="border-top:none;padding-top:16px">History</div>
      <div class="history-list">
        ${[...sub.history].reverse().slice(0, 6).map((h) => `
          <div class="history-row">
            <span class="history-event">${h.event}</span>
            <span class="history-detail">${h.detail || ""}</span>
            <span class="history-time">${fmt(h.at)}</span>
          </div>`).join("")}
      </div>
    </div>` : ""}
  `;
}

function wireModal(sub) {
  const id = sub.subscription;

  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  // Path selection
  ["a", "b"].forEach((path) => {
    document.getElementById(`path-${path}-btn`).addEventListener("click", () => {
      document.querySelectorAll(".path-btn").forEach((b) => b.classList.remove("selected"));
      document.getElementById(`path-${path}-btn`).classList.add("selected");
      document.querySelectorAll(".modal-panel").forEach((p) => p.classList.remove("visible"));
      document.getElementById(`panel-${path}`).classList.add("visible");
    });
  });

  // Path A
  document.getElementById("btn-set-price").addEventListener("click", () =>
    doSetPrice(id, false));
  document.getElementById("btn-set-and-charge").addEventListener("click", () =>
    doSetPrice(id, true));

  // Path B
  document.getElementById("btn-charge").addEventListener("click", () =>
    doCharge(id, "result-b"));

  // Cancel
  document.getElementById("btn-cancel").addEventListener("click", () =>
    doCancel(id));
}

// ─── Modal actions ────────────────────────────────────────────────────────────

async function doSetPrice(id, andCharge) {
  const price = parseFloat(document.getElementById("new-price").value);
  const note = document.getElementById("price-note").value;
  const resultEl = document.getElementById("result-a");

  if (!price || price <= 0) {
    show(resultEl, "Enter a valid amount.", "error"); return;
  }

  show(resultEl, "Sending price update to FastSpring…", "pending");
  const res = await api(id, "update-price", { price, note });

  if (!res.ok) {
    show(resultEl, `Price update failed: ${res.error}`, "error"); return;
  }

  show(resultEl, `Price set to ${money(price)} in FastSpring.${andCharge ? " Triggering charge…" : ""}`, "ok");

  if (andCharge) {
    await sleep(700);
    await doCharge(id, "result-a");
  } else {
    refresh();
  }
}

async function doCharge(id, resultElId) {
  const resultEl = document.getElementById(resultElId);
  show(resultEl, "Charge request sent to FastSpring. Waiting for webhook confirmation…", "pending");
  const res = await api(id, "charge", {});
  if (!res.ok || res.accepted === false) {
    show(resultEl, `Charge failed: ${res.error || "FastSpring rejected the request."}`, "error");
  } else {
    show(resultEl,
      "FastSpring accepted the charge request. Status will update once the " +
      "subscription.charge.completed webhook fires — usually within a few seconds.",
      "ok");
  }
  refresh();
}

async function doCancel(id) {
  const immediate = confirm(
    "OK = cancel immediately (deactivates now).\n" +
    "Cancel = cancel at period end (access continues until then)."
  );
  const resultEl = document.getElementById("result-other");
  show(resultEl, "Sending cancellation to FastSpring…", "pending");
  const res = await api(id, "cancel", { immediate, reason: "voluntary" });
  if (!res.ok) {
    show(resultEl, `Cancellation failed: ${res.error}`, "error");
  } else {
    show(resultEl, immediate ? "Cancelled immediately." : "Scheduled to cancel at period end.", "ok");
  }
  refresh();
}

// ─── Quick actions ────────────────────────────────────────────────────────────

async function quickMarkDue(id, btn) {
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "…";
  try {
    await fetch(`/api/subscriptions/${encodeURIComponent(id)}/simulate-due`, { method: "POST" });
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
    refresh();
  }
}

// ─── Billing cycle ────────────────────────────────────────────────────────────

document.getElementById("run-billing").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    const r = await fetch("/api/billing/run", { method: "POST" }).then((r) => r.json());
    document.getElementById("last-run").textContent =
      `Last run: ${r.charged.length} charged, ${r.retried.length} retried, ${r.ended.length} ended`;
  } catch (err) {
    alert(`Billing run failed: ${err}`);
  } finally {
    e.target.disabled = false;
    refresh();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function api(id, action, body) {
  try {
    const res = await fetch(`/api/subscriptions/${encodeURIComponent(id)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok && !data.error, ...data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function show(el, msg, type) {
  el.hidden = false;
  el.textContent = msg;
  el.className = `modal-result modal-result--${type}`;
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

loadPlans().then(refresh);
setInterval(refresh, 30000); // slowed to 30s temporarily for debugging
