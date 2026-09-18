using UnityEngine;

namespace Providers
{
    public enum ShopProviderMode
    {
        External, // always Application.OpenURL
        InApp     // SafariViewController on iOS, Chrome Custom Tabs on Android
    }

    [CreateAssetMenu(fileName = "ShopProviderMode", menuName = "Provider/ShopProviderMode")]
    public class ShopConfig : ScriptableObject
    {
        public ShopProviderMode providerMode = ShopProviderMode.InApp;
    }
}