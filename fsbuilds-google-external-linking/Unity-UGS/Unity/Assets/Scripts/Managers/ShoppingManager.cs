using System;
using System.Text;
using System.Threading.Tasks;
using Providers;
using UnityEngine;
using UnityEngine.Networking;
using Utils;

namespace Managers
{
    public class ShoppingManager : Singleton<ShoppingManager>
    {
        [SerializeField] private StoreConfig storeConfig;
        [SerializeField] private ShopConfig shopProviderMode;

        protected override void Awake()
        {
            base.Awake();
            storeConfig?.MakeCurrent();
        }

        public async void OpenStore(string productId)
        {
            try
            {
                string googleExternalTransactionToken = null;

#if UNITY_ANDROID && !UNITY_EDITOR
                // Fetched (and about to be tagged onto the order) before /encode
                // is called, not after — the token needs to already be in
                // FastSpring's order tags for the order.completed webhook to
                // record real transaction data against it (see webhook.ts).
                // GetExternalTransactionToken also needs *a* URL to show in
                // Google's required dialog before the token is issued; the
                // final URL (with the encrypted payload) isn't built yet at
                // this point, so a provisional one identifying the
                // destination/product is used here instead — the actual
                // navigation below always uses the real, complete URL
                // regardless of what was shown in the dialog.
                var provisionalUrl = $"{storeConfig.storeBaseUrl}?product={productId}";
                googleExternalTransactionToken = await GoogleBillingManager.Instance.GetExternalTransactionToken(provisionalUrl);
#endif

                string[] externalPurchaseTokens = null;
                string[] externalPurchaseTokenTypes = null;

#if UNITY_IOS && !UNITY_EDITOR
                // No External Purchase entitlement yet — App Review requires real
                // native IAP for digital currency until Apple grants one, there's
                // no third option. This check flips to the steering path below
                // automatically the moment Apple grants the entitlement; nothing
                // here needs to change at that point. Note: productId has to be a
                // native App Store Connect product id (e.g. "coinpack-150") on
                // this path, not a FastSpring-only catalog id — whichever button
                // calls OpenStore on iOS needs to be configured with an id that
                // exists in both catalogs.
                var externalPurchaseEligible = await AppleExternalPurchaseManager.Instance.IsEligibleAsync();
                if (!externalPurchaseEligible)
                {
                    Debug.Log("[ShoppingManager] Not eligible for external purchase — routing through native Apple IAP instead.");
                    AppleNativeIAPManager.Instance.PurchaseProduct(productId);
                    return;
                }

                // Fetched (and each tap recorded) before /encode is called, not
                // after — every token has to be tagged onto the FastSpring order
                // at encode time so the order.completed webhook can later match
                // this purchase back to whichever tap(s) started Apple's 7-day
                // window. There's no other shared key between "player tapped
                // Buy" and "FastSpring says the order completed." EU storefronts
                // return two tokens (Acquisition + Services); Japan returns one
                // (LinkOut) — see AppleExternalPurchaseManager for why.
                var appleTokens = await AppleExternalPurchaseManager.Instance.GetExternalPurchaseTokens();
                if (appleTokens.Length > 0)
                {
                    externalPurchaseTokens = new string[appleTokens.Length];
                    externalPurchaseTokenTypes = new string[appleTokens.Length];

                    // Shared across every token from this one purchase attempt —
                    // EU's Acquisition+Services pair get recorded as two separate
                    // rows a few milliseconds apart, so tapped_at alone can't tell
                    // the backend "these two are the same purchase" apart from
                    // "two unrelated taps that happened to land close together."
                    // This id is what lets the reporting job pair them up instead
                    // of reporting the same sale twice.
                    var purchaseAttemptId = Guid.NewGuid().ToString();

                    for (var i = 0; i < appleTokens.Length; i++)
                    {
                        externalPurchaseTokens[i] = appleTokens[i].Token;
                        externalPurchaseTokenTypes[i] = appleTokens[i].TokenType;

                        // Apple's 7-day commission window starts at this tap and
                        // Apple never sees it, so it has to be recorded server-side
                        // now — not after the purchase completes, and not skipped
                        // if the backend call fails, since an unmatched purchase
                        // later is worse than a purchase that opens the store a
                        // beat slower.
                        await RecordExternalPurchaseTapAsync(appleTokens[i].Token, appleTokens[i].TokenType, productId, purchaseAttemptId);
                    }
                }
#endif

                // On the Android steering path, googleExternalTransactionToken
                // above already triggered Google's mandatory disclosure
                // dialog and issued a single-use token — Google's own
                // guidance is that token must never be cached or reused. A
                // transient failure here used to burn both for nothing and
                // silently abort the whole purchase with just a log line; a
                // short retry means that only happens for a genuinely
                // failing backend, not a one-off network blip.
                var encodedPayloadResponse = await PrepareEncodedPayloadWithRetry(productId, googleExternalTransactionToken, externalPurchaseTokens, externalPurchaseTokenTypes);
                if (encodedPayloadResponse is not { success: true })
                {
                    Debug.LogError("[ShoppingManager] Failed to prepare encoded payload. Aborting.");
                    return;
                }

                var encodedPayload = UnityWebRequest.EscapeURL(encodedPayloadResponse.securePayload);
                var encodedKey = UnityWebRequest.EscapeURL(encodedPayloadResponse.secureKey);

                var fullUrl = $"{storeConfig.storeBaseUrl}?" +
                    $"product={productId}&" +
                    $"securePayload={encodedPayload}&" +
                    $"secureKey={encodedKey}&" +
                    $"returnUrl={storeConfig.returnUrl}";

#if UNITY_ANDROID && !UNITY_EDITOR
                // Still appended here too, alongside the /encode tag above —
                // this is what lets WebCode/store.js read the token from its
                // own incoming URL and carry it through to the return deep
                // link (see its redirectBack()), which is how DeeplinkHandler
                // gets it to trigger /reportTransaction at all. The /encode
                // tag and this query param serve two different purposes:
                // one lets the webhook record real order data against the
                // token, the other is how the client finds out which token
                // to ask the backend to report.
                if (!string.IsNullOrEmpty(googleExternalTransactionToken))
                {
                    fullUrl += $"&externalTransactionToken={UnityWebRequest.EscapeURL(googleExternalTransactionToken)}";
                }
#endif
                // Apple's tokens are not appended to the return URL — unlike Google's
                // path, nothing on the return trip needs to read them back. Apple's
                // tap was already recorded server-side above, the webhook matches it
                // to the completed order by itself (tags on the order, not a URL
                // round-trip), and reporting to Apple is a separate periodic job, not
                // something the client triggers on return. See webhook.ts /
                // server.ts's /reportExternalPurchases.

                Debug.Log($"[ShoppingManager] Opening: {fullUrl}");

                OpenShopProvider(fullUrl);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[ShoppingManager] Failed to open store: {ex.Message}");
            }
        }

