using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class LevelDisplay : MonoBehaviour
{
    [SerializeField] private TextMeshProUGUI levelText;
    [SerializeField] private Slider progressBar;

    private readonly int[] levelThresholds = { 0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500 };

    private async void OnEnable()
    {
        await RefreshDisplay();
    }

    public async System.Threading.Tasks.Task RefreshDisplay()
    {
        Debug.Log("[LevelDisplay] RefreshDisplay called");

        if (Managers.EconomyManager.Instance == null)
        {
            Debug.LogWarning("[LevelDisplay] EconomyManager instance is null");
            return;
        }

        var level = await Managers.EconomyManager.Instance.GetCurrencyBalance("PLAYER_LEVEL");
        var xp = await Managers.EconomyManager.Instance.GetCurrencyBalance("XP");

        Debug.Log($"[LevelDisplay] Level: {level}, XP: {xp}");

        if (level < 1) level = 1;

        levelText.text = $"Lv. {level}";

        if (level >= levelThresholds.Length)
        {
            progressBar.value = 1f;
            return;
        }

        var currentThreshold = levelThresholds[level - 1];
        var nextThreshold = levelThresholds[level];
        var progress = (float)(xp - currentThreshold) / (nextThreshold - currentThreshold);

        Debug.Log($"[LevelDisplay] Progress: {progress} (current threshold: {currentThreshold}, next: {nextThreshold})");

        progressBar.value = Mathf.Clamp01(progress);
    }
}
