using System;
using System.Text;
using Managers;
using UnityEngine;
using UnityEngine.Networking;

namespace Utils
{
    public class DeepLinkHandler : MonoBehaviour
    {
        private bool isHandlingDeeplink = false;

        private void Awake()
        {
            Application.deepLinkActivated += OnDeepLinkActivated;
            if (!string.IsNullOrEmpty(Application.absoluteURL))
            {
                OnDeepLinkActivated(Application.absoluteURL);
            }
        }

        public void OnDeepLinkActivated(string url)
        {
            Debug.Log("[DeepLinkHandler] DeepLink activated: " + url);
            CheckDeeplink(url);
        }

        private void Update()
        {
#if UNITY_EDITOR
            if (Input.GetKeyUp(KeyCode.D))
            {
                Debug.Log("[DeepLinkHandler] Testing deep link with 'fastspring://shop-return' URL");
                CheckDeeplink("fastspring://shop-return?amount=100");
            }
#endif
        }

        private async void CheckDeeplink(string url)
        {
            if (isHandlingDeeplink)
            {
                Debug.LogWarning("[DeepLinkHandler] Already handling a deeplink, skipping.");
                return;
            }

            isHandlingDeeplink = true;

            try
            {
                if (!url.StartsWith("fastspring://shop-return"))
                {
                    isHandlingDeeplink = false;
                    return;
                }

                Debug.Log("[DeepLinkHandler] Handling FastSpring return URL");

                // On a cold launch via this deep link, Awake() calls into
                // this method synchronously before Unity's Script Execution
                // Order guarantees AuthManager (or EconomyManager) has run
                // its own Awake yet — there's no Script Execution Order
                // asset configured for this project, so *.Instance can
                // still be null here. Without this wait, that used to throw
                // an NRE (caught below, but silently — the whole purchase
                // confirmation, Google-report fallback, and balance refresh
                // for that launch were lost with only a log line).
                if (!await WaitUntilReadyAsync(() => AuthManager.Instance != null && EconomyManager.Instance != null))
                {
                    Debug.LogError("[DeepLinkHandler] AuthManager/EconomyManager never initialized in time — aborting deep link handling.");
                    return;
                }

                if (!AuthManager.Instance.IsSignedIn)
                {
                    Debug.Log("[DeepLinkHandler] Player not signed in, showing login UI");
                    await AuthManager.Instance.SignInAsync();
                }

                var uri = new Uri(url);
                var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);
                var amountStr = queryParams["amount"];

                if (int.TryParse(amountStr, out var amount))
                {
                    Debug.Log($"[DeepLinkHandler] Received purchased amount: {amount}");
                    EconomyManager.Instance.ShowThanksYouPopup(amount);

                    // Report transaction to Google. The token now travels via
                    // /encode's tags (see ShoppingManager.cs), tagged onto the
                    // FastSpring order before checkout — the webhook already
                    // reports to Google itself as soon as it has real order
                    // data, so this call is normally just confirming that
                    // already happened. It's a fallback, not the only path,
                    // for whatever's left: the webhook hasn't landed yet, or
                    // it landed but its own report attempt failed. This is
                    // only ever the token carried back in the return URL now;
                    // the in-memory LastExternalTransactionToken fallback
                    // this used to have was removed along with the caching
                    // it depended on (see GoogleBillingManager.cs) — Google's
                    // own guidance is to never cache this token and generate
                    // it fresh immediately before each link-out, so a
                    // session-cached fallback was a latent risk even though
                    // it happened to work in testing.
                    var externalToken = queryParams["externalTransactionToken"];
                    Debug.Log($"[DeepLinkHandler] External token: {(string.IsNullOrEmpty(externalToken) ? "NULL" : "FOUND")}");
                    if (!string.IsNullOrEmpty(externalToken))
                    {
                        await ReportTransactionAsync(externalToken);
                    }
                    else
                    {
                        Debug.LogWarning("[DeepLinkHandler] No external transaction token — skipping Google reporting.");
                    }

                    var balanceChanged = await EconomyManager.Instance.PollUntilBalanceChangesAsync(timeoutMs: 60000);
                    if (!balanceChanged)
                    {
                        Debug.LogWarning("[DeepLinkHandler] Balance never changed within the timeout — the purchase may not have been granted yet.");
                    }
                }
                else
                {
                    Debug.LogWarning("[DeepLinkHandler] Invalid or missing 'amount' parameter.");
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[DeepLinkHandler] Error handling deeplink: {e.Message}");
            }
            finally
            {
                isHandlingDeeplink = false;
            }
        }

        private static async System.Threading.Tasks.Task<bool> WaitUntilReadyAsync(Func<bool> ready, int timeoutMs = 5000)
        {
            const int pollMs = 50;
            var elapsedMs = 0;
            while (!ready())
            {
                if (elapsedMs >= timeoutMs) return false;
                await System.Threading.Tasks.Task.Delay(pollMs);
                elapsedMs += pollMs;
            }
            return true;
        }

        private async System.Threading.Tasks.Task ReportTransactionAsync(string externalToken)
        {
            try
            {
                var token = AuthManager.Instance?.AccessToken;
                if (string.IsNullOrEmpty(token)) return;

                // Amount/currency/transaction id are no longer sent — the
                // backend looks up the real order data itself (recorded from
                // FastSpring's order.completed webhook against this same
                // token, see db.ts/webhook.ts/server.ts) and uses FastSpring's
                // own order id as Google's externalTransactionId. Sending
                // client-computed amounts was the actual bug being fixed
                // here; sending a client-generated transaction id was extra
                // surface this endpoint no longer needs now that the webhook
                // is the primary reporter and this is just a fallback check.
                var jsonBody = $"{{\"externalTransactionToken\": \"{externalToken}\"}}";

                using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/reportTransaction", "POST");
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", token);

                await request.SendWebRequest();

                // 202 is itself a 2xx status, so it falls under
                // Result.Success too — check for it explicitly first, or
                // this branch is unreachable.
                if (request.responseCode == 202)
                    Debug.LogWarning($"[DeepLinkHandler] Backend hasn't recorded this order yet (webhook may still be in flight): {request.downloadHandler.text}");
                else if (request.result == UnityWebRequest.Result.Success)
                    Debug.Log($"[DeepLinkHandler] Transaction reported to Google: {request.downloadHandler.text}");
                else
                    Debug.LogWarning($"[DeepLinkHandler] Transaction report failed: {request.error}");
            }
            catch (Exception e)
            {
                Debug.LogError($"[DeepLinkHandler] Error reporting transaction: {e.Message}");
            }
        }
    }
}
