# GoogleBillingManager.cs — Documentation

## Purpose

This script generates a Google external transaction token immediately before a user is directed from the EggBlast Arena app to the FastSpring web checkout. The token is required by Google's External Content Links program to attribute the resulting purchase back to the app session.

---

## How it was written

There is no Unity-specific documentation for this implementation. It was written by reading the source code of `ExternalBillingProgramClient.cs` directly from the Unity IAP package cache (`com.unity.purchasing`), which ships with Unity IAP 4.15+ and 5.2+. The logic follows the same sequence described in [Google's external content links integration guide](https://developer.android.com/google/play/billing/externalcontentlinks/integration), translated from Kotlin/Java into C# using Unity's wrapper class.

---

## Structure

The script follows the same `Singleton` pattern used throughout the existing project (`AuthManager`, `ShoppingManager`, etc.) so it can be accessed from anywhere in the scene without being attached to a specific GameObject.

**Important:** The class definition must be visible to the Unity Editor so the component can be attached to a GameObject in the scene. The platform-specific code (`ExternalBillingProgramClient`, `GoogleBillingResponseCode`, etc.) is guarded with `#if UNITY_ANDROID && !UNITY_EDITOR` **inside** the class, not wrapping the entire class. If the outer class definition is wrapped in a platform guard, it will be invisible in the Editor and cannot be added as a component.

---

## The three steps it performs in order

1. **`StartConnection()`** — establishes a connection to the Google Play Billing service on the device. Must succeed before anything else can happen.

2. **`IsBillingProgramAvailableAsync()`** — checks whether this specific user/device is eligible for external content links. Not all users will be — Google controls eligibility. If unavailable (`BillingUnavailable`), the store still opens but without a token. This is expected behavior when the app is not yet enrolled in Google's External Content Links program.

3. **`CreateBillingProgramReportingDetailsAsync()`** — generates the external transaction token. Per Google's requirements, this must be called immediately before the user is sent to the external URL, and the token must never be cached or reused across sessions.

---

## Platform guard placement

The platform-specific fields and methods (`ExternalBillingProgramClient`, `ConnectAsync`, `Awake`, `OnDestroy`) are wrapped in `#if UNITY_ANDROID && !UNITY_EDITOR`. The `GetExternalTransactionToken()` method is always present but returns `null` on non-Android platforms via an `#else` branch. This allows the component to be attached in the Unity Editor while ensuring Android-only code never runs in the Editor or on iOS.

---

## Namespace notes

`GoogleBillingResponseCode` is defined in `UnityEngine.Purchasing.Models` — not `UnityEngine.Purchasing.GoogleBilling.Models` as might be assumed from the file location. Using the wrong namespace will cause a compile error. The correct using statement is:

```csharp
using UnityEngine.Purchasing.Models;
```

---

## Assembly references required

`GoogleBillingManager.cs` requires two Unity IAP assembly references in `Main.asmdef`:

| Assembly | GUID |
|---|---|
| `Unity.Purchasing.Stores` | `08d1c582746949b40ba6a45cdb776bdf` |
| `Unity.Purchasing` | `60bfecf5cb232594891bc622f40d6bed` |

These GUIDs can be found in the `.meta` files alongside the corresponding `.asmdef` files in the Unity IAP package cache.

---

## Scene setup

The `GoogleBillingManager` script must be attached to a GameObject in the scene (under the `Systems` hierarchy alongside `AuthManager`, `ShoppingManager`, etc.). Because the class definition is always visible to the Editor (platform guard is inside the class, not outside), it can be added via **Add Component** in the Inspector.

---

## What varies per implementation

Nothing in this script is hardcoded to EggBlast Arena specifically. However, a developer adapting this for another app would need to:

- Ensure Unity IAP 4.15+ or 5.2+ is installed (the `ExternalBillingProgramClient` class does not exist in earlier versions)
- Ensure the app is enrolled in Google's External Content Links program in the Play Console — without enrollment, `IsBillingProgramAvailableAsync()` returns `BillingUnavailable` and no token is generated
- Decide how to handle the `null` return case — this implementation logs a warning and proceeds without a token, meaning the store opens but Google attribution won't fire. A stricter implementation could block the store from opening entirely if no token is generated

---

## What calls this script

`ShoppingManager.cs` calls `GoogleBillingManager.Instance.GetExternalTransactionToken()` before constructing the FastSpring URL. If a token is returned, it is appended to the URL as `&externalTransactionToken=TOKEN`. If null is returned (editor, iOS, billing unavailable, or token generation failed), the URL is built without it and the store opens normally.

---

## Dependencies

| Dependency | Version | Notes |
|---|---|---|
| Unity IAP (`com.unity.purchasing`) | 5.3.1 (tested) | Required for `ExternalBillingProgramClient`; class added in 4.15+ / 5.2+ |
| Google Play Billing Library | 8.2.1+ | Bundled with Unity IAP, no separate install needed |
| Google External Content Links enrollment | N/A | Must be completed in Play Console before tokens will be issued; without it, `BillingUnavailable` is returned |

---

## Expected behavior before Play Console enrollment

When the app is sideloaded for testing (not distributed via Play Console) or before the External Content Links program enrollment is approved, `IsBillingProgramAvailableAsync()` returns `BillingUnavailable`. This is expected and non-blocking — the store opens without a steering token. Full token generation requires the app to be enrolled in the program via Play Console.

---

## Reference links

- [Google External Content Links integration guide](https://developer.android.com/google/play/billing/externalcontentlinks/integration)
- [Unity IAP changelog — ExternalBillingProgramClient added in 4.15 / 5.2](https://docs.unity3d.com/Packages/com.unity.purchasing@5.2/changelog/CHANGELOG.html)
- [ExternalBillingProgramClient source](Unity-UGS/Unity/Library/PackageCache/com.unity.purchasing@b69b97f74d28/Runtime/Stores/Android/GooglePlay/AAR/Models/ExternalBillingProgramClient.cs)