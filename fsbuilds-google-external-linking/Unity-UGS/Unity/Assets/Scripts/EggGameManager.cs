using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Utils;

public class EggGameManager : MonoBehaviour
{
    public static EggGameManager Instance { get; private set; }

    [SerializeField] private MonsterSpawner monsterSpawner;
    [SerializeField] private EggGameUI eggGameUI;
    [SerializeField] private float roundDuration = 30f;
    [SerializeField] private LevelDisplay levelDisplay;

    private int _score = 0;
    private float _timeRemaining;
    private bool _roundActive = false;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
    }

    private void Start()
    {
        StartCoroutine(SpendAndStartRound());
    }

    private IEnumerator SpendAndStartRound()
    {
        var token = Managers.AuthManager.Instance?.AccessToken;
        if (string.IsNullOrEmpty(token))
        {
            Debug.LogWarning("[EggGameManager] No access token, starting without spending.");
            StartRound();
            yield break;
        }

        var jsonBody = "{\"amount\": 10}";
        using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/spend", "POST");
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.SetRequestHeader("Authorization", token);

        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
        {
            Debug.Log($"[EggGameManager] Spent 10 coins: {request.downloadHandler.text}");
            Managers.EconomyManager.Instance?.Fetch();
        }
        else
        {
            Debug.LogWarning($"[EggGameManager] Spend failed: {request.error} — starting anyway");
        }

        StartRound();
    }

    private void StartRound()
    {
        _score = 0;
        _timeRemaining = roundDuration;
        _roundActive = true;
        eggGameUI.UpdateScore(0);
        eggGameUI.UpdateTimer((int)roundDuration);
        monsterSpawner.StartSpawning();
    }

    private void Update()
    {
        if (!_roundActive) return;

        _timeRemaining -= Time.deltaTime;
        eggGameUI.UpdateTimer(Mathf.CeilToInt(_timeRemaining));

        if (_timeRemaining <= 0)
        {
            EndRound();
        }
    }

private void EndRound()
{
    _roundActive = false;
    monsterSpawner.StopSpawning();

    foreach (var monster in FindObjectsOfType<Monster>())
    {
        Destroy(monster.gameObject);
    }

    eggGameUI.ShowRoundComplete(_score);
    StartCoroutine(EarnCoins(_score));
    StartCoroutine(EarnEggs(_score));
    StartCoroutine(CheckLevelUp(_score));

    if (levelDisplay != null)
    {
        _ = levelDisplay.RefreshDisplay();
    }
}
    private IEnumerator EarnCoins(int amount)
    {
        if (amount <= 0) yield break;

        var token = Managers.AuthManager.Instance?.AccessToken;
        if (string.IsNullOrEmpty(token)) yield break;

        var jsonBody = $"{{\"amount\": {amount}}}";
        using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/earn", "POST");
        request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        request.SetRequestHeader("Authorization", token);

        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
        {
            Debug.Log($"[EggGameManager] Earned {amount} coins: {request.downloadHandler.text}");
            Managers.EconomyManager.Instance?.Fetch();
        }
        else
        {
            Debug.LogWarning($"[EggGameManager] Earn failed: {request.error}");
        }
    }
private IEnumerator EarnEggs(int score)
{
    if (score <= 0) yield break;

    var token = Managers.AuthManager.Instance?.AccessToken;
    if (string.IsNullOrEmpty(token)) yield break;

    var jsonBody = $"{{\"score\": {score}}}";
    using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/earnEggs", "POST");
    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
    request.downloadHandler = new DownloadHandlerBuffer();
    request.SetRequestHeader("Content-Type", "application/json");
    request.SetRequestHeader("Authorization", token);

    yield return request.SendWebRequest();

    if (request.result == UnityWebRequest.Result.Success)
    {
        Debug.Log($"[EggGameManager] Earned eggs: {request.downloadHandler.text}");
    }
    else
    {
        Debug.LogWarning($"[EggGameManager] EarnEggs failed: {request.error}");
    }
}
   public void AddScore(int amount)
{
    if (!_roundActive) return;
    _score += amount;
    eggGameUI.UpdateScore(_score);
}

public int GetSelectedEggDamage()
{
    return EggInventory.Instance?.GetSelectedDamage() ?? 1;
}
    public int GetScore() => _score;
    public void ResetScore() => _score = 0;

    public void PlayAgain()
    {
        eggGameUI.HideRoundComplete();
        StartCoroutine(SpendAndStartRound());
    }

private IEnumerator CheckLevelUp(int xpEarned)
{
    if (xpEarned <= 0) yield break;

    var token = Managers.AuthManager.Instance?.AccessToken;
    if (string.IsNullOrEmpty(token)) yield break;

    var jsonBody = $"{{\"xpEarned\": {xpEarned}}}";
    using var request = new UnityWebRequest($"{StoreConfig.BackendBaseUrl}/checkLevelUp", "POST");
    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(jsonBody));
    request.downloadHandler = new DownloadHandlerBuffer();
    request.SetRequestHeader("Content-Type", "application/json");
    request.SetRequestHeader("Authorization", token);

    yield return request.SendWebRequest();

    if (request.result == UnityWebRequest.Result.Success)
    {
        Debug.Log($"[EggGameManager] Level check: {request.downloadHandler.text}");
    }
    else
    {
        Debug.LogWarning($"[EggGameManager] CheckLevelUp failed: {request.error}");
    }
}
}
