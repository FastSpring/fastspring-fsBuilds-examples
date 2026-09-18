package com.ollieinteractive.store;

import android.app.Activity;
import android.content.Intent;

import com.unity3d.player.UnityPlayer;

public class WebViewProvider {
    private static Activity unityActivity;

    public static void setUnityActivity(Activity activity) {
        unityActivity = activity;
    }
    
    public static void openUrl(String url) {
        Activity activity = UnityPlayer.currentActivity;
        Intent intent = new Intent(activity, WebViewActivity.class);
        intent.putExtra(WebViewActivity.EXTRA_URL, url);
        activity.startActivity(intent);
        
        activity.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }
}