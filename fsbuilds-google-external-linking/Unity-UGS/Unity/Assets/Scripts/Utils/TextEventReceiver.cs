using TMPro;
using UnityEngine;
using Utils.EventManager;

namespace Utils
{
    public class TextEventReceiver : MonoBehaviour
    {
        [SerializeField] private EventKey eventKey;
        [SerializeField] private TextMeshProUGUI targetText;

        private void Start()
        {
            eventKey?.AddListener(OnEventReceived);
        }

        private void OnDestroy()
        {
            if (Singleton<Managers.EventManager>.IsAlive)
            {
                eventKey?.RemoveListener(OnEventReceived);
            }
        }

        private void OnEventReceived(object payload)
        {
            var text = payload?.ToString() ?? string.Empty;
            targetText.text = text;
        }
    }
}
