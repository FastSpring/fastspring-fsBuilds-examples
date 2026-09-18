using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class HPBarDisplay : MonoBehaviour
{
    [SerializeField] private Slider slider;
    [SerializeField] private TextMeshProUGUI hpText;

    public void SetHP(int current, int max)
    {
        if (slider != null)
            slider.value = (float)current / max;

        if (hpText != null)
            hpText.text = $"{current}/{max}";
    }
}