# FastSpring Unity Integration Example — Google External Content Links

This repository contains all components necessary to run a FastSpring-powered checkout flow with Unity, including support for Google's External Content Links (steering token) program.

## Overview

This proof of concept demonstrates how a Unity-based Android game can direct users to an external FastSpring web checkout while remaining compliant with Google Play's External Content Links program. The flow is:

1. Player taps "Buy" in the Unity game
2. App requests a secure payload from the backend (validates the player's UGS token and encrypts the FastSpring session)
3. App requests a Google external transaction token (required for Play Store compliance)
4. FastSpring web checkout opens in a Chrome Custom Tab overlay
5. Player completes purchase
6. FastSpring fires a webhook to the backend
7. Backend calls UGS Cloud Code to credit the player's coin balance
8. Player is automatically returned to the game

---

## Important: Google External Content Links Enrollment

**Before the Google steering token will work, you must enroll your app in Google's External Content Links program.**

- Go to Google Play Console → your app → Monetize → Alternative Billing
- Apply for External Content Links enrollment
- Google will review and approve the application (this can take several days)
- Until approved, `IsBillingProgramAvailableAsync()` returns `BillingUnavailable` — this is expected and non-blocking. The store opens normally without a token.

Without enrollment, the full flow still works — the steering token is simply omitted from the URL.

---

## Project Structure

- [`Backend`](Backend/README.md) — Node.js/Express backend that validates UGS tokens, encrypts FastSpring payloads, and processes purchase webhooks.
- [`Backend/WebCode`](Backend/WebCode/README.md) — Static HTML/JS web store page that renders the FastSpring embedded checkout. Served by the backend.
- [`Unity`](Unity/README.md) — Unity project that handles authentication, store launch, Chrome Custom Tabs, Google Billing integration, and post-purchase balance updates.

---

## Prerequisites

### FastSpring Account Configuration

1. Go to [FastSpring](https://fastspring.com/) and create an account.
2. Go to **Catalog → Products** and create a product (e.g. `coinpack-150`).
3. Go to **Checkouts → Embedded Checkouts** and create an embedded store. Note the storefront URL.
4. Assign your product to the embedded store under **Main Products**.
5. Go to **Developer Tools → Store Builder Library** and upload your public certificate.
   - See [`Backend/WebCode/certs/how_to_generate_certs.txt`](Backend/WebCode/certs/how_to_generate_certs.txt) for certificate generation instructions.
   - The private key is used by the backend to encrypt payloads. Keep it secret and never commit it to the repository.
6. Configure your webhook under **Developer Tools → Webhooks → Add Webhook**:
   - **URL:** your backend `/webhook` endpoint (e.g. `https://your-backend.com/webhook`)
   - **Events:** `order.completed`
   - Use a single webhook — duplicate webhooks will cause double coin credits.

### Unity Gaming Services Account

This integration uses three UGS services:

- **[Authentication](https://docs.unity.com/ugs/manual/authentication/manual/overview)** — anonymous sign-in to identify players
- **[Economy](https://docs.unity.com/ugs/manual/economy/manual)** — stores and updates player coin balances
- **[Cloud Code](https://docs.unity.com/ugs/manual/cloud-code/manual)** — server-side script that safely credits coins after purchase

Setup steps:
1. Create a UGS project at [cloud.unity.com](https://cloud.unity.com)
2. Note your **Project ID** and **Environment ID**
3. Under **Administration → Service Accounts**, create a service account and generate a key
4. Add the following project roles to the service account: **Cloud Code Script Publisher** (and any other roles needed for your services)
5. Base64-encode `keyID:secretKey` — this is your `UGS_SERVICE_ACCOUNT_SECRET`
6. Under **LiveOps → Economy**, create a currency with Resource ID `COINS` and publish it
7. Under **Cloud Code → Scripts**, create and publish a script named `VirtualPurchase` (see [`Backend/app/handler/webhook.ts`](Backend/app/handler/webhook.ts) for the expected interface)

### Backend Hosting

The backend is a Node.js/Express server. This example uses [Railway](https://railway.app/) but any Node.js hosting provider works (Heroku, Render, AWS, GCP, etc.).

Required environment variables:

| Variable | Description |
|---|---|
| `UGS_PROJECT_ID` | Your UGS project ID |
| `UGS_ENV_ID` | Your UGS environment ID |
| `UGS_SERVICE_ACCOUNT_SECRET` | Base64-encoded `keyID:secretKey` from your UGS service account — **not** the full `Authorization: Basic ...` string, just the base64 portion |
| `PEM_PRIVATE_KEY` | Your RSA private key in PEM format (no quotes) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON key of a Google Cloud service account granted access to the app in Play Console. Used by `/reportTransaction` |
| `DATABASE_URL` | Postgres connection string. Used by `/reportTransaction` and the `order.completed` webhook to store and look up real Google order data (amount/currency/time, not values computed client-side), and by `/recordExternalPurchaseTap` to durably store Apple external-purchase link taps (audit data Apple can request). Needs a real database (e.g. Railway's Postgres plugin), not an in-memory store — a request can arrive before the corresponding webhook does, and Apple's taps are not a cache |
| `FASTSPRING_WEBHOOK_SECRET` | The webhook secret configured for this store in the FastSpring dashboard (Integrations → Webhooks). `/webhook` verifies every delivery's `X-FS-Signature` (HMAC-SHA256 over the raw body) against this and **fails closed** — until this is set to match, `/webhook` rejects every request with 500, so no currency is ever granted from a real purchase either. Must be set before deploying this branch. |
| `APPLE_ISSUER_ID` | Issuer ID from App Store Connect → Users and Access → Integrations → App Store Connect API. Used by `/validateApplePurchase` to authenticate to Apple's App Store Server API |
| `APPLE_KEY_ID` | Key ID for the App Store Connect API key created alongside the issuer ID above |
| `APPLE_PRIVATE_KEY` | The `.p8` private key's contents (PEM format, no quotes) downloaded when that API key was created — Apple only lets you download it once, store it somewhere durable before losing access to the download |

The backend serves the API endpoints and also serves the `Backend/WebCode` static files from the same origin.

### Scheduling Apple Reporting

`POST /reportExternalPurchases` sends every un-reported external purchase tap to Apple's External Purchase Server API. Apple requires this at least monthly, before the 15th — but this endpoint only does the work when called, it doesn't schedule itself. Wire an actual scheduler to call it on that cadence (e.g. a [Railway Cron Job](https://docs.railway.com/reference/cron-jobs) hitting this URL), or trigger it manually until that's set up. Calling it more often than monthly is harmless — it only acts on taps that are still unreported.

### Google Play Console

1. Create or use an existing app in Google Play Console
2. Upload a signed AAB to the internal testing track
3. Apply for **External Content Links** enrollment under **Monetize → Alternative Billing**
4. Add testers and distribute via the internal testing opt-in link

---

## Debugging Notes

The backend includes development/debugging utilities that are not required for production:

- **`/version` endpoint** in `server.ts` — returns deployment info, useful for confirming Railway has the latest build
- **`console.error` logging** in `server.ts` and `webhook.ts` — logs errors to the hosting provider's log output. Recommended to keep in production for visibility.
- **`uncaughtException` / `unhandledRejection` handlers** in `server.ts` — catch silent startup crashes. Recommended to keep.

---

## Google External Content Links — Technical Notes

Google's documentation covers this flow in Kotlin/Java only. Unity developers must use Unity IAP's `ExternalBillingProgramClient` class (available in Unity IAP 4.15+ / 5.2+), which wraps the same underlying Google Play Billing Library.

Key points:
- There is no official Unity documentation for this implementation beyond the changelog entry confirming the class exists
- `ExternalBillingProgramClient` is in the `UnityEngine.Purchasing.GoogleBilling.Models` namespace
- `GoogleBillingResponseCode` is in `UnityEngine.Purchasing.Models` (different namespace)
- The class requires two assembly references in `Main.asmdef`: `Unity.Purchasing.Stores` (GUID: `08d1c582746949b40ba6a45cdb776bdf`) and `Unity.Purchasing` (GUID: `60bfecf5cb232594891bc622f40d6bed`)
- The platform guard (`#if UNITY_ANDROID && !UNITY_EDITOR`) must be **inside** the class, not wrapping the entire class, so the component can be attached in the Unity Editor

See [`Unity/Assets/Scripts/Managers/GoogleBillingManager-documentation.md`](Unity/Assets/Scripts/Managers/GoogleBillingManager-documentation.md) for full implementation details.

---

## Chrome Custom Tabs

The store opens in a Chrome Custom Tab overlay (not a full external browser) so the user never fully leaves the app. This requires the `ANDROID_CHROMETABS` scripting define symbol to be set in Unity:

**Edit → Project Settings → Player → Android → Other Settings → Scripting Define Symbols → add `ANDROID_CHROMETABS`**

This is already configured in this project. When building for distribution, ensure this define is present.