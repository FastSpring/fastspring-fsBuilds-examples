/**
 * Renders the single selected subscription's recap on the dedicated
 * checkout page. Only ever shows one line - this template enforces one
 * active subscription selection at a time (see subscribe-actions.js) -
 * but still reuses a list-style container in case that's ever revisited.
 *
 * FastSpring's own payment form renders itself into
 * #fsc-embedded-checkout-container automatically once data loads and at
 * least one item is selected - nothing here triggers that directly.
 */

FS.onReady((items) => {
  const list = document.getElementById("checkout-cart-list");
  if (!list) return;

  const selected = items.filter((p) => p.selected);

  if (selected.length === 0) {
    list.innerHTML =
      '<p class="cart-empty-message">No subscription selected. ' +
      '<a href="index.html">Choose a plan</a> to get started.</p>';
    return;
  }

  list.innerHTML = selected
    .map(
      (item) => `
    <div class="cart-line">
      <div class="cart-line-info">
        <div class="cart-line-name">${item.display || item.path}</div>
        <div class="cart-line-price">${formatIntervalAndTrial(item)}</div>
      </div>
      <button type="button" class="button-secondary cart-line-remove"
              data-fsc-item-path-value="${item.path}"
              data-fsc-action="Remove">
        Remove
      </button>
    </div>
  `
    )
    .join("");
});
