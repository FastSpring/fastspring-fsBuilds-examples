using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

public class Monster : MonoBehaviour
{
    public event Action OnKilled;

    private int _currentHP;
    private int _maxHP;
    private int _coinReward;
    private SpriteRenderer _spriteRenderer;
    private Color _originalColor;
    private HPBarDisplay _hpBarDisplay;
    private GameObject _hpBarObj;

    private bool _isDead = false;
    private int _pendingDamage = 0;

    [SerializeField] private GameObject hpBarPrefab;
    [SerializeField] private GameObject coinPopupPrefab;
    [SerializeField] private GameObject projectilePrefab;

    public void SetMonsterData(MonsterData data)
    {
        _maxHP = data.maxHP;
        _currentHP = data.maxHP;
        _coinReward = data.coinReward;
        _spriteRenderer = GetComponent<SpriteRenderer>();

        if (data.sprites != null && data.sprites.Length > 0)
        {
            _spriteRenderer.sprite = data.sprites[UnityEngine.Random.Range(0, data.sprites.Length)];
        }

        _originalColor = _spriteRenderer.color;

        if (hpBarPrefab != null)
        {
            var canvas = GameObject.Find("Canvas");
            if (canvas != null)
            {
                _hpBarObj = Instantiate(hpBarPrefab, canvas.transform);
                _hpBarDisplay = _hpBarObj.GetComponent<HPBarDisplay>();
                UpdateHPBar();
            }
        }
    }

    private void Update()
    {
        if (_hpBarObj != null)
        {
            var screenPos = Camera.main.WorldToScreenPoint(transform.position + Vector3.up * 1.5f);
            RectTransformUtility.ScreenPointToLocalPointInRectangle(
                _hpBarObj.transform.parent.GetComponent<RectTransform>(),
                screenPos,
                null,
                out Vector2 localPos
            );
            _hpBarObj.GetComponent<RectTransform>().localPosition = localPos;
        }
    }

    private void OnMouseDown()
    {
        if (_isDead) return;
        if (_currentHP - _pendingDamage <= 0) return;

        var character = GameObject.Find("Character");
        var eggData = EggInventory.Instance?.GetSelectedEgg();
        var damage = EggGameManager.Instance.GetSelectedEggDamage();

        _pendingDamage += damage;

        if (projectilePrefab != null && character != null && eggData != null)
        {
            var projectile = Instantiate(projectilePrefab);
            var projScript = projectile.GetComponent<Projectile>();

            var characterHolder = character.GetComponent<CharacterEggHolder>();
            var launchPos = characterHolder != null ? characterHolder.GetHeldEggPosition() : character.transform.position;

           projScript.Launch(launchPos, transform.position, eggData.sprite, () =>
{
    if (this != null && gameObject != null)
    {
        _pendingDamage -= damage;
        TakeDamage(damage);
    }
});
        }
        else
        {
            TakeDamage(damage);
        }
    }

    private void TakeDamage(int damage)
    {
        if (_isDead) return;

        _currentHP = Mathf.Max(0, _currentHP - damage);
        UpdateHPBar();
        StartCoroutine(FlashRed());

        if (_currentHP <= 0)
        {
            _isDead = true;

            if (_hpBarObj != null) Destroy(_hpBarObj);

            if (coinPopupPrefab != null)
            {
                var canvas = GameObject.Find("Canvas");
                if (canvas != null)
                {
                    var popup = Instantiate(coinPopupPrefab, canvas.transform);
                    var screenPos = Camera.main.WorldToScreenPoint(transform.position);
                    RectTransformUtility.ScreenPointToLocalPointInRectangle(
                        canvas.GetComponent<RectTransform>(),
                        screenPos,
                        null,
                        out Vector2 localPos
                    );
                    popup.GetComponent<RectTransform>().localPosition = localPos;
                    popup.GetComponent<CoinPopup>().Show(_coinReward);
                }
            }

            EggGameManager.Instance.AddScore(_coinReward);
            OnKilled?.Invoke();
            Destroy(gameObject);
        }
    }

    private void UpdateHPBar()
    {
        if (_hpBarDisplay != null)
        {
            _hpBarDisplay.SetHP(_currentHP, _maxHP);
        }
    }

    private IEnumerator FlashRed()
    {
        _spriteRenderer.color = Color.red;
        yield return new WaitForSeconds(0.15f);
        _spriteRenderer.color = _originalColor;
    }

    private void OnDestroy()
    {
        if (_hpBarObj != null)
        {
            Destroy(_hpBarObj);
        }
    }
}