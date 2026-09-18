using System;
using System.Collections.Generic;
using UnityEngine;
using Utils;
using Utils.EventManager;

namespace Managers
{
    public class EventManager : Singleton<EventManager>, ISystem
    {
        private readonly Dictionary<EventKey, Action<object>> _eventTable = new();

        public void AddListener(EventKey eventKey, Action<object> listener)
        {
            if (!_eventTable.ContainsKey(eventKey))
                _eventTable[eventKey] = delegate { };

            _eventTable[eventKey] += listener;
            var listenerCount = _eventTable[eventKey]?.GetInvocationList().Length ?? 0;
            Debug.Log($"[EventManager] Added listener to {eventKey.name}. Total listeners: {listenerCount}");
        }

        public void RemoveListener(EventKey eventKey, Action<object> listener)
        {
            if (_eventTable.ContainsKey(eventKey))
            {
                _eventTable[eventKey] -= listener;
                if (_eventTable[eventKey] == null)
                    _eventTable.Remove(eventKey);
            }
        }

        public void RaiseEvent(EventKey eventKey, object payload = null)
        {
            if (_eventTable.TryGetValue(eventKey, out var callback))
            {
                callback?.Invoke(payload);
            }
            else
            {
                Debug.Log($"[EventManager] No listeners for event '{eventKey.name}'");
            }
        }

        public void Initialize()
        {
            Debug.Log("[EventManager] Initialized");
        }

        public void Shutdown()
        {
            Debug.Log("[EventManager] Shutting down");
            _eventTable.Clear();
        }
    }
}