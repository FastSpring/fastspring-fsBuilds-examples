using UnityEngine;

namespace Utils.EventManager
{
    public class RuntimeEventKeyProvider : IEventKeyProvider
    {
        public EventKey EventKeyName { get; }

        public RuntimeEventKeyProvider(string debugName = "RuntimeEvent")
        {
            var instance = ScriptableObject.CreateInstance<EventKey>();

#if UNITY_EDITOR
            instance.name = debugName;
#endif
            EventKeyName = instance;
        }
    }
}