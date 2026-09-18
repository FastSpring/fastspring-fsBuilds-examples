using System.Threading.Tasks;
using UnityEngine;
using Utils;

namespace Managers
{
    public class GoogleBillingManager : Singleton<GoogleBillingManager>
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        UnityEngine.Purchasing.GoogleBilling.Models.ExternalBillingProgramClient _billingClient;
        private bool _isConnected;
        // Tracks a StartConnection call that's still outstanding (neither
        // callback has fired yet). Shared across callers so a second call
        // to EnsureConnectedAsync — whether truly concurrent, or a retry
        // right after a timeout while the first attempt might still resolve
        // late — awaits this same pending connection instead of invoking
        // StartConnection a second time while one is already in flight.
        private TaskCompletionSource<bool> _pendingConnect;

        protected override void Awake()
        {
            base.Awake();
            _billingClient = new UnityEngine.Purchasing.GoogleBilling.Models.ExternalBillingProgramClient();
        }

        protected override void OnDestroy()
        {
            base.OnDestroy();
            _billingClient?.EndConnection();
        }

        // StartConnection/EndConnection are meant to be paired once per
        // client lifetime, not re-invoked on every purchase attempt —
        // calling StartConnection again while a connection is already open
        // is undocumented/unsupported usage that can leak service bindings.
        // Connect once and reuse; onDisconnected clears the flag so a later
        // call reconnects instead of assuming a dead connection is still
        // good.
        //
        // Also guards against a hang: onConnected/onDisconnected are the
        // only way this ever completes, so if Play Billing's service never
        // calls back (killed process, ANR, a buggy OEM billing service),
        // the whole purchase flow used to wait forever with no feedback.
        //
        // The timeout path is deliberately NOT the same as giving up on the
        // connection attempt itself — there is no API to cancel a native
        // StartConnection call, so it can still resolve late. _pendingConnect
        // stays set across a timeout (only cleared by the callbacks
        // themselves) specifically so a caller that retries right after a
        // timeout joins the same still-outstanding attempt instead of
        // calling StartConnection a second time while the first is unresolved
        // — that overlap is exactly the "unsupported usage" warned about
        // above.
        private async Task<bool> EnsureConnectedAsync(int timeoutMs = 10000)
        {
            if (_isConnected) return true;

            if (_pendingConnect == null)
            {
                var taskCompletion = new TaskCompletionSource<bool>();
                _pendingConnect = taskCompletion;
                _billingClient.StartConnection(
                    onConnected: () =>
                    {
                        _isConnected = true;
                        _pendingConnect = null;
                        taskCompletion.TrySetResult(true);
                    },
                    onDisconnected: (_) =>
                    {
                        _isConnected = false;
                        _pendingConnect = null;
                        taskCompletion.TrySetResult(false);
                    }
                );
            }

            // Captured locally: a callback firing while we're awaiting could
            // null out the field, but the Task this method is already
            // waiting on is unaffected either way.
            var pending = _pendingConnect;
            if (pending == null)
            {
                // A callback already resolved synchronously before this line.
                return _isConnected;
            }

            var finished = await Task.WhenAny(pending.Task, Task.Delay(timeoutMs));
            if (finished != pending.Task)
            {
                Debug.LogWarning("[GoogleBillingManager] Timed out waiting for Play Billing to connect.");
                return false;
            }

            return await pending.Task;
        }
#endif

        /// <summary>
        /// Follows Google's External Content Links integration guide exactly:
        /// 1. Connect to Google Play Billing
        /// 2. Check user eligibility (isBillingProgramAvailableAsync)
        /// 3. Generate external transaction token (createBillingProgramReportingDetailsAsync)
        /// 4. Call launchExternalLink with CALLER_WILL_LAUNCH_LINK so Google shows
        ///    its information dialog — required for program compliance
        /// 5. Return token to caller only if all steps succeed
        /// If any step fails or returns BillingUnavailable, returns null and
        /// ShoppingManager opens the store without a token.
        /// </summary>
        public async Task<string> GetExternalTransactionToken(string storeUrl)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            // Step 1: Connect
            var connected = await EnsureConnectedAsync();
            if (!connected)
            {
                Debug.LogWarning("[GoogleBillingManager] Failed to connect to Google Play Billing.");
                return null;
            }

            // Step 2: Check eligibility
            var availabilityResponse = await _billingClient.IsBillingProgramAvailableAsync();
            if (availabilityResponse != UnityEngine.Purchasing.Models.GoogleBillingResponseCode.Ok)
            {
                Debug.LogWarning($"[GoogleBillingManager] External content links not available. Response: {availabilityResponse}");
                return null;
            }

            // Step 3: Generate token — must be done immediately before linking out
            var reportingDetails = await _billingClient.CreateBillingProgramReportingDetailsAsync();
            if (reportingDetails.responseCode != UnityEngine.Purchasing.Models.GoogleBillingResponseCode.Ok)
            {
                Debug.LogError($"[GoogleBillingManager] Failed to create reporting details. Response: {reportingDetails.responseCode}");
                return null;
            }

            var token = reportingDetails.externalTransactionToken;
            Debug.Log($"[GoogleBillingManager] Token generated: {token}");

            // Step 4: Call launchExternalLink with CALLER_WILL_LAUNCH_LINK
            // This triggers Google's required information dialog before we open the URL
            var launchResponse = await _billingClient.LaunchExternalLink(
                storeUrl,
                UnityEngine.Purchasing.GoogleBilling.Models.LinkType.LINK_TO_DIGITAL_CONTENT_OFFER,
                UnityEngine.Purchasing.GoogleBilling.Models.LaunchMode.CALLER_WILL_LAUNCH_LINK
            );

            if (launchResponse != UnityEngine.Purchasing.Models.GoogleBillingResponseCode.Ok)
            {
                Debug.LogWarning($"[GoogleBillingManager] LaunchExternalLink failed. Response: {launchResponse}");
                return null;
            }

            // Step 5: Google's dialog was shown — caller may now open the URL
            return token;
#else
            await Task.CompletedTask;
            return null;
#endif
        }
    }
}
