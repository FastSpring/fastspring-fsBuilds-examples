# FSBuilds: SyncWrx Subscription Storefront

> **This project has two services.** This README covers the **storefront**
> (port 4000) — the customer-facing plan grid and checkout. The companion
> **subscription management backend** lives in `enterprise-backend/`
> (port 4100) and owns billing schedule, dunning, plan changes, and
> MRR/ARR/churn reporting. See `enterprise-backend/README.md`.
>
> Because these are Managed subscriptions, the storefront alone will let
> customers subscribe but **never charge them** — the backend is what
> triggers every charge.

A config-driven FastSpring embedded storefront for **SyncWrx** ("Software
that works in sync") - one active subscription at a time, straight to
checkout on "Subscribe". Generated from the FSBuilds subscription
storefront template.

**All three plans (Essentials, Professional, Advanced) are configured as
Managed subscriptions** - this demo's whole point is proving out that a
third-party system can tell FastSpring when to charge, so every tier
needs to demonstrate that, not just one. If you ever swap one to Standard
for comparison, expect its product card to show a billing interval where
the managed ones show none - see the "billing interval" note below for
why that's expected.

This is a fork of the generic (one-time-purchase) storefront template, so
it inherits the same two fixed bugs documented there (double callback
wiring, and the SBL script needing to be static markup rather than
JS-injected) - see `templates/generic/README.md` if you hit either
symptom (Add/Subscribe buttons doing nothing, zero console output).

---

## How this differs from the generic template

- **One active subscription at a time.** Clicking "Subscribe" on a
  different plan automatically removes whatever was previously selected
  before adding the new one - see `public/js/subscribe-actions.js`.
- **Straight to checkout.** There's no cart, toast, or mini-cart dropdown.
  Clicking "Subscribe" removes/adds via `fastspring.builder` directly
  (not `data-fsc-action`, since this needs logic a declarative attribute
  can't express), waits for FastSpring's own data callback to confirm the
  selection, then navigates straight to `checkout.html`.
- **Billing interval / trial display is unconfirmed, and won't show
  anything for these three plans regardless.** `fastspring-init.js` tries
  several candidate field names (`intervalUnit`, `trialDays`, etc.) based
  on FastSpring's REST API naming, the same fallback pattern already used
  for price - but nobody has yet confirmed these against a real
  subscription product's actual `dataCallback` payload. Separately, since
  Essentials/Professional/Advanced are all Managed subscriptions, none of
  them have a FastSpring-tracked billing cycle in the first place - so
  don't read "no interval showing" as evidence the field names are
  wrong. **First real use:** open the browser console (payload is already
  logged) to sanity-check the raw item shape either way.

## FastSpring setup - already done for this demo

Product paths already in `config/store.config.js` and this demo's
`.env`:

- Checkout: `fsbuilds.test.onfastspring.com/embedded-SyncWrx`
- Plans: `essentials` (Essentials), `professional` (Professional, badged
  "Most Popular"), `advanced` (Advanced) - all three set up as Managed
  subscriptions.

If a plan doesn't show up on the storefront, the most common cause is a
product not yet added to that checkout's **Homepage Products** list in
FastSpring - directives/callbacks only populate for products added
there. Confirm your local/test domain is whitelisted on the checkout too.

For the general setup flow (subscription type, billing cycle vs. managed,
trial config), see `templates/subscription/README.md` in the skill this
was generated from.

## Local setup

This folder was delivered to you as a `.zip` (not cloned from a repo) -
so the first step is unzipping it and getting a terminal pointed at it:

1. Unzip it, then save/move the resulting folder to wherever you keep
   local projects.
2. Open a terminal *inside this folder specifically*. In VS Code: open
   the folder in VS Code, then **View > Terminal** (or right-click the
   folder in the file explorer and choose "Open in Integrated Terminal"
   if available). If unsure of the path, right-click the folder and
   **Copy Path**, then `cd` to it.
3. Confirm you're in the right place: `ls` should show `package.json`,
   `server/`, `public/`, and `config/`.

```bash
npm install
npm start
```

`.env` is already filled in with this demo's real values, so those two
commands should be all it takes.

**What success looks like:** the terminal prints
`Storefront running at http://localhost:4000` - that's the cue to open
the URL in a browser, not before. If nothing prints or an error shows,
read the actual message before troubleshooting.

Visit `http://localhost:4000`, view page source, confirm `{{STOREFRONT_URL}}` /
`{{SBL_SCRIPT_URL}}` resolved to real values before clicking anything.


## Structure

```
.env                     <- STOREFRONT_URL, SBL_SCRIPT_URL (not committed)
config/store.config.js   <- products, brand, display config
public/
  index.html             <- plan grid, no cart control
  product.html           <- plan detail + same header
  checkout.html          <- FastSpring's payment form renders here
  css/style.css
  js/
    fastspring-init.js    <- callbacks + price/interval/trial normalization
    apply-brand.js
    subscribe-actions.js  <- single-active-subscription enforcement,
                             go-straight-to-checkout redirect logic
    render-storefront.js
    render-product.js
    render-checkout.js
server/
  index.js               <- unchanged from generic - templates HTML from
                             .env, serves everything else, webhook stub
```

## What NOT to vary

Same rules as the generic template's "What NOT to vary" section in
`SKILL.md` still apply here: the static `<script id="fsc-api">` tag, only
`data-data-callback` wired, and no listeners on genuine `data-fsc-action`
elements. The one deliberate exception is the Subscribe button itself,
which is intentionally a plain button with a real listener - it never
carries `data-fsc-action` in the first place, so that rule doesn't apply
to it (see `subscribe-actions.js` for why).
