using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Purchasing;
using Utils;

namespace Managers
{
    /// <summary>
    /// Real native Apple In-App Purchase, using Unity IAP's current (non-Legacy)
    /// StoreController API. This exists because v1 of the iOS build has no External
    /// Purchase entitlement yet, and App Review Guideline 3.1.1 requires digital
    /// currency to sell through Apple's own IAP absent that entitlement — there is no
    /// third option. Once the entitlement is granted, a later update can offer
    /// AppleExternalPurchaseManager's FastSpring steering path instead of or alongside
    /// this one.
    ///
    /// Unity IAP's older IStoreListener/ConfigurationBuilder pattern (what most
    /// tutorials still show) is marked [Obsolete(IAPObsoleteMessages.UpgradeToIAPV5)]
    /// as of 5.4.x — this deliberately does not use it.
    /// </summary>
    public class AppleNativeIAPManager : Singleton<AppleNativeIAPManager>
    {
        // Matches the FastSpring catalog id ("coinpack-150") rather than the
        // /validateGooglePurchase naming (coinpack_100), specifically so the
        // existing "Buy Coins" button can trigger either path with the same
        // productId — Android/Editor still goes through FastSpring for that id,
        // iOS falls back to this native purchase, same 150-coin result either
        // way. Create the App Store Connect IAP product with this exact
        // identifier. Only one product for now, since nothing in the UI sells
        // eggs directly yet — add more here once that changes.
        private static readonly (string id, ProductType type)[] ProductCatalog =
        {
            ("coinpack-150", ProductType.Consumable),
        };

        private StoreController _storeController;
        private bool _isInitialized;

        protected override void Awake()
        {
            base.Awake();
#if UNITY_IOS && !UNITY_EDITOR
            InitializeAsync();
#endif
        }

        private async void InitializeAsync()
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                _storeController = new StoreController();

                _storeController.OnProductsFetched += OnProductsFetched;
                _storeController.OnProductsFetchFailed += OnProductsFetchFailed;
                _storeController.OnPurchasePending += OnPurchasePending;
                _storeController.OnPurchaseFailed += OnPurchaseFailed;

                await _storeController.Connect();

                var definitions = new List<ProductDefinition>();
                foreach (var (id, type) in ProductCatalog)
                {
                    definitions.Add(new ProductDefinition(id, type));
                }

                _storeController.FetchProducts(definitions);
                _isInitialized = true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[AppleNativeIAPManager] Failed to initialize: {e.Message}");
            }
#else
            await Task.CompletedTask;
#endif
        }

        private void OnProductsFetched(List<Product> products)
        {
            Debug.Log($"[AppleNativeIAPManager] Fetched {products.Count} product(s).");
        }

        private void OnProductsFetchFailed(ProductFetchFailed failure)
        {
            Debug.LogWarning($"[AppleNativeIAPManager] Product fetch failed: {failure}");
        }

        /// <summary>
        /// Starts a real Apple purchase for the given product id. Completion (success
        /// or failure) arrives later via OnPurchasePending / OnPurchaseFailed, not as
        /// a return value or awaited task — that's how StoreController's event model
        /// works, matching how a real StoreKit purchase sheet is asynchronous and can
        /// be interrupted (backgrounding, Face ID, parental approval).
        /// </summary>
        public void PurchaseProduct(string productId)
        {
#if UNITY_IOS && !UNITY_EDITOR
            if (!_isInitialized)
            {
                Debug.LogError("[AppleNativeIAPManager] Store not initialized yet — cannot purchase.");
                return;
            }
            _storeController.PurchaseProduct(productId);
#else
            Debug.LogWarning("[AppleNativeIAPManager] Native purchase requested on a non-iOS platform — ignored.");
#endif
        }

#if UNITY_IOS && !UNITY_EDITOR
        private async void OnPurchasePending(PendingOrder order)
        {
            try
            {
                var items = order.CartOrdered.Items();
                var productId = items.Count > 0 ? items[0].Product.uSku : null;
                var jws = order.Info.Apple?.jwsRepresentation;

                if (string.IsNullOrEmpty(productId) || string.IsNullOrEmpty(jws))
                {
                    Debug.LogWarning("[AppleNativeIAPManager] Pending order missing product id or signed transaction — not confirming.");
                    return;
                }

                var verified = await ValidateWithBackendAsync(productId, jws);
                if (!verified)
                {
                    Debug.LogWarning("[AppleNativeIAPManager] Backend rejected the transaction — not confirming. The order stays pending; Apple may retry delivery.");
                    return;
                }

                _storeController.ConfirmPurchase(order);

                if (productId == "coinpack-150")
                {
                    EconomyManager.Instance.ShowThanksYouPopup(150);
                    await EconomyManager.Instance.PollUntilBalanceChangesAsync(timeoutMs: 60000);
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[AppleNativeIAPManager] Error processing pending order: {e.Message}");
            }
        }

        private async Task<bool> ValidateWithBackendAsync(string productId, string signedTransactionInfo)
        {
            try
            {
                var unityAccessToken = AuthManager.Instance?.AccessToken;
                if (string.IsNullOrEmpty(unityAccessToken))
                {
                    Debug.LogWarning("[AppleNativeIAPManager] No Unity access token — cannot validate purchase.");
                    return false;
                }

                var jsonBody = JsonUtility.ToJson(new ValidatePurchaseRequest
                {
                    productId = productId,
                    signedTransactionInfo = signedTransactionInfo
                });

                using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/validateApplePurchase", "POST");
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
                    Debug.LogWarning($"[AppleNativeIAPManager] Validation request failed: {request.error}");
                    return false;
                }

                Debug.Log($"[AppleNativeIAPManager] Validation response: {request.downloadHandler.text}");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[AppleNativeIAPManager] Error validating purchase: {e.Message}");
                return false;
            }
        }

        [Serializable]
        private class ValidatePurchaseRequest
        {
            public string productId;
            public string signedTransactionInfo;
        }
#endif

        private void OnPurchaseFailed(FailedOrder order)
        {
            Debug.LogWarning($"[AppleNativeIAPManager] Purchase failed: {order.FailureReason} — {order.Details}");
        }
    }
}
