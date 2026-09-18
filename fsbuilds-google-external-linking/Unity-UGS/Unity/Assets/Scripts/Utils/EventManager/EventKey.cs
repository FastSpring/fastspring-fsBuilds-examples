using UnityEngine;

namespace Utils.EventManager
{
    [CreateAssetMenu(menuName = "Events/Event Key")]
    public class EventKey : ScriptableObject, IEventKeyProvider
    {
        [TextArea] public string Description;

#if UNITY_EDITOR
        [HideInInspector] public string runtimeName;
#endif
        public EventKey EventKeyName => this;
    }
}