        private void OpenShopProvider(string fullUrl)
        {
            IShopProvider shopProvider;
#if UNITY_EDITOR
            shopProvider = new WebController();
#elif IOS_SIMULATOR
            shopProvider = new SafariWebViewController();
#elif IOS_DEVICE
            shopProvider = new SafariWebViewController();
#elif ANDROID_CHROMETABS
            shopProvider = new ChromeCustomTabProvider();
#elif ANDROID_WEBVIEW
            shopProvider = new WebViewProvider();
#elif ANDROID_EXTERNALCHROME
            shopProvider = new WebController();
#else
            shopProvider = new WebController();
#endif
            shopProvider.OpenStore(fullUrl);
        }

        private async Task<EncodedPayloadResponse> PrepareEncodedPayloadWithRetry(string productId, string googleExternalTransactionToken, string[] externalPurchaseTokens = null, string[] externalPurchaseTokenTypes = null, int attempts = 3, int delayMs = 1000)
        {
            for (var i = 0; i < attempts; i++)
            {
                var response = await PrepareEncodedPayload(productId, googleExternalTransactionToken, externalPurchaseTokens, externalPurchaseTokenTypes);
                if (response is { success: true })
                    return response;

                if (i < attempts - 1)
                    await Task.Delay(delayMs);
            }

            return null;
        }

