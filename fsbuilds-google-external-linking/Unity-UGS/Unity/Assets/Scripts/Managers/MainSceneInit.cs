using UnityEngine;

public class MainSceneInit : MonoBehaviour
{
    private void Start()
    {
        if (Managers.EconomyManager.Instance != null)
        {
            Managers.EconomyManager.Instance.Fetch();
        }
    }
}