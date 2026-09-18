# AppleExternalPurchaseManager.cs — Documentation

## Purpose

This script generates an Apple external purchase token immediately before a user is
directed from EggBlast Arena to the FastSpring web checkout on iOS. The token (plus its
type) is required by Apple's External Purchase Custom Link program to attribute the
resulting purchase back to the app session, the same role Google's external transaction
token plays on Android.

---

## How it was written

Unlike `GoogleBillingManager.cs`, this could not be written straight from the changelog
description alone. `manifest.json` was bumped from `com.unity.purchasing` 5.3.1 to 5.4.2
first (that's the version the Unity IAP changelog says added Apple support), then the
project was opened in the Unity Editor to let Package Manager actually resolve 5.4.2, at
which point `ExternalPurchaseClient.cs`, `ExternalPurchaseTokenType.cs`, and
`ExternalPurchaseNoticeType.cs` became readable out of
`Library/PackageCache/com.unity.purchasing@<hash>/Runtime/Stores/AppleAppStore/ExternalPurchase/`
and `Runtime/UnityPaymentProviders/`. Everything below is drawn from those three files
directly, not guessed at.

---

## The four steps it performs in order

1. **`CheckEligibilityAsync()`** — returns true only for an eligible App Store
   storefront (EU under DMA, or wherever else Apple has enrolled the app) with the
   entitlement granted. If false, the store still opens without a token — same
   non-blocking behavior as `GoogleBillingManager` returning null when Google's program
   isn't enrolled.
2. **`FetchStorefrontAsync()`** — returns the device's 3-letter ISO country code (e.g.
   `"JPN"`, `"DEU"`). Used to pick which token type(s) step 3 asks for, since Apple's
   token types are region-specific.
3. **`FetchTokenAsync(ExternalPurchaseTokenType)`** — generates a token. Per Apple's
   requirements (mirrored in `ExternalPurchaseClient`'s own doc comments), this happens
   immediately before the user is sent to the external URL. Called **twice** for EU
   storefronts (`Acquisition` then `Services`), once for Japan (`LinkOut`) — see the
   next section for why.
4. **`ShowNoticeAsync(ExternalPurchaseNoticeType)`** — shows Apple's required
   disclosure. This is the one place Apple's flow diverges structurally from Google's:
   Google's `LaunchExternalLink(storeUrl, ...)` takes the checkout URL and shows its
   dialog as part of opening it. Apple's `ShowNoticeAsync` takes no URL at all — Apple's
   own doc comment says to call `Application.OpenURL()` yourself right after it
   succeeds. That's why this manager shows the notice internally and returns the
   token(s) only after it succeeds, so the caller (`ShoppingManager`) can go straight
   from "got a token" to "open the URL" with nothing in between. Shown exactly once per
   purchase attempt regardless of how many tokens were fetched — it's tied to the
   purchase, not to each token.

---

## Why the return type isn't a bare string (or even a single struct)

`GoogleBillingManager.GetExternalTransactionToken()` returns a single string because
Google's reporting API only needs the opaque token. Apple's External Purchase Server API
needs the token **and** which type it was issued as (`ACQUISITION`, `SERVICES`, or
`LINK_OUT`) to report a transaction correctly — and, per Apple's own guidance, EU
storefronts are meant to request **both** an `ACQUISITION` and a `SERVICES` token per
purchase attempt, not choose one. So `GetExternalPurchaseTokens()` returns an
`ExternalPurchaseTokenResult[]` (0, 1, or 2 entries — empty on failure/ineligibility, one
for Japan, up to two for EU). `ShoppingManager` tags every entry onto the FastSpring
order (as `externalPurchaseToken1`/`externalPurchaseTokenType1`, and `...2`/`...2` when
present) alongside a shared `purchaseAttemptId`, so the backend can tell "these two
tokens are one purchase" apart from "two unrelated taps that landed close together in
time" when it comes time to report.

---

## The Acquisition/Services choice is no longer a simplification

An earlier version of this manager picked `ExternalPurchaseTokenType.LinkOut` for a
Japanese storefront and hardcoded `Acquisition` for everything else eligible — a
placeholder, since Apple's own doc comments describe `Acquisition` as for new customers
and `Services` as for existing customers buying add-ons, and choosing correctly between
the two at token-fetch time would require knowing whether this player has purchased
before.

The actual fix, per Apple's own guidance (quoted in
`docs/apple-external-purchase-compliance.md`): *"When a customer has both an ACQUISITION
and SERVICES token in the same active period, you can report transactions using just the
SERVICES token, and report the ACQUISITION token without any transactions."* So the
choice isn't made here at all — both tokens are always requested together for EU, and
the backend's reporting job (`server.ts`, `runReportExternalPurchases`) decides at report
time which one the actual sale attaches to (`SERVICES` gets the real line item if both
matched the same order; `ACQUISITION` gets reported as `NO_LINE_ITEM` alongside it). No
purchase-history tracking needed client-side after all.

---

## Assembly references required

Three new GUIDs were added to `Main.asmdef` beyond the two `GoogleBillingManager`
already needed (`Unity.Purchasing`, `Unity.Purchasing.Stores`):

| Assembly | GUID | Why |
|---|---|---|
| `Unity.Purchasing.Security` | `94e1de2458b07d0bf1e9f13e6ae06443` | Real `Obfuscator`, used on device builds |
| `Unity.Purchasing.SecurityStub` | `d0bf1e9f644394e1de13e6ae02458b07` | Stub `Obfuscator`, used in the Editor |
| `Unity.Purchasing.SecurityCore` | `e63a64384cc3ef04cac761c1ce76e9c2` | Shared dependency of both of the above |
| `Unity.Purchasing.PaymentProviderService` | `5fcb7e4e93eb4d15a3650e3ecb86c46c` | Where `ExternalPurchaseTokenType` actually lives |

The first three weren't about Apple's manager at all — they fixed a pre-existing
compile error in `Assets/Scripts/UnityPurchasing/generated/GooglePlayTangle.cs`
(`Obfuscator` not found), caused by Unity restructuring Unity IAP's obfuscation code
into its own assemblies between 5.3.1 and 5.4.2. `ExternalPurchaseClient` and
`ExternalPurchaseNoticeType` themselves didn't need a new reference — they live under
`Runtime/Stores/AppleAppStore/`, which falls under `Unity.Purchasing.Stores`, already
referenced.

---

## Scene setup

Same as `GoogleBillingManager`: attach to a GameObject under the `Systems` hierarchy
(alongside `AuthManager`, `ShoppingManager`, `GoogleBillingManager`) via **Add
Component**. Nothing platform-specific blocks this in the Editor — the class definition
and its public methods compile on every platform; only the body of
`GetExternalPurchaseToken()` is guarded to `UNITY_IOS && !UNITY_EDITOR`.

---

## What calls this script

`ShoppingManager.OpenStore()`, on iOS, before constructing the FastSpring URL — the same
place `GoogleBillingManager.Instance.GetExternalTransactionToken()` is called for
Android. It records each returned token as its own tap (`/recordExternalPurchaseTap`,
sharing one `purchaseAttemptId`) before calling `/encode`, then tags every token onto the
FastSpring order so `webhook.ts` can match each one back to the completed order
independently.

---

## Reference links

- [Apple External Purchase documentation](https://developer.apple.com/documentation/storekit/external-purchase)
- [Apple's EU External Purchase guide](https://developer.apple.com/support/communication-and-promotion-of-offers-on-the-app-store-in-the-eu/) (linked directly in `ExternalPurchaseClient`'s own doc comment)
- `ExternalPurchaseClient.cs`, `ExternalPurchaseTokenType.cs`, `ExternalPurchaseNoticeType.cs` — read directly from `Library/PackageCache/com.unity.purchasing@<hash>/Runtime/Stores/AppleAppStore/ExternalPurchase/` and `Runtime/UnityPaymentProviders/` after opening the project in Unity 6000.3.18f1 and letting Package Manager resolve 5.4.2.
