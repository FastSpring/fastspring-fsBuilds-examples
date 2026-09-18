using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class EggSpawner : MonoBehaviour
{
    [SerializeField] private GameObject eggPrefab;
    [SerializeField] private List<EggData> eggTypes;
    [SerializeField] private float spawnInterval = 1.5f;
    [SerializeField] private int maxEggsOnScreen = 5;

    private int _currentEggs = 0;

    public void StartSpawning()
    {
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
            if (_currentEggs < maxEggsOnScreen)
            {
                SpawnEgg();
            }
            yield return new WaitForSeconds(spawnInterval);
        }
    }

    private void SpawnEgg()
    {
        var cam = Camera.main;
        var spawnPos = cam.ViewportToWorldPoint(new Vector3(
            Random.Range(0.1f, 0.9f),
            Random.Range(0.2f, 0.8f),
            cam.nearClipPlane + 1f
        ));
        spawnPos.z = 0f;

        var eggData = GetRandomEggData();
        var egg = Instantiate(eggPrefab, spawnPos, Quaternion.identity);
        var eggScript = egg.GetComponent<Egg>();
        eggScript.SetEggData(eggData);
        eggScript.OnDestroyed += () => _currentEggs--;
        _currentEggs++;
    }

    private EggData GetRandomEggData()
    {
        float total = 0f;
        foreach (var egg in eggTypes)
            total += egg.spawnWeight;

        float roll = Random.Range(0f, total);
        float cumulative = 0f;

        foreach (var egg in eggTypes)
        {
            cumulative += egg.spawnWeight;
            if (roll <= cumulative)
                return egg;
        }

        return eggTypes[0];
    }
}