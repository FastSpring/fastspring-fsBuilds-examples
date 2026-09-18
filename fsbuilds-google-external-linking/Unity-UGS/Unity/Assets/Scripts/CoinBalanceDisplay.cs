using TMPro;
using UnityEngine;
using System.Collections;

public class CoinBalanceDisplay : MonoBehaviour
{
    [SerializeField] private TextMeshProUGUI coinText;

    private void OnEnable()
    {
        StartCoroutine(RefreshLoop());
    }

    private void OnDisable()
    {
        StopAllCoroutines();
    }

    private IEnumerator RefreshLoop()
    {
        while (true)
        {
            if (Managers.EconomyManager.Instance != null)
            {
                coinText.text = $"{Managers.EconomyManager.Instance.GetBalance()}";
            }
            yield return new WaitForSeconds(1f);
        }
    }
}