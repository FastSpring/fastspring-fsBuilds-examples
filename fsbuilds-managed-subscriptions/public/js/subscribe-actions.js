/**
 * SUBSCRIBE ACTIONS: single-active-subscription enforcement + go straight
 * to checkout on Subscribe
 * ============================================================================
 * This replaces cart-ui.js from the generic template. There's no cart, no
 * toast, no mini-cart dropdown here - per how this template was scoped,
 * only one subscription can be selected at a time, and clicking
 * "Subscribe" goes straight to the dedicated checkout page rather than
 * staying on the page to let someone keep browsing.
 *
 * Because both of those behaviors require logic beyond what a declarative
 * data-fsc-action attribute can do (removing a DIFFERENT item before
 * adding this one, then navigating), Subscribe buttons in this template
 * are plain buttons with a real, permanent click listener calling
 * fastspring.builder.add()/.remove() directly - NOT data-fsc-action
 * elements. That's a deliberate exception to the generic template's "no
 * JS listeners on data-fsc-action elements" rule: it doesn't apply here
 * because these buttons never carry data-fsc-action in the first place,
 * so there's nothing for FastSpring's clone-and-rebind pass to strip.
 *
 * Flow on a Subscribe click:
 *   1. If a different item is currently selected, remove it.
 *   2. Add the newly-clicked item.
 *   3. Wait for the next dataCallback firing with THIS item selected,
 *      then redirect to checkout.html.
 * Step 3 has to be driven by the data callback (not assumed to happen
 * immediately after step 2) because add()/remove() are async calls to
 * FastSpring's backend - the selection isn't real until the callback
 * confirms it.
 */

/**
 * SUBSCRIBE ACTIONS: single-active-subscription enforcement + go straight
 * to checkout on Subscribe
 * ============================================================================
 * Flow on a Subscribe click:
 *   1. If a different item is currently selected, remove it and set
 *      _pendingAddPath so the next dataCallback can complete the add once
 *      the remove is confirmed. Don't call add() immediately - that's the
 *      race condition that caused Products: Array(2) in the session.
 *   2. If nothing is currently selected, add directly.
 *   3. Once the dataCallback confirms the new item is selected, redirect
 *      to checkout.html.
 */

let _pendingSubscribePath = null;
let _pendingAddPath = null;

function handleSubscribeClick(path, currentlySelectedPath) {
  if (currentlySelectedPath && currentlySelectedPath !== path) {
    // Remove first - don't add yet. The dataCallback will fire once
    // FastSpring confirms the remove, and checkPendingAdd() below will
    // then issue the add() at the right moment.
    _pendingAddPath = path;
    _pendingSubscribePath = null;
    fastspring.builder.remove(currentlySelectedPath);
  } else {
    // Nothing to remove - add directly.
    _pendingAddPath = null;
    _pendingSubscribePath = path;
    fastspring.builder.add(path);
  }
}

// Called on every dataCallback firing. If we're waiting to add after a
// remove, check whether the old item is now gone before issuing the add.
function checkPendingAdd(items) {
  if (!_pendingAddPath) return;
  const stillSelected = items.find((p) => p.selected);
  if (!stillSelected) {
    // Remove confirmed - now safe to add.
    const pathToAdd = _pendingAddPath;
    _pendingAddPath = null;
    _pendingSubscribePath = pathToAdd;
    fastspring.builder.add(pathToAdd);
  }
}

// Called on every dataCallback firing - checks whether the item we're
// waiting on has now actually been selected, then redirects.
function checkPendingSubscribeRedirect(items) {
  checkPendingAdd(items);
  if (!_pendingSubscribePath) return;
  const match = items.find((p) => p.path === _pendingSubscribePath && p.selected);
  if (match) {
    _pendingSubscribePath = null;
    window.location.href = "checkout.html";
  }
}

function currentlySelectedPath(items) {
  const selected = items.find((p) => p.selected);
  return selected ? selected.path : null;
}

/**
 * Human-readable interval line, e.g. "$29/mo". `item.intervalText` comes
 * from store.config.js (see fastspring-init.js's resolveIntervalText) -
 * for these MANAGED subscriptions it's unenforced marketing copy only
 * (there's no real FastSpring billing cycle to mirror), so keep it in
 * sync by hand with whatever the enterprise-backend actually charges.
 */
function formatIntervalAndTrial(item) {
  let line = item.price || "";
  if (item.intervalText) line += item.intervalText;
  return line;
}
