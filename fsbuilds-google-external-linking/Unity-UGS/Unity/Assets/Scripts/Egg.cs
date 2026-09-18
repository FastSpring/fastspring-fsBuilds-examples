using System;
using UnityEngine;

public class Egg : MonoBehaviour
{
    public event Action OnDestroyed;
    
    private bool _tapped = false;
    private int _coinValue = 1;

    [SerializeField] private GameObject coinPopupPrefab;

    public void SetEggData(EggData data)
    {
        _coinValue = data.coinValue;
        GetComponent<SpriteRenderer>().sprite = data.sprite;
    }

private void OnMouseDown()
{
    if (_tapped) return;
    _tapped = true;

    // Show coin popup
    if (coinPopupPrefab != null)
    {
        var canvas = GameObject.Find("Canvas");
        if (canvas != null)
        {
            var popup = Instantiate(coinPopupPrefab, canvas.transform);
            // Convert world position to screen position
            var screenPos = Camera.main.WorldToScreenPoint(transform.position);
            // Convert screen position to canvas local position
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                canvas.GetComponent<RectTransform>(),
                screenPos,
                null,
                out Vector2 localPos
            );
            popup.GetComponent<RectTransform>().localPosition = localPos;
            popup.GetComponent<CoinPopup>().Show(_coinValue);
        }
    }

    EggGameManager.Instance.AddScore(_coinValue);
    OnDestroyed?.Invoke();
    Destroy(gameObject);
}
}