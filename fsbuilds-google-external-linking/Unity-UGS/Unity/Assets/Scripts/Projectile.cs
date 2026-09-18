using System.Collections;
using UnityEngine;

public class Projectile : MonoBehaviour
{
    [SerializeField] private float travelTime = 0.3f;
    [SerializeField] private float dropDuration = 0.4f;

    public void Launch(Vector3 startPos, Vector3 targetPos, Sprite eggSprite, System.Action onHit)
    {
        transform.position = startPos;
        GetComponent<SpriteRenderer>().sprite = eggSprite;
        StartCoroutine(TravelAndDrop(startPos, targetPos, onHit));
    }

    private IEnumerator TravelAndDrop(Vector3 startPos, Vector3 targetPos, System.Action onHit)
    {
        float elapsed = 0f;
        while (elapsed < travelTime)
        {
            elapsed += Time.deltaTime;
            transform.position = Vector3.Lerp(startPos, targetPos, elapsed / travelTime);
            yield return null;
        }

        transform.position = targetPos;
        onHit?.Invoke();

        // Drop and fade after impact
        var spriteRenderer = GetComponent<SpriteRenderer>();
        var startColor = spriteRenderer.color;
        elapsed = 0f;

        while (elapsed < dropDuration)
        {
            elapsed += Time.deltaTime;
            transform.position += Vector3.down * 2f * Time.deltaTime;
            float alpha = Mathf.Lerp(1f, 0f, elapsed / dropDuration);
            spriteRenderer.color = new Color(startColor.r, startColor.g, startColor.b, alpha);
            yield return null;
        }

        Destroy(gameObject);
    }
}