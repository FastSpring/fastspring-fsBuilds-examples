using UnityEngine;

namespace Utils
{
    public abstract class Singleton<T> : MonoBehaviour where T : MonoBehaviour
    {
        private static T instance;
        private static bool applicationIsQuitting;
        
        public static bool IsAlive => !applicationIsQuitting && instance is not null;

        public static T Instance
        {
            get
            {
                if (!applicationIsQuitting) return instance;
                
                Debug.LogWarning($"[Singleton] Instance '{typeof(T)}' already destroyed or quitting.");
                return null;

            }
        }

        protected virtual void Awake()
        {
            if (instance is not null && instance != this)
            {
                Debug.LogError($"[Singleton] Duplicate instance of {typeof(T)} found. Destroying {name}.");
                Destroy(this);
                return;
            }

            instance = this as T;

            if (this is ISystem system)
            {
                SystemsManager.Instance.RegisterSystem(system);
            }
        }

        protected virtual void OnDestroy()
        {
            if (instance == this)
            {
                instance = null;
            }
        }

        protected static void ForceClearInstance()
        {
            applicationIsQuitting = true;
            instance = null;
        }
    }
}