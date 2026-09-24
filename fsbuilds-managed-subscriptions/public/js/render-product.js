/**
 * Same Subscribe-button pattern as render-storefront.js - see
 * subscribe-actions.js for the click-handling and redirect logic.
 */

FS.onReady((items) => {
  const params = new URLSearchParams(window.location.search);
  const requestedPath = params.get("product");
  const item = items.find((p) => p.path === requestedPath);
  const container = document.getElementById("product-detail");

  checkPendingSubscribeRedirect(items);

  if (!item) {
    container.innerHTML =
      '<p style="color: var(--text-secondary);">' +
      "Product not found. Check the ?product= value against paths in " +
      "store.config.js and your FastSpring checkout's homepage products.</p>";
    return;
  }

  const image = item.image || "";
  const priceLine = formatIntervalAndTrial(item);
  const description = item.descriptionFull || "";
  const name = item.display || item.path;
  const selectedPath = currentlySelectedPath(items);
  const isCurrentPlan = item.path === selectedPath;

  container.innerHTML = `
    ${image ? `<img src="${image}" alt="${name}" />` : "<div></div>"}
    <div>
      <h1 class="product-detail-title">${name}</h1>
      <div class="product-detail-price">${priceLine}</div>
      <p class="product-detail-description">${description}</p>
      <div class="button-row">
        ${
          isCurrentPlan
            ? `<span class="button-link plan-current-badge">Current Plan</span>`
            : `<button class="button-primary" data-subscribe-path="${item.path}">
                 Subscribe
               </button>`
        }
      </div>
    </div>
  `;

  const subscribeBtn = container.querySelector("[data-subscribe-path]");
  if (subscribeBtn) {
    subscribeBtn.addEventListener("click", () => {
      handleSubscribeClick(item.path, selectedPath);
    });
  }
});
