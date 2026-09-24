/**
 * STORE CONFIG
 * ============
 * Product, brand, and display config - the things that are safe to load
 * however/whenever, since they don't affect FastSpring's own script.
 *
 * IMPORTANT: `storefrontUrl` and `sblScriptUrl` are NOT here anymore.
 * They now live in `.env` and get templated directly into a static
 * <script id="fsc-api"> tag in index.html/product.html by the server.
 * This is a deliberate fix, not a simplification for its own sake - see
 * README's "What was actually wrong" section for the full explanation,
 * but in short: FastSpring's own script only finishes initializing its
 * click-handling logic inside a DOMContentLoaded listener. A script tag
 * inserted dynamically via JS (which is what this template used to do,
 * reading the URL from this file) downloads asynchronously and misses
 * that DOMContentLoaded window entirely, silently, with no error - which
 * is exactly what caused Add/Remove clicks to do nothing. Every official
 * FastSpring example uses a static script tag for this exact reason.
 *
 * Setup order:
 *   1. In FastSpring, create your products as SUBSCRIPTIONS (Store >
 *      Products) - as a Managed subscription specifically if this demo
 *      is standing in for managed-subscription behavior, rather than
 *      automatic rebilling. See this template's README.
 *   2. Go to Checkouts > Embedded Checkouts and use an existing one, or
 *      create a new one. Add every product you want visible to its
 *      Homepage Products list - directives/callbacks only populate for
 *      products added there.
 *   3. Copy the storefront path + script src from that checkout's
 *      "Place on your Website" snippet into .env (STOREFRONT_URL,
 *      SBL_SCRIPT_URL) - see .env.example.
 *   4. Match each `path` below to the exact product path in FastSpring.
 *   5. Whitelist your test domain (e.g. localhost) on that checkout.
 */

window.STORE_CONFIG = {
  brand: {
    name: "SyncWrx",
    tagline: "Software that works in sync",
    // "Rich, tech-forward blue" - a deep, saturated blue rather than a
    // pale/pastel one. Adjust if this isn't quite the shade in mind.
    primaryColor: "#1B4FD1",
    logoText: "SyncWrx",
  },

  // Every value here maps to a CSS custom property (see apply-brand.js),
  // which style.css already references with fallbacks - so a fork can
  // retheme the whole storefront from this one object, no CSS editing
  // needed. Omit any field to keep style.css's built-in default.
  theme: {
    // Dark gray instead of near-black, per request.
    textColor: "#333333",
    backgroundColor: "#f4f3f1",
    surfaceColor: "#ffffff",
    // Rich, saturated green - same tonal register as the primary blue
    // (not pastel/neon). Adjust if this isn't quite the shade in mind.
    borderColor: "#1B9E5C",
    borderWidth: "3px",
    // Clearly rounded, but not pill/circle-like.
    borderRadius: "16px",
    // Manrope - modern, humanist sans, loaded via Google Fonts link tags
    // in each HTML file's <head>. Falls back to the system stack if the
    // font fails to load for any reason.
    fontFamily: "'Manrope', -apple-system, \"Segoe UI\", Roboto, sans-serif",
  },

  display: {
    productImageFit: "cover",
    productImageAspectRatio: "1 / 1",
    productImagePadding: "0px",
  },

  // Feature checklist for pricing cards. `included: true` renders a green
  // checkmark; `included: false` renders a greyed-out row, showing the
  // feature exists but isn't in this tier - making the upgrade path clear.
  features: [
    { label: "All-in-one management suite" },
    { label: "iOS & Android mobile apps" },
    { label: "Basic monitoring & tasking" },
    { label: "Social toolset" },
    { label: "Productivity reporting" },
    { label: "Approval workflow" },
    { label: "Competitive benchmarks" },
    { label: "Custom automation tools" },
    { label: "Scheduled report delivery" },
    { label: "Priority support" },
  ],

  products: [
    {
      tier: "essentials",
      displayName: "Essentials",
      includedFeatures: [0, 1, 2, 3],
      variants: [
        { path: "essentials-monthly", intervalText: "/mo", label: "Monthly" },
        { path: "essentials-yearly", intervalText: "/yr", label: "Yearly" },
      ],
    },
    {
      tier: "advanced",
      displayName: "Advanced",
      badge: "Most Popular",
      featured: true,
      includedFeatures: [0, 1, 2, 3, 4, 5, 6],
      variants: [
        { path: "advanced-monthly", intervalText: "/mo", label: "Monthly" },
        { path: "advanced-yearly", intervalText: "/yr", label: "Yearly" },
      ],
    },
    {
      tier: "professional",
      displayName: "Professional",
      includedFeatures: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      variants: [
        { path: "professional-monthly", intervalText: "/mo", label: "Monthly" },
        { path: "professional-yearly", intervalText: "/yr", label: "Yearly" },
      ],
    },
  ],
};
