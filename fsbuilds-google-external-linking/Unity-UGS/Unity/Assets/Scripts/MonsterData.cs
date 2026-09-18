using UnityEngine;

[CreateAssetMenu(fileName = "MonsterData", menuName = "EggBlast/MonsterData")]
public class MonsterData : ScriptableObject
{
    public string monsterName;
    public Sprite[] sprites;
    public int maxHP;
    public int coinReward;
    [Range(0f, 1f)]
    public float spawnWeight;
}
