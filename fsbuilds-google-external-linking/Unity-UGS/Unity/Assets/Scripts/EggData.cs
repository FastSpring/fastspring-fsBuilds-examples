using UnityEngine;

[CreateAssetMenu(fileName = "EggData", menuName = "EggBlast/EggData")]
public class EggData : ScriptableObject
{
    public string eggName;
    public Sprite sprite;
    public int coinValue;
    public int damage;
    [Range(0f, 1f)]
    public float spawnWeight;
}