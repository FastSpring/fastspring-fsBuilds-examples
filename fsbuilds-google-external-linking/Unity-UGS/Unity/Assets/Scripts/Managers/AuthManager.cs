using System;
using System.Threading.Tasks;
using UnityEngine;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Utils;
using Utils.EventManager;
using AuthenticationException = Unity.Services.Authentication.AuthenticationException;

namespace Managers
{
    public class AuthManager : Singleton<AuthManager>, ISystem
    {
        [Header("UI events")] 
        [SerializeField] private EventKey showLogin;
        [SerializeField] private EventKey showShop;
        [SerializeField] private EventKey showPlayerId;
        
        public bool IsSignedIn => AuthenticationService.Instance.IsSignedIn;
        private string PlayerId => AuthenticationService.Instance.PlayerId;
        public string AccessToken => AuthenticationService.Instance.AccessToken;
        
        public void Initialize()
        {
            Debug.Log("[AuthManager] AuthManager initialized.");
        }

        public void Shutdown()
        {
            Debug.Log("[AuthManager] Shutting down AuthManager...");
        }
        
        private async void Start()
        {
            try
            {
                await SignInAsync();
            }
            catch (Exception e)
            {
                Debug.LogError($"[AuthManager] Error during sign-in: {e.Message}");
                EventManager.Instance.RaiseEvent(showLogin);
            }
        }
        
        public async Task SignInAsync()
        {
            try
            {
                await InitializeAndSignInAsync();
            }
            catch
            {
                Debug.LogError("[AuthManager] Failed to initialize and sign in.");
                EventManager.Instance.RaiseEvent(showLogin);
            }
        }

        private async Task InitializeAndSignInAsync()
        {
            try
            {
                await UnityServices.InitializeAsync();

                await SignInCachedUserAsync();
            }
            catch (Exception e)
            {
                Debug.LogError($"[AuthManager] Initialization failed: {e}");
            }
        }

        private async Task SignInCachedUserAsync()
        {
            if (!AuthenticationService.Instance.SessionTokenExists)
            {
                Debug.Log("[AuthManager] No cached session token. Skipping sign-in.");
                EventManager.Instance.RaiseEvent(showLogin);
                return;
            }

            await SignInAnonymouslyAsync();
        }

        private void OnLoginSuccess()
        {
            EventManager.Instance.RaiseEvent(showShop);
            EventManager.Instance.RaiseEvent(showPlayerId, PlayerId);
            
            EconomyManager.Instance.Fetch();
        }
        
        public async Task SignInAnonymouslyAsync()
        {
            try
            {
                await AuthenticationService.Instance.SignInAnonymouslyAsync();
                Debug.Log("Sign in anonymously succeeded!");
                
                Debug.Log($"PlayerID: {PlayerId}");
                Debug.Log($"AccessToken: {AccessToken}");
                
                OnLoginSuccess();
            }
            catch (AuthenticationException ex)
            {
                // Compare error code to AuthenticationErrorCodes
                // Notify the player with the proper error message
                Debug.LogError($"Authentication failed: {ex.Message}");
                SignOutAsync(true);
            }
            catch (RequestFailedException ex)
            {
                // Compare error code to CommonErrorCodes
                // Notify the player with the proper error message
                Debug.LogException(ex);
                SignOutAsync(true);
            }
        }

        public void SignOutAsync(bool clearCache)
        {
            AuthenticationService.Instance.SignOut(clearCache);
            AuthenticationService.Instance.ClearSessionToken();
        }
    }
}