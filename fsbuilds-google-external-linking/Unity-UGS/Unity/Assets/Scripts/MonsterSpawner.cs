using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class MonsterSpawner : MonoBehaviour
{
    [SerializeField] private GameObject monsterPrefab;
    [SerializeField] private List<MonsterData> monsterTypes;
    [SerializeField] private float spawnInterval = 2f;
    [SerializeField] private int maxMonstersOnScreen = 5;

    private int _currentMonsters = 0;

    public void StartSpawning()
    {
        _currentMonsters = 0;
        StartCoroutine(SpawnRoutine());
    }

    public void StopSpawning()
    {
        StopAllCoroutines();
    }

    private IEnumerator SpawnRoutine()
    {
        while (true)
        {
            if (_currentMonsters < maxMonstersOnScreen)
            {
                SpawnMonster();
            }
            yield return new WaitForSeconds(spawnInterval);
        }
    }

    private void SpawnMonster()
    {
        var cam = Camera.main;
        var spawnPos = cam.ViewportToWorldPoint(new Vector3(
            Random.Range(0.1f, 0.9f),
            Random.Range(0.35f, 0.85f),
            cam.nearClipPlane + 1f
        ));
        spawnPos.z = 0f;

        var monsterData = GetRandomMonsterData();
        var monster = Instantiate(monsterPrefab, spawnPos, Quaternion.identity);
        var monsterScript = monster.GetComponent<Monster>();
        monsterScript.SetMonsterData(monsterData);
        monsterScript.OnKilled += () => _currentMonsters--;
        _currentMonsters++;
    }

    private MonsterData GetRandomMonsterData()
    {
        float total = 0f;
        foreach (var m in monsterTypes)
            total += m.spawnWeight;

        float roll = Random.Range(0f, total);
        float cumulative = 0f;

        foreach (var m in monsterTypes)
        {
            cumulative += m.spawnWeight;
            if (roll <= cumulative)
                return m;
        }

        return monsterTypes[0];
    }
}
