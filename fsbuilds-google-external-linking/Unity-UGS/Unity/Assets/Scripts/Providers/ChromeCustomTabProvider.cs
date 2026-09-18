#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine;

namespace Providers
{
    public class ChromeCustomTabProvider : IShopProvider
    {
        private readonly AndroidJavaClass chromeProvider;
        
        public ChromeCustomTabProvider()
        {
            var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
            var currentActivity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");

            chromeProvider = new AndroidJavaClass("com.ollieinteractive.store.ChromeCustomTabsProvider");
            chromeProvider.CallStatic("setUnityActivity", currentActivity);
        }

        public void OpenStore(string url)
        {
            Debug.Log("[ChromeCustomTabProvider] Opening " + url);
            chromeProvider.CallStatic("openCheckout", url);
        }
    }
    
    public class WebViewProvider : IShopProvider
    {
        private readonly AndroidJavaClass webViewProvider;
        
        public WebViewProvider()
        {
            var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
            var currentActivity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");

            webViewProvider = new AndroidJavaClass("com.ollieinteractive.store.WebViewProvider");
            webViewProvider.CallStatic("setUnityActivity", currentActivity);
        }
        
        public void OpenStore(string url)
        {
            Debug.Log("[WebViewProvider] Opening " + url);
            webViewProvider.CallStatic("openUrl", url);
        }
    }
}
#endif