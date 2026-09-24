/**
 * FASTSPRING CALLBACKS
 * ====================
 * The actual <script id="fsc-api"> tag is now static markup in
 * index.html/product.html (templated server-side from .env), NOT
 * created here via JS. See store.config.js's header comment and the
 * README for exactly why that changed - in short, a dynamically-inserted
 * script tag downloads asynchronously and misses the DOMContentLoaded
 * window FastSpring's own script depends on internally to finish
 * initializing its click-binding logic, which silently broke every
 * Add/Remove button with zero error output.
 *
 * This file now only defines the callback functions that static tag
 * references, plus the FS.onReady() convenience wrapper the render
 * scripts use.
 *
 * Only data-data-callback is wired (not also data-after-markup-callback
 * pointed at the same function) - both fire on every update per the
 * actual source, and double-rendering caused a separate, now-fixed bug
 * where freshly-rebuilt buttons missed FastSpring's own binding pass.
 */

window.FS = (function () {
  const readyCallbacks = [];
  let latestData = null;

  function resolvePrice(item) {
    const candidates = ["price", "priceTotal", "unitPrice"];
    for (const key of candidates) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return item[key];
      }
    }
    console.warn("Could not find a price field on this item:", item);
    return "";
  }

  function resolvePriceValue(item) {
    const candidates = ["priceValue", "unitPriceValue", "priceTotalValue"];
    for (const key of candidates) {
      if (typeof item[key] === "number") return item[key];
    }
    return null;
  }

  // CONFIRMED (from FastSpring's own Directives reference, the complete
  // list of every value the Store Builder Library exposes client-side):
  // there is no billing-interval directive at all. That's doubly true
  // here specifically - Essentials/Professional/Advanced are all
  // configured as MANAGED subscriptions, where FastSpring's own
  // product-setup docs say to skip the Billing Cycle field entirely,
  // since there IS no FastSpring-tracked rebill schedule for a managed
  // subscription by design. Charges only happen when the
  // enterprise-backend service calls the Subscriptions API's charge
  // endpoint.
  //
  // So `intervalText` below is NOT mirroring a real FastSpring setting -
  // there's nothing in FastSpring to mirror. It's purely seller-authored
  // marketing copy for setting customer expectations, and it is NOT
  // enforced anywhere. If the enterprise-backend's actual charge cadence
  // ever changes, this text won't - update it by hand.
  function resolveIntervalText(path) {
    for (const entry of window.STORE_CONFIG.products) {
      if (entry.path === path) return entry.intervalText || null;
      if (entry.variants) {
        const variant = entry.variants.find((v) => v.path === path);
        if (variant) return variant.intervalText || null;
      }
    }
    return null;
  }

  function normalizeItem(item) {
    const description = item.description || {};
    const path = item.product || item.path;
    return {
      path,
      display: item.display,
      descriptionSummary: description.summary || "",
      descriptionFull: description.full || description.summary || "",
      descriptionAction: description.action || "Details",
      badge: item.badge || null,
      image: item.image || "",
      price: resolvePrice(item),
      priceValue: resolvePriceValue(item),
      intervalText: resolveIntervalText(path),
      selected: !!item.selected,
    };
  }

  function resolveHeading(group) {
    const candidates = ["display", "description", "name", "title", "heading", "label"];
    for (const key of candidates) {
      const value = group[key];
      if (typeof value === "string" && value.trim()) return value;
      if (value && typeof value === "object" && typeof value.summary === "string" && value.summary.trim()) {
        return value.summary;
      }
    }
    console.warn("Could not find the group-level heading under any of", candidates.join(", "), group);
    return null;
  }

  function normalizeItems(fsdata) {
    console.log("FastSpring data callback fired - raw payload:", fsdata);
    const group = (fsdata && fsdata.groups && fsdata.groups[0]) || null;
    const rawItems = (group && group.items) || [];

    // Collect every valid path from config - handles both flat entries
    // ({ path }) and tiered variant entries ({ tier, variants: [{path}] }).
    // Bug that was here: .map(p => p.path) only worked for flat entries;
    // tiered entries have no top-level `path`, so their variant paths were
    // silently excluded from the filter, leaving Essentials/Advanced items
    // missing from latestItemsByPath entirely.
    const configuredPaths = new Set();
    for (const entry of window.STORE_CONFIG.products) {
      if (entry.path) configuredPaths.add(entry.path);
      if (entry.variants) entry.variants.forEach((v) => configuredPaths.add(v.path));
    }

    const items = rawItems
      .filter((item) => configuredPaths.has(item.product || item.path))
      .map(normalizeItem);
    const heading = group ? resolveHeading(group) : null;
    const orderTotal = fsdata && typeof fsdata.total === "string" ? fsdata.total : null;
    return { items, heading, orderTotal };
  }

  // Referenced by the static script tag's data-data-callback attribute.
  window.dataCallback = function (fsdata) {
    latestData = normalizeItems(fsdata);
    readyCallbacks.forEach((cb) => cb(latestData.items, latestData.heading, latestData.orderTotal));
  };

  // Referenced by data-error-callback.
  window.fsErrorCallback = function (errorCode, errorMessage) {
    console.error("FastSpring error callback fired:", errorCode, errorMessage);
  };

  return {
    onReady(cb) {
      if (latestData) {
        cb(latestData.items, latestData.heading, latestData.orderTotal);
      } else {
        readyCallbacks.push(cb);
      }
    },
  };
})();
