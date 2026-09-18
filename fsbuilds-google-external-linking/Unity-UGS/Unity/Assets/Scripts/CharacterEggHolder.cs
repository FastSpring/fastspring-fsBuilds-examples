using UnityEngine;

public class CharacterEggHolder : MonoBehaviour
{
    [SerializeField] private SpriteRenderer heldEggRenderer;

    public void UpdateHeldEgg(Sprite eggSprite)
    {
        if (heldEggRenderer != null)
        {
            heldEggRenderer.sprite = eggSprite;
        }
    }

    public Vector3 GetHeldEggPosition()
    {
        return heldEggRenderer != null ? heldEggRenderer.transform.position : transform.position;
    }
}