using System.Collections;
using Managers;
using UnityEngine;
using UnityEngine.UI;

namespace Utils
{
    [RequireComponent(typeof(RectTransform))]
    public class ShopProductButton : MonoBehaviour
    {
        [SerializeField] private string productId;
        [SerializeField] private float clickCooldown = 1.0f;

        private Button _button;
        private bool _clickBlocked;

        private void Awake()
        {
            _button = GetComponentInChildren<Button>();
            if (_button is null)
            {
                Debug.LogError("[ShopProductButton] No Button component found in children.");
                enabled = false;
                return;
            }

            _button.onClick.RemoveAllListeners();
            _button.onClick.AddListener(OnClick);
        }

      private void OnClick()
{
    if (_clickBlocked) return;

    if (string.IsNullOrEmpty(productId))
    {
        Debug.LogWarning("[ShopProductButton] Product ID is not set.");
        return;
    }

    // Disable button immediately to give visual feedback while store loads
    _button.interactable = false;

    ShoppingManager.Instance.OpenStore(productId);
    StartCoroutine(ClickCooldownRoutine());
}

private IEnumerator ClickCooldownRoutine()
{
    _clickBlocked = true;
    yield return new WaitForSeconds(clickCooldown);
    _clickBlocked = false;
    _button.interactable = true;
}
    }
}