using TMPro;
using UnityEngine;

public class EggGameUI : MonoBehaviour
{
    private TextMeshProUGUI scoreText;
    private TextMeshProUGUI timerText;
    private GameObject roundCompletePanel;
    private TextMeshProUGUI finalScoreText;

    private void Awake()
    {
        scoreText = GameObject.Find("ScoreText").GetComponent<TextMeshProUGUI>();
        timerText = GameObject.Find("TimerText").GetComponent<TextMeshProUGUI>();
        roundCompletePanel = GameObject.Find("RoundCompletePanel");
        finalScoreText = GameObject.Find("FinalScoreText").GetComponent<TextMeshProUGUI>();
        roundCompletePanel.SetActive(false);
    }

    public void UpdateScore(int score)
    {
        scoreText.text = $"Score: {score}";
    }

    public void UpdateTimer(int secondsRemaining)
    {
        timerText.text = $"Time: {secondsRemaining}";
    }

    public void ShowRoundComplete(int finalScore)
    {
        roundCompletePanel.SetActive(true);
        finalScoreText.text = $"Score: {finalScore}";
    }

    public void HideRoundComplete()
    {
        roundCompletePanel.SetActive(false);
    }
}