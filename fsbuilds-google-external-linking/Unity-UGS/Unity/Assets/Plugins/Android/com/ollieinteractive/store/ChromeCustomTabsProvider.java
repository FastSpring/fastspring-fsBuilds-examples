package com.ollieinteractive.store;

import android.app.Activity;
import android.net.Uri;

import androidx.browser.customtabs.CustomTabsIntent;

public class ChromeCustomTabsProvider {
    private static Activity unityActivity;

    public static void setUnityActivity(Activity activity) {
        unityActivity = activity;
    }

    public static void openCheckout(String url) {
        if (unityActivity == null) return;
        
        int toolbarColor = 0xFF5A2D82; // #5A2D82

        CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
        builder.setShowTitle(true);

        builder.setToolbarColor(toolbarColor);

        builder.enableUrlBarHiding();
        builder.setShowTitle(true);

        CustomTabsIntent customTabsIntent = builder.build();
        customTabsIntent.launchUrl(unityActivity, Uri.parse(url));
    }
}