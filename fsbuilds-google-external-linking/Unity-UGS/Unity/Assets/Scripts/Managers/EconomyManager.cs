using System;
using System.Threading.Tasks;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Economy;
using UnityEngine;
using Utils;
using Utils.EventManager;

namespace Managers
{
    public class EconomyManager : Singleton<EconomyManager>, ISystem
    {
        [SerializeField] private EventKey economyUpdateEvent;
        [SerializeField] private EventKey playerBalanceDeltaEvent;
        [SerializeField] private string currencyId = "COINS";
        
        private int lastKnownBalance = 0;

        public int GetBalance() => lastKnownBalance;

public async Task<int> GetCurrencyBalance(string currencyId)
{
    try
    {
        var balances = await Unity.Services.Economy.EconomyService.Instance.PlayerBalances.GetBalancesAsync();
        foreach (var balance in balances.Balances)
        {
            if (balance.CurrencyId == currencyId)
                return (int)balance.Balance;
        }
        return 0;
    }
    catch (System.Exception ex)
    {
        Debug.LogError($"[EconomyManager] Failed to fetch {currencyId} balance: {ex.Message}");
        return 0;
    }
}

        public void AddBalance(int amount)
{
    lastKnownBalance += amount;
    economyUpdateEvent.Raise(lastKnownBalance);
}

public void DeductBalance(int amount)
{
    lastKnownBalance = Mathf.Max(0, lastKnownBalance - amount);
    economyUpdateEvent.Raise(lastKnownBalance);
}

        public void Initialize()
        {
            Debug.Log("[EconomyManager] Initializing EconomyManager...");
        }

        public void Shutdown()
        {
            Debug.Log("[EconomyManager] Shutting down EconomyManager...");
        }
        
        public async void Fetch()
        {
            try
            {
                if (!AuthenticationService.Instance.IsSignedIn)
                {
                    Debug.LogWarning("[EconomyManager] Player not signed in. Cannot fetch balance.");
                    return;
                }
                
                await InitializeEconomyAsync();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[EconomyManager] Initialization failed: {ex.Message}");
            }
        }

        private async Task InitializeEconomyAsync()
        {
            try
            {
                if (!UnityServices.State.Equals(ServicesInitializationState.Initialized))
                {
                    await UnityServices.InitializeAsync();
                }

                if (!AuthManager.Instance.IsSignedIn)
                {
                    Debug.LogWarning("[EconomyManager] Player not signed in. Cannot fetch balance.");
                    return;
                }

                await RefreshCurrencyBalanceAsync();
            }
            catch (Exception ex)
            {
                Debug.LogError($"[EconomyManager] Error initializing Economy: {ex.Message}");
            }
        }

        private async Task RefreshCurrencyBalanceAsync()
        {
            try
            {
                var balances = await EconomyService.Instance.PlayerBalances.GetBalancesAsync();

                foreach (var balance in balances.Balances)
                {
                    if (balance.CurrencyId != currencyId) continue;

                    var current = balance.Balance;
                    Debug.Log($"[EconomyManager] Current '{currencyId}' balance: {current}");

                    lastKnownBalance = (int)current;
                    economyUpdateEvent.Raise(lastKnownBalance);
                    return;
                }

                Debug.LogWarning($"[EconomyManager] Currency '{currencyId}' not found in balances.");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[EconomyManager] Failed to fetch balances: {ex.Message}");
            }
        }

        // Returns true once the balance has actually changed from what it was
        // when this was called, false if timeoutMs elapses first. Must be a
        // strict inequality: >= was the original bug here — it's true on the
        // very first poll whenever the balance simply hasn't decreased (the
        // overwhelmingly common case, since a purchase only ever adds), so
        // this was reporting "balance changed" before the coin grant had
        // necessarily landed at all.
        public async Task<bool> PollUntilBalanceChangesAsync(int timeoutMs = 8000)
        {
            var startingBalance = lastKnownBalance;

            var start = DateTime.UtcNow;

            while ((DateTime.UtcNow - start).TotalMilliseconds < timeoutMs)
            {
                await Task.Delay(1000);
                await RefreshCurrencyBalanceAsync();

                if (lastKnownBalance != startingBalance)
                    return true;
            }

            Debug.LogWarning("[EconomyManager] Timeout: No balance change detected.");
            return false;
        }

        public void ShowThanksYouPopup(int delta)
        {
            Debug.Log("[EconomyManager] Triggering thanks you popup.");
            playerBalanceDeltaEvent.Raise(delta);
        }
    }
}