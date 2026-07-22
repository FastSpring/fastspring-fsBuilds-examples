/**
 * Builds the URL to the hosted Eggblast Arena webshop, pre-filled for a given
 * product and player.
 *
 * This fork does NOT render checkout itself. Instead, the "Complete Purchase"
 * button links to the game's own webshop (WEBSHOP_URL), which is a full
 * FastSpring SBL storefront. That page reads three query params and pre-fills
 * the cart + buyer identity:
 *
 *   uname = Discord username
 *   uid   = Discord user id
 *   prod  = FastSpring product path to pre-select
 *
 * (The hosted page also accepts an optional `coupon` param.) The Discord
 * identity flows through as FastSpring order tags at checkout, so the webhook
 * can still confirm the purchase and passively link the account.
 *
 * SECURITY NOTE (production hardening):
 * These values ride in the URL query string. The link is generated server-side
 * per interaction and shown only to the player who ran /store, so tampering is
 * low-risk for in-game items. For higher-value goods, sign or encrypt these
 * params (see FastSpring "Secure Payloads") so a player can't edit the URL to
 * credit a different account.
 */
const DEFAULT_WEBSHOP_URL = 'https://eggblast.fastspringexamples.com/';

function buildCheckoutUrl(productPath, discordUserId, discordUsername) {
  const base = process.env.WEBSHOP_URL || DEFAULT_WEBSHOP_URL;

  const params = new URLSearchParams({
    uname: discordUsername,
    uid: discordUserId,
    prod: productPath,
  });

  // Preserve a single "?" whether or not base already has a trailing slash.
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${params.toString()}`;
}

/** The webshop's base URL (no params) — for a "browse the whole store" link. */
function browseUrl() {
  return process.env.WEBSHOP_URL || DEFAULT_WEBSHOP_URL;
}

/**
 * A product deep link WITHOUT a buyer identity — for public announcements shown
 * to the whole server (where there's no single player to tag). Pre-selects the
 * product; the buyer's identity is handled when they reach the web shop.
 */
function featureUrl(productPath) {
  const base = process.env.WEBSHOP_URL || DEFAULT_WEBSHOP_URL;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}prod=${encodeURIComponent(productPath)}`;
}

module.exports = { buildCheckoutUrl, browseUrl, featureUrl };
