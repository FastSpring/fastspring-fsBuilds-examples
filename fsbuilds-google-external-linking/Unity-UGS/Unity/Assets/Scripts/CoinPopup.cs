using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class CoinPopup : MonoBehaviour
{
    [SerializeField] private TextMeshProUGUI popupText;
    [SerializeField] private Image coinIcon;
    [SerializeField] private float floatSpeed = 5f;
    [SerializeField] private float fadeDuration = 1f;

    public void Show(int amount)
    {
        popupText.text = $"+{amount}";
        StartCoroutine(FloatAndFade());
    }

    private IEnumerator FloatAndFade()
    {
        float elapsed = 0f;
        Color textColor = popupText.color;
        Color iconColor = coinIcon != null ? coinIcon.color : Color.white;

        while (elapsed < fadeDuration)
        {
            elapsed += Time.deltaTime;
            transform.position += Vector3.up * floatSpeed * Time.deltaTime;
            float alpha = Mathf.Lerp(1f, 0f, elapsed / fadeDuration);
            popupText.color = new Color(textColor.r, textColor.g, textColor.b, alpha);
            if (coinIcon != null)
                coinIcon.color = new Color(iconColor.r, iconColor.g, iconColor.b, alpha);
            yield return null;
        }

        Destroy(gameObject);
    }
}