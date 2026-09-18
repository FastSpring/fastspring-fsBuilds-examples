using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class EggSelectorUI : MonoBehaviour
{
    [SerializeField] private Image eggIcon;
    [SerializeField] private EggInventory eggInventory;

    private void Start()
    {
        UpdateDisplay();
    }

    public void OnEggButtonTapped()
    {
        eggInventory.CycleNextEgg();
        UpdateDisplay();
    }

   private void UpdateDisplay()
{
    var egg = eggInventory.GetSelectedEgg();
    if (egg != null && eggIcon != null)
    {
        eggIcon.sprite = egg.sprite;
    }
    if (egg != null && characterEggHolder != null)
    {
        characterEggHolder.UpdateHeldEgg(egg.sprite);
    }

    if (egg != null && damageText != null)
{
    damageText.text = $"{egg.damage} DMG";
}
}

    [SerializeField] private CharacterEggHolder characterEggHolder;
    [SerializeField] private TextMeshProUGUI damageText;


}
