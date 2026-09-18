using UnityEngine;

namespace Utils
{
    [CreateAssetMenu(fileName = "StoreConfig", menuName = "Store/StoreConfig")]
    public class StoreConfig : ScriptableObject
    {
        private const string DefaultBackendBaseUrl = "https://eggblastgooglesteering-production.up.railway.app";

        [Tooltip("Base URL of the game backend, no trailing slash. Also hosts the web store.")]
        [SerializeField]
        public string backendBaseUrl = DefaultBackendBaseUrl;

        [Tooltip("Store URL")]
        [SerializeField]
        public string storeBaseUrl = DefaultBackendBaseUrl;

        [Tooltip("Deeplink URL for returning to the app after purchase")]
        [SerializeField]
        public string returnUrl = "fastspring://shop-return";

        [Tooltip("Backend for preparing the purchase")]
        [SerializeField]
        public string purchaseCreatorEndpoint = DefaultBackendBaseUrl + "/encode";

        /// <summary>
        /// The config assigned to ShoppingManager in MainScene. Set in ShoppingManager.Awake.
        /// </summary>
        public static StoreConfig Current { get; private set; }

        /// <summary>
        /// Backend base URL for scripts that have no serialized reference to the config
        /// (DeepLinkHandler, gameplay). Falls back to the default when no config has been
        /// activated yet, e.g. when GameplayScene is opened directly in the Editor.
        /// </summary>
        public static string BackendBaseUrl =>
            Current != null && !string.IsNullOrEmpty(Current.backendBaseUrl)
                ? Current.backendBaseUrl.TrimEnd('/')
                : DefaultBackendBaseUrl;

        public void MakeCurrent() => Current = this;
    }
}