        private async Task<EncodedPayloadResponse> PrepareEncodedPayload(string productId, string googleExternalTransactionToken = null, string[] externalPurchaseTokens = null, string[] externalPurchaseTokenTypes = null)
        {
            var unityAccessToken = AuthManager.Instance.AccessToken;
            if (string.IsNullOrEmpty(unityAccessToken))
            {
                Debug.LogError("[ShoppingManager] Unity access token is missing.");
                return null;
            }

            // googleExternalTransactionToken is only non-null on the Android
            // steering path; externalPurchaseTokens/Types are only non-null on
            // the iOS steering path. /encode tags whichever is present onto the
            // FastSpring order so the order.completed webhook can record real
            // transaction data against the Google token (for /reportTransaction
            // to use later) or match the order back to its Apple tap record(s).
            // EU carries two Apple tokens (Acquisition + Services); Japan
            // carries one (LinkOut).
            var jsonBody = JsonUtility.ToJson(new ProductRequest
            {
                product = productId,
                googleExternalTransactionToken = googleExternalTransactionToken,
                externalPurchaseTokens = externalPurchaseTokens,
                externalPurchaseTokenTypes = externalPurchaseTokenTypes
            });

            using var request = new UnityWebRequest(storeConfig.purchaseCreatorEndpoint, "POST");
            var bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Authorization", unityAccessToken);

            var operation = request.SendWebRequest();
            while (!operation.isDone)
                await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"[ShoppingManager] Encode request failed: {request.error}");
                return null;
            }

            var responseJson = request.downloadHandler.text;

            Debug.Log($"[ShoppingManager] Encode response: {responseJson}");

            return JsonUtility.FromJson<EncodedPayloadResponse>(responseJson);
        }

        private async Task RecordExternalPurchaseTapAsync(string token, string tokenType, string productId, string purchaseAttemptId)
        {
            try
            {
                var unityAccessToken = AuthManager.Instance.AccessToken;
                if (string.IsNullOrEmpty(unityAccessToken))
                {
                    Debug.LogWarning("[ShoppingManager] No Unity access token — skipping external purchase tap recording.");
                    return;
                }

                var jsonBody = JsonUtility.ToJson(new ExternalPurchaseTapRequest
                {
                    externalPurchaseToken = token,
                    externalPurchaseTokenType = tokenType,
                    productId = productId,
                    purchaseAttemptId = purchaseAttemptId
                });

                using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/recordExternalPurchaseTap", "POST");
                var bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", unityAccessToken);

                var operation = request.SendWebRequest();
                while (!operation.isDone)
                    await Task.Yield();

                if (request.result != UnityWebRequest.Result.Success)
                    Debug.LogWarning($"[ShoppingManager] Failed to record external purchase tap: {request.error}");
                else
                    Debug.Log($"[ShoppingManager] External purchase tap recorded: {request.downloadHandler.text}");
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ShoppingManager] Error recording external purchase tap: {ex.Message}");
            }
        }

        [Serializable]
        private class ProductRequest
        {
            public string product;
            public string googleExternalTransactionToken;
            public string[] externalPurchaseTokens;
            public string[] externalPurchaseTokenTypes;
        }

        [Serializable]
        private class EncodedPayloadResponse
        {
            public bool success;
            public string securePayload;
            public string secureKey;
        }

        [Serializable]
        private class ExternalPurchaseTapRequest
        {
            public string externalPurchaseToken;
            public string externalPurchaseTokenType;
            public string purchaseAttemptId;
            public string productId;
        }
    }
}
