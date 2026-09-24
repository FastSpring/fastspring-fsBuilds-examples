/**
 * Renders a pricing-page style card per PLAN CONFIG in store.config.js.
 * Each card has:
 *   - A colored header banner with plan name, interval toggle (if variants),
 *     and price
 *   - A feature checklist with green checks (included) or gray rows (not
 *     included in this tier)
 *   - A Subscribe / Current Plan button at the bottom
 *
 * The featured card (advanced) is elevated with a stronger shadow and a
 * "Most Popular" ribbon on the header. Otherwise all cards use the same
 * SyncWrx brand blue header.
 *
 * No cart, no toast, no dropdown - single active subscription, straight to
 * checkout on Subscribe. See subscribe-actions.js for that logic.
 */

const displayedVariantPath = {};
let latestItemsByPath = {};

FS.onReady((items, heading) => {
  const headingEl = document.getElementById("page-heading");
  if (headingEl) headingEl.textContent = heading || "";

  checkPendingSubscribeRedirect(items);
  latestItemsByPath = Object.fromEntries(items.map((p) => [p.path, p]));
  renderGrid();
});

function normalizeCardConfig(entry) {
  if (entry.variants) return entry;
  return {
    tier: entry.path,
    displayName: entry.displayName,
    badge: entry.badge,
    featured: entry.featured || false,
    includedFeatures: entry.includedFeatures || [],
    variants: [{ path: entry.path, intervalText: entry.intervalText, label: null }],
  };
}

function renderGrid() {
  const grid = document.getElementById("product-grid");
  grid.innerHTML = "";

  const configs = (window.STORE_CONFIG.products || []).map(normalizeCardConfig);
  const features = window.STORE_CONFIG.features || [];

  if (!configs.length || !Object.keys(latestItemsByPath).length) {
    grid.innerHTML =
      '<p style="grid-column:1/-1;color:var(--text-secondary);">' +
      "No products loaded. Confirm the paths in store.config.js match " +
      "products added to this checkout's homepage in FastSpring.</p>";
    return;
  }

  const selectedPath = currentlySelectedPath(Object.values(latestItemsByPath));
  configs.forEach((cfg) => grid.appendChild(renderCard(cfg, selectedPath, features)));
}

function renderCard(cardConfig, selectedPath, features) {
  const variants = cardConfig.variants;

  if (!displayedVariantPath[cardConfig.tier]) {
    const activeVariant = variants.find(
      (v) => latestItemsByPath[v.path] && latestItemsByPath[v.path].selected
    );
    displayedVariantPath[cardConfig.tier] = (activeVariant || variants[0]).path;
  }

  const currentPath = displayedVariantPath[cardConfig.tier];
  const currentItem = latestItemsByPath[currentPath] || {};
  const currentVariant = variants.find((v) => v.path === currentPath) || variants[0];
  const isCurrentPlan = currentPath === selectedPath;
  const isFeatured = !!cardConfig.featured;
  const includedSet = new Set(cardConfig.includedFeatures || []);

  const toggleHtml =
    variants.length > 1
      ? `<div class="pricing-toggle" role="group" aria-label="Billing interval">
          ${variants
            .map(
              (v) =>
                `<button type="button"
                         class="pricing-toggle-btn${v.path === currentPath ? " active" : ""}"
                         data-variant-path="${v.path}"
                         data-tier="${cardConfig.tier}">
                   ${v.label || v.path}
                 </button>`
            )
            .join("")}
        </div>`
      : "";

  const price = currentItem.price ? currentItem.price + (currentVariant.intervalText || "") : "";

  const featuresHtml = features
    .map((f, i) => {
      const included = includedSet.has(i);
      return `<li class="feature-row${included ? "" : " feature-row--excluded"}">
        <span class="feature-check" aria-hidden="true">${included ? "✓" : "✕"}</span>
        <span>${f.label}</span>
      </li>`;
    })
    .join("");

  const ctaHtml = isCurrentPlan
    ? `<span class="pricing-cta pricing-cta--current">Current Plan</span>`
    : `<button type="button" class="pricing-cta pricing-cta--subscribe" data-subscribe-path="${currentPath}">
         Subscribe
       </button>`;

  const ribbonHtml = isFeatured
    ? `<span class="pricing-ribbon">${cardConfig.badge || "Most Popular"}</span>`
    : "";

  const card = document.createElement("div");
  card.className = `pricing-card${isFeatured ? " pricing-card--featured" : ""}`;

  card.innerHTML = `
    <div class="pricing-header">
      ${ribbonHtml}
      <h2 class="pricing-plan-name">${cardConfig.displayName}</h2>
      ${toggleHtml}
      <div class="pricing-price">${price}</div>
    </div>
    <div class="pricing-body">
      <ul class="feature-list">${featuresHtml}</ul>
      ${ctaHtml}
    </div>
  `;

  card.querySelectorAll("[data-variant-path]").forEach((btn) => {
    btn.addEventListener("click", () => {
      displayedVariantPath[btn.dataset.tier] = btn.dataset.variantPath;
      renderGrid();
    });
  });

  const subscribeBtn = card.querySelector("[data-subscribe-path]");
  if (subscribeBtn) {
    subscribeBtn.addEventListener("click", () => {
      handleSubscribeClick(currentPath, selectedPath);
    });
  }

  return card;
}
