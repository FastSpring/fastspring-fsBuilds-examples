using System.Collections.Generic;
using UnityEngine;

public class EggInventory : MonoBehaviour
{
    public static EggInventory Instance { get; private set; }

    [SerializeField] private List<EggData> availableEggTypes;
    private int _selectedIndex = 0;

    private void Awake()
    {
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
    }

    public EggData GetSelectedEgg()
    {
        if (availableEggTypes == null || availableEggTypes.Count == 0) return null;
        return availableEggTypes[_selectedIndex];
    }

    public void CycleNextEgg()
    {
        _selectedIndex = (_selectedIndex + 1) % availableEggTypes.Count;
    }

    public int GetSelectedDamage()
    {
        return GetSelectedEgg()?.damage ?? 1;
    }
}