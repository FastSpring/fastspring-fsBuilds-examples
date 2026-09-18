#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
using UnityEngine;

namespace Providers
{
    public class SafariWebViewController : IShopProvider
    {
        [DllImport("__Internal")]
        private static extern void OpenSafariCheckout(string url);

        public void OpenStore(string url)
        {
            Debug.Log("[SafariWebViewController] Opening " + url);
            OpenSafariCheckout(url);
        }
    }
}
#endif