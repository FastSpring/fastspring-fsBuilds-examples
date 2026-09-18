using UnityEngine;

namespace Providers
{
    public class WebController : IShopProvider
    {
        public void OpenStore(string url)
        {
            Debug.Log("[WebController] Opening " + url);
            Application.OpenURL(url);
        }
    }
}
