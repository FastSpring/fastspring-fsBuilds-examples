using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Purchasing;
using Utils;

namespace Managers
{
    /// <summary>
    /// A token plus the type Apple issued it as. Apple's reporting requires both —
    /// unlike Google's externalTransactionToken, which travels as a single opaque
    /// string, Apple's External Purchase Server API needs to know whether this was
    /// an ACQUISITION, SERVICES, or LINK_OUT token when the transaction is reported.
    /// </summary>
    public readonly struct ExternalPurchaseTokenResult
    {
        public readonly string Token;
        public readonly string TokenType; // "ACQUISITION" | "SERVICES" | "LINK_OUT"

        public ExternalPurchaseTokenResult(string token, string tokenType)
        {
            Token = token;
            TokenType = tokenType;
        }
    }

    /// <summary>
    /// Mirrors GoogleBillingManager's shape for Apple's StoreKit External Purchase
    /// Custom Link program, via Unity IAP 5.4.2's ExternalPurchaseClient. See
    /// AppleExternalPurchaseManager-documentation.md for the full sequence.
    /// </summary>
    public class AppleExternalPurchaseManager : Singleton<AppleExternalPurchaseManager>
    {
        /// <summary>
        /// A cheap, side-effect-free eligibility check — no token fetch, no
        /// disclosure notice. Apple's notice is only meant to be shown immediately
        /// before actually steering to an external purchase link, not as a general
        /// "is this available" probe, so ShoppingManager uses this to decide which
        /// purchase path to route through (native IAP today, since there's no
        /// entitlement yet; this flips to the steering path automatically once
        /// Apple grants one, with no code changes needed here).
        /// </summary>
        public async Task<bool> IsEligibleAsync()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                var client = new ExternalPurchaseClient();
                return await client.CheckEligibilityAsync();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[AppleExternalPurchaseManager] Eligibility check failed: {e.Message}");
                return false;
            }
#else
            await Task.CompletedTask;
            return false;
#endif
        }

        /// <summary>
        /// Sequence, per ExternalPurchaseClient.cs (Unity IAP 5.4.2) and Apple's
        /// External Purchase documentation
        /// (https://developer.apple.com/documentation/storekit/external-purchase):
        /// 1. Check eligibility for the device's current App Store storefront.
        /// 2. Fetch the storefront country code, to pick the region-appropriate
        ///    token type(s) — Japan uses LINK_OUT only; EU storefronts request
        ///    BOTH ACQUISITION and SERVICES, per Apple's own guidance quoted in
        ///    docs/apple-external-purchase-compliance.md: "When a customer has
        ///    both an ACQUISITION and SERVICES token in the same active period,
        ///    you can report transactions using just the SERVICES token, and
        ///    report the ACQUISITION token without any transactions." Reporting
        ///    (server-side) decides which token an actual sale attaches to —
        ///    this method's job is only to make sure both exist to choose from.
        /// 3. Fetch each token, tolerating one of the two EU fetches failing
        ///    (still return whatever succeeded rather than failing the whole
        ///    purchase over a single token call).
        /// 4. Show Apple's required disclosure notice exactly once, regardless
        ///    of how many tokens were fetched. Unlike Google's LaunchExternalLink,
        ///    this call does not take the checkout URL — the caller
        ///    (ShoppingManager) opens it via Application.OpenURL() right after
        ///    this method returns, which is why the notice is shown here rather
        ///    than at the call site.
        /// Returns an empty array if eligibility fails or every token fetch
        /// fails, so ShoppingManager opens the store without a token, same as
        /// the Google path. Tokens are always fetched fresh here, never cached
        /// or reused across calls, per Apple's guidance to request them
        /// "before every potential transaction."
        ///
        /// Japan's alternative token type (IN_APP, for in-app alternative
        /// payment processors under Japan's MSCA) is not requestable yet —
        /// Unity IAP 5.4.2's ExternalPurchaseTokenType enum only exposes
        /// Acquisition/Services/LinkOut; IN_APP exists at the native Swift
        /// layer (gated behind iOS/macOS/visionOS 26.4) but has no C# entry
        /// point in this package version. Revisit once a Unity IAP release
        /// surfaces it.
        /// </summary>
        public async Task<ExternalPurchaseTokenResult[]> GetExternalPurchaseTokens()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                var client = new ExternalPurchaseClient();

                var isEligible = await client.CheckEligibilityAsync();
                if (!isEligible)
                {
                    Debug.LogWarning("[AppleExternalPurchaseManager] Not eligible for external purchase (storefront not enrolled, or entitlement not yet granted).");
                    return Array.Empty<ExternalPurchaseTokenResult>();
                }

                var storefront = await client.FetchStorefrontAsync();
                var tokenTypesToFetch = storefront == "JPN"
                    ? new[] { ExternalPurchaseTokenType.LinkOut }
                    : new[] { ExternalPurchaseTokenType.Acquisition, ExternalPurchaseTokenType.Services };

                var results = new List<ExternalPurchaseTokenResult>(tokenTypesToFetch.Length);
                foreach (var tokenType in tokenTypesToFetch)
                {
                    try
                    {
                        var (token, returnedTokenType) = await client.FetchTokenAsync(tokenType);
                        if (string.IsNullOrEmpty(token))
                        {
                            Debug.LogWarning($"[AppleExternalPurchaseManager] Eligible, but no {tokenType} token was returned.");
                            continue;
                        }
                        results.Add(new ExternalPurchaseTokenResult(token, returnedTokenType));
                        Debug.Log($"[AppleExternalPurchaseManager] Token generated: {token} (type: {returnedTokenType})");
                    }
                    catch (Exception e)
                    {
                        // One token type failing shouldn't sink the other — EU
                        // still gets a purchase attempt with whichever of
                        // Acquisition/Services actually came back.
                        Debug.LogWarning($"[AppleExternalPurchaseManager] Failed to fetch {tokenType} token: {e.Message}");
                    }
                }

                if (results.Count == 0)
                {
                    return Array.Empty<ExternalPurchaseTokenResult>();
                }

                // Must happen after deliberate user interaction and before the
                // purchase URL opens. ShoppingManager opens the URL immediately
                // after this method returns, so the two stay adjacent. Shown
                // once regardless of token count — it's tied to the purchase
                // attempt, not to each token.
                await client.ShowNoticeAsync(ExternalPurchaseNoticeType.Browser);

                return results.ToArray();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[AppleExternalPurchaseManager] External purchase flow failed: {e.Message}");
                return Array.Empty<ExternalPurchaseTokenResult>();
            }
#else
            await Task.CompletedTask;
            return Array.Empty<ExternalPurchaseTokenResult>();
#endif
        }
    }
}
