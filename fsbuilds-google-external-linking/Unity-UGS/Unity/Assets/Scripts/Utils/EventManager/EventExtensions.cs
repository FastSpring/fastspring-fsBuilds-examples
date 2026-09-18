namespace Utils.EventManager
{
    public static class EventExtensions
    {
        public static void AddListener(this IEventKeyProvider provider, System.Action<object> callback)
        {
            Managers.EventManager.Instance.AddListener(provider.EventKeyName, callback);
        }

        public static void RemoveListener(this IEventKeyProvider provider, System.Action<object> callback)
        {
            Managers.EventManager.Instance.RemoveListener(provider.EventKeyName, callback);
        }

        public static void Raise(this IEventKeyProvider provider, object payload = null)
        {
            Managers.EventManager.Instance.RaiseEvent(provider.EventKeyName, payload);
        }
    }
}
