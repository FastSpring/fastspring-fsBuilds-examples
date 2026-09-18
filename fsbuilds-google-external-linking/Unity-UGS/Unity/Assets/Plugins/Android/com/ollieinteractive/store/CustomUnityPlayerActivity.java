package com.ollieinteractive.store;

import android.content.Intent;
import com.unity3d.player.UnityPlayerActivity;
import com.unity3d.player.UnityPlayer;

import com.ollieinteractive.store.ChromeCustomTabsProvider;

public class CustomUnityPlayerActivity extends UnityPlayerActivity {
    @Override
    protected void onStart() {
        super.onStart();
        ChromeCustomTabsProvider.setUnityActivity(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        String url = intent.getDataString();
        if (url != null) {
            // Must match the actual GameObject name in MainScene.unity
            // exactly (UnitySendMessage resolves by exact, case-sensitive
            // name) — it's "DeeplinkHandler" (lowercase L), matching the C#
            // class's file name (Utils/DeeplinkHandler.cs), not the class
            // name itself (DeepLinkHandler). iOS's StoreViewController.mm
            // already uses this correct casing; this was the one call site
            // that didn't, silently breaking the entire Android return flow.
            UnityPlayer.UnitySendMessage(
                "DeeplinkHandler",
                "OnDeepLinkActivated",
                url
            );
        }
    }
}