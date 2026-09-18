using System.Collections.Generic;
using UnityEngine;
using Managers;

namespace Utils
{
    public class SystemsManager : Singleton<SystemsManager>
    {
        [SerializeField] private List<MonoBehaviour> systemComponents;

        private readonly List<ISystem> _registered = new();
        
        protected override void Awake()
        {
            base.Awake();

            DontDestroyOnLoad(gameObject);
        }
        
        /// <summary>
        /// Registers a system dynamically (e.g., from a Singleton).
        /// If already registered, does nothing.
        /// </summary>
        public void RegisterSystem(ISystem system)
        {
            if (system == null || _registered.Contains(system))
                return;

            _registered.Add(system);
            system.Initialize();
        }

        /// <summary>
        /// Unregisters a system and shuts it down if it was registered.
        /// </summary>
        public void UnregisterSystem(ISystem system)
        {
            if (system == null || !_registered.Contains(system))
                return;

            system.Shutdown();
            _registered.Remove(system);
        }

        private void OnApplicationQuit()
        {
            for (var i = _registered.Count - 1; i >= 0; i--)
            {
                try
                {
                    _registered[i]?.Shutdown();
                }
                catch (System.Exception ex)
                {
                    Debug.LogError($"[SystemsManager] Error shutting down {_registered[i]?.GetType().Name}: {ex}");
                }
            }

            _registered.Clear();

            // Clear singleton instances manually
            Singleton<Managers.EventManager>.ForceClearInstance();
            Singleton<Managers.GameManager>.ForceClearInstance();
            Singleton<Managers.AuthManager>.ForceClearInstance();
            Singleton<Managers.EconomyManager>.ForceClearInstance();
            Singleton<Managers.ShoppingManager>.ForceClearInstance();
        }
    }
}