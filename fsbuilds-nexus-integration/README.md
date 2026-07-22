# FSBuilds: Nexus + FastSpring Embedded Checkout Integration

This is a working reference implementation showing how to connect a [Nexus](https://nexus.gg) creator program to a [FastSpring](https://fastspring.com) embedded checkout. It demonstrates the full flow: a buyer enters a creator code, the code is validated against Nexus, a discount is optionally applied, and after purchase the attribution is recorded in Nexus so the creator gets credit.

This project lives inside FastSpring's [fastspring-fsBuilds-examples](https://github.com/FastSpring/fastspring-fsBuilds-examples) repo, alongside other FSBuilds projects — standalone templates that show developers how to set up specific FastSpring integrations.

> **Note:** This is a reference example, not an actively maintained SDK or library. It reflects the FastSpring and Nexus APIs as of its publish date and may not account for later changes to either platform. Check the linked documentation below for current behavior before building on this.

---

## What This Integration Does

When a buyer enters a creator code at checkout, three things happen in order:

1. **Your server asks Nexus** — "Is this a real creator code in my program?" Nexus responds with the creator's name if valid, or an error if not. This happens before the purchase using your Nexus **public key**.

2. **FastSpring applies a discount** (optional) — If the code also matches a FastSpring coupon you've set up, the buyer sees a discount applied in the checkout. Attribution-only codes work too — no coupon required.

3. **After purchase, your server tells Nexus** — FastSpring fires a webhook to your server when the order completes. Your server reads the coupon code from that webhook and calls Nexus to record the attribution using your Nexus **private key**. The creator gets credited automatically.

Your server is the bridge between FastSpring and Nexus. FastSpring and Nexus never talk to each other directly — your server handles both sides. This is intentional: it keeps your private key off the browser and gives you full control over the flow.

---

## The Four Creator Code States

| Code Type | What Happens |
|-----------|-------------|
| Valid Nexus creator code + matching FastSpring coupon | Discount applied + "Thanks for supporting [Creator]!" message |
| Valid Nexus creator code only (no coupon) | "Thanks for supporting [Creator]!" message, no discount |
| Valid FastSpring coupon only (not a Nexus creator) | Discount applied, no creator message |
| Matches neither Nexus nor FastSpring | Error message shown to buyer |

---

## Prerequisites

Before you can run this integration you'll need accounts and credentials from three places:

**[FastSpring](https://fastspring.com)**
You need a FastSpring account with an embedded checkout storefront set up. This is where your products live and where buyers complete their purchase.

**[Nexus](https://nexus.gg)**
You need a Nexus publisher account with a creator program set up, and at least one creator with a code. You'll need your Nexus Public Key and Private Key from the Developer section of your program.

**[Node.js](https://nodejs.org)** (v18 or higher)
The server in this integration is built with Node.js. Node is the runtime that lets JavaScript run outside a browser — it's what powers your server.

**A public webhook endpoint**
FastSpring needs to send order data to your server after a purchase. During local development your server isn't reachable from the internet, so you need a tunneling tool to temporarily give it a public URL. [ngrok](https://ngrok.com) is the most common option — it creates a secure tunnel from a public URL to your local machine. If you're deploying to a hosted server (Railway, Render, etc.) you won't need ngrok.

---

## Setup

### 1. Get the project files

This project lives inside FastSpring's shared [fastspring-fsBuilds-examples](https://github.com/FastSpring/fastspring-fsBuilds-examples) repo as one folder among several. You don't need to clone the whole repo to use this integration — just grab the `fsbuilds-nexus-integration` folder:

1. Go to [fsbuilds-nexus-integration on GitHub](https://github.com/FastSpring/fastspring-fsBuilds-examples/tree/main/fsbuilds-nexus-integration)
2. Click the **`...`** menu at the top right of the file list
3. Select **Download directory**

This downloads just this folder as a zip — no git required. Unzip it, then open a terminal inside the unzipped folder for the rest of the steps below.

> **Want to track future updates instead of a one-time download?** Use a sparse checkout so you only pull this folder, but can still `git pull` updates later:
> ```bash
> git clone --no-checkout --filter=blob:none https://github.com/FastSpring/fastspring-fsBuilds-examples.git
> cd fastspring-fsBuilds-examples
> git sparse-checkout init --cone
> git sparse-checkout set fsbuilds-nexus-integration
> git checkout main
> cd fsbuilds-nexus-integration
> ```

### 2. Install dependencies

```bash
npm install
```

This installs Express (the server framework) and dotenv (loads your environment variables).

### 3. Create your `.env` file

Copy `.env.example` to a new file called `.env` in the project root:

```bash
cp .env.example .env
```

Then open `.env` and fill in your actual keys:

```
NEXUS_BASE_URL=https://api.nexus-dev.gg/v1
NEXUS_PUBLIC_KEY=your_nexus_public_key_here
NEXUS_PRIVATE_KEY=your_nexus_private_key_here
NEXUS_GROUP_ID=your_nexus_group_id_here
```

Use `https://api.nexus-dev.gg/v1` for sandbox testing. Switch to `https://api.nexus.gg/v1` for production.

Your Group ID appears in the Nexus API responses and in your Nexus dashboard under your creator program.

> **Never commit your `.env` file.** It is already in `.gitignore` so it will never be committed to GitHub — but worth knowing why: your `.env` contains private keys that should never be public.

### 4. Update the FastSpring storefront URL

In `index.html`, find the FastSpring script tag and replace the `data-storefront` value with your own storefront URL:

```html
<script
  id="fsc-api"
  src="https://sbl.onfastspring.com/sbl/1.0.7/fastspring-builder.min.js"
  type="text/javascript"
  data-storefront="YOUR_STOREFRONT_URL_HERE"
  data-continuous="true"
  data-data-callback="dataCallback">
</script>
```

### 5. Update the product path

In `index.html`, find this line and replace it with your product path from FastSpring:

```javascript
fastspring.builder.add("1000-eggblast-coins");
```

### 6. Start the server

```bash
node server.js
```

You should see:

```
Server running on port 3000
```

Your checkout page is now available at `http://localhost:3000`.

### 7. Set up your webhook endpoint

FastSpring needs a public URL to send order data to. If you're testing locally with ngrok:

```bash
ngrok http 3000
```

ngrok will give you a public URL that looks like `https://abc123.ngrok-free.app`. Your webhook endpoint is that URL plus `/webhook`:

```
https://abc123.ngrok-free.app/webhook
```

In your FastSpring dashboard, go to **Developer Tools → Webhooks → Add URL Endpoint** and paste that URL. Select the `order.completed` event.

> **Note:** Your ngrok URL changes every time you restart it on a free plan. You'll need to update the FastSpring webhook URL each time. When deploying to a hosted server, use your server's stable URL instead.

---

## How the Code Is Organized

```
fsbuilds-nexus-integration/
├── index.html       # The frontend — embedded checkout, creator code input, product display
├── server.js        # The backend — webhook handler, Nexus API calls
├── style.css        # Styles
├── .env             # Your secret keys (never committed to Git)
├── .env.example     # Template showing which keys are needed — copy this to .env
└── package.json     # Node dependencies
```

**`index.html`** handles everything the buyer sees and interacts with. It uses the [FastSpring Store Builder Library (SBL)](https://developer.fastspring.com/reference/store-builder-library-overview) to render the embedded checkout and display product info dynamically. When a buyer enters a creator code, the page calls your server to validate it.

**`server.js`** handles everything that needs to be kept private. It receives webhooks from FastSpring, validates creator codes against the Nexus API, and posts attributions to Nexus after a purchase. Your Nexus private key only ever exists here — never in the browser.

---

## Testing

Use FastSpring's test card for purchases. You can find the CVV, unique to you, in your FastSpring dashboard.

- **Card number:** `4242 4242 4242 4242`
- **Expiry:** any future date

To test all four creator code states you'll need:

- A code that exists in **both Nexus and FastSpring** (as a coupon) → discount + creator message
- A code that exists in **Nexus only** (no matching FastSpring coupon) → creator message, no discount
- A code that exists in **FastSpring only** (not a Nexus creator) → discount, no creator message
- A code that **matches neither** → error message

---

## Security Notes

- Your Nexus **public key** is used for validation at code entry. It lives in `.env` and is only ever called from your server — not the browser.
- Your Nexus **private key** is used for attribution after purchase. It also lives in `.env` and never touches the browser.
- Never commit your `.env` file. The `.gitignore` in this repo already excludes it.
- In production, verify FastSpring webhook signatures to ensure requests are genuinely from FastSpring. See [FastSpring webhook security](https://developer.fastspring.com/reference/webhooks-overview) for details.

---

## Related Resources

- [Nexus API Documentation](https://docs.nexus.gg/api-quick-start-guide)
- [Nexus Key Documentation](https://docs.nexus.gg/api-quick-start-guide#if-you-must-use-a-global-key)
- [FastSpring Store Builder Library](https://developer.fastspring.com/reference/store-builder-library-overview)
- [FastSpring Webhooks Reference](https://developer.fastspring.com/reference/webhooks-overview)
