package com.ollieinteractive.store;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Button;
import android.widget.FrameLayout;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.widget.ImageButton;
import android.webkit.CookieManager;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import android.util.Log;

import com.unity3d.player.UnityPlayer;

public class WebViewActivity extends Activity {
    public static final String EXTRA_URL = "extra_url";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra(EXTRA_URL);

        // This Activity is not exported (see AndroidManifest.xml) and is
        // only ever launched in-process with a URL built from StoreConfig,
        // but validate anyway rather than trust the extra blindly — a WebView
        // here runs with JavaScript and the Payment Request API enabled, so
        // only ever load https, never a local/JS/content scheme.
        Uri parsedUrl = url != null ? Uri.parse(url) : null;
        if (parsedUrl == null || !"https".equalsIgnoreCase(parsedUrl.getScheme())) {
            Log.e("WebViewActivity", "Refusing to load non-https URL: " + url);
            finish();
            return;
        }

        FrameLayout layout = new FrameLayout(this);

        webView = new WebView(this);
        WebSettings webSettings = webView.getSettings();
        
        // Update WebView settings to allow JavaScript and payment request
        webSettings.setJavaScriptEnabled(true);
        
        // Enable Payment Request API for Google Pay
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PAYMENT_REQUEST)) {
            WebSettingsCompat.setPaymentRequestEnabled(webSettings, true);
             Log.d("WebViewActivity", "Payment Request API enabled successfully for Google Pay.");
        }
        else
        {
            Log.d("WebViewActivity", "Payment Request API NOT enabled for Google Pay.");
        }
        
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                if (scheme != null && scheme.equalsIgnoreCase("fastspring")) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(intent);
                    finish();
                    return true;
                }

                return false; // allow normal navigation
            }
        });
        
        if (url != null) {
            webView.loadUrl(url);
        }

        // Close button overlay
        // 1 - Create background circle
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#5B2EFF"));
        bg.setShape(GradientDrawable.OVAL);
        bg.setStroke(3, Color.WHITE);
        
        // 2 - Create the button
        ImageButton closeButton = new ImageButton(this);
        closeButton.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeButton.setColorFilter(Color.WHITE);
        closeButton.setBackground(bg);
        closeButton.setScaleType(ImageButton.ScaleType.CENTER);
        
        // Reduce padding
        int padding = (int) (8 * getResources().getDisplayMetrics().density);
        closeButton.setPadding(padding, padding, padding, padding);
        
        // 3 - 40dp circle
        int sizeInDp = 40;
        int sizeInPx = (int) (sizeInDp * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(sizeInPx, sizeInPx);
        lp.gravity = Gravity.TOP | Gravity.END;
        lp.topMargin = (int) (8 * getResources().getDisplayMetrics().density);
        lp.rightMargin = (int) (8 * getResources().getDisplayMetrics().density);
        
        // Close action
        closeButton.setOnClickListener(v -> finish());
        
        // Add views
        layout.addView(webView);
        layout.addView(closeButton, lp);
        
        setContentView(layout);
    }
    
    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }
}