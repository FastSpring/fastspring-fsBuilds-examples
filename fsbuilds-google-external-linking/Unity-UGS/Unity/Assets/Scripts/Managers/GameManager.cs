using UnityEngine;
using Utils;
using Utils.EventManager;

namespace Managers
{
    public class GameManager : Singleton<GameManager>, ISystem
    {
        [Header("Events")]
        [SerializeField] private EventKey showLogin;
        [SerializeField] private EventKey clickedLogin;
        [SerializeField] private EventKey clickedLogout;
        [SerializeField] private EventKey showShop;
        [SerializeField] private EventKey playerBalanceDeltaEvent;
        
        [Header("UI blocks")]
        [SerializeField]
        private GameObject loginUI;
        [SerializeField]
        private GameObject shopUI;
        [SerializeField] 
        private GameObject thankYouPopup;

        public void Initialize()
        {
            Debug.Log("[GameManager] Initializing GameManager...");
            showLogin.AddListener(OnShowLogin);
            clickedLogin.AddListener(OnClickedLogin);
            clickedLogout.AddListener(OnClickedLogout);
            showShop.AddListener(OnShowShop);
            playerBalanceDeltaEvent.AddListener(OnPlayerBalanceDelta);
        }

        public void Shutdown()
        {
            Debug.Log("[GameManager] Shutting down GameManager...");
            showLogin.RemoveListener(OnShowLogin);
            clickedLogin.RemoveListener(OnClickedLogin);
            clickedLogout.RemoveListener(OnClickedLogout);
            showShop.RemoveListener(OnShowShop);
            playerBalanceDeltaEvent.RemoveListener(OnPlayerBalanceDelta);
        }

        private void OnShowLogin(object obj)
        {
            loginUI.SetActive(true);
            shopUI.SetActive(false);
        }
        
        private void OnShowShop(object obj)
        {
            loginUI.SetActive(false);
            shopUI.SetActive(true);
            
            Debug.Log("Shop UI shown, switching to shop and game UI.");
        }
        
        private void OnClickedLogin(object obj)
        {
            loginUI.SetActive(false);
            shopUI.SetActive(true);
            thankYouPopup.SetActive(false);
            
            Debug.Log("Login clicked, switching to shop and game UI.");
            _ = AuthManager.Instance.SignInAnonymouslyAsync();
        }
        
        private void OnClickedLogout(object clearCache)
        {
            loginUI.SetActive(true);
            shopUI.SetActive(false);
            thankYouPopup.SetActive(false);
            
            AuthManager.Instance.SignOutAsync((bool)clearCache);
        }
        
        private void OnPlayerBalanceDelta(object obj)
        {
            Debug.Log("[GameManager] Received PlayerBalanceDelta event, showing thank you popup");
            thankYouPopup.SetActive(true);
        }
    }
}
