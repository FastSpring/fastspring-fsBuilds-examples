using System;
using UnityEngine;
using UnityEngine.UI;
using Utils.EventManager;

namespace Utils
{
    public class ClickEventRaiser : MonoBehaviour
    {
        public enum PayloadType { None, String, Int, Float, Bool }

        [Header("Event Settings")]
        [SerializeField] private EventKey clickEvent;

        [Header("Payload Settings")]
        [SerializeField] private PayloadType payloadType = PayloadType.None;
        [SerializeField] private string stringPayload;
        [SerializeField] private int intPayload;
        [SerializeField] private float floatPayload;
        [SerializeField] private bool boolPayload;

        [Header("Config")]
        [SerializeField] private float clickCooldown = 0.8f;

        private bool _clickBlocked;
        private Button button;

        private void Awake()
        {
            button = GetComponent<Button>();
        }

        public void RaiseClick()
        {
            if (_clickBlocked || clickEvent is null)
            {
                button.interactable = false;
                return;
            }

            if (button is not null) button.interactable = true;
            _clickBlocked = true;
            clickEvent.Raise(GetPayload());

            Invoke(nameof(ResetClick), clickCooldown);
        }

        private object GetPayload()
        {
            return payloadType switch
            {
                PayloadType.String => stringPayload,
                PayloadType.Int => intPayload,
                PayloadType.Float => floatPayload,
                PayloadType.Bool => boolPayload,
                _ => null,
            };
        }

        private void ResetClick()
        {
            _clickBlocked = false;
            if (button is not null) button.interactable = true;
        }
    }
}