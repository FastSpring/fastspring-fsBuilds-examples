## Unity FastSpring Integration

This Unity project provides a ready-to-use integration with a FastSpring web-based store using a secure backend payload. It supports:

- Opening a web-based store for purchasing in-game currency.
- Handling FastSpring return deep links (e.g., `fastspring://shop-return`).
- Polling Unity Gaming Services (UGS) Economy to confirm balance updates after a purchase.
- Displaying a thank-you popup with the purchased coin amount.

## Unity Requirements
- Unity 2022.3 LTS or later
- Unity Authentication + Economy
- .NET Standard 2.1 compatibility


## 🔧 Configuration

### 1. StoreConfig Setup

Inside Unity, navigate to the **`StoreConfig`** ScriptableObject and update the following fields:

| Field | Description |
|------|-------------|
| `storeBaseUrl` | URL of the local or deployed WebStore (e.g., `http://localhost:8080`) |
| `returnUrl` | Deep link to return to the Unity app (e.g., `fastspring://shop-return`) |
| `purchaseCreatorEndpoint` | URL to the backend endpoint that encodes a secure FastSpring payload |

---

### 2. Product Setup

Each product in your FastSpring store should match the `productId` you pass to the `ShoppingManager.OpenStore(string productId)` method.

Example usage:
```csharp
ShoppingManager.Instance.OpenStore("coinpack-150");
```

### 3. Deeplink Handling

Unity listens to deep links such as. You can find more information [official Unity doc](https://docs.unity3d.com/6000.1/Documentation/Manual/deep-linking.html) :

```csharp
fastspring://shop-return?amount=150
```

The DeepLink handler will:
- Parse the amount query parameter.
- Automatically re-authenticate the player if not signed in.
-	Show a thank-you popup.
- Trigger balance polling via Unity Economy.

**Note**
You can simulate deep link testing in the Unity Editor by pressing the D key during play mode.

### Polling Unity Economy After Purchase Return via Deeplink

When a user completes a purchase using the FastSpring popup store, the system returns to the game via a custom **deep link** (`fastspring://shop-return`). At this point, the client does **not** yet know if Unity’s backend (UGS Economy) has registered the purchase and updated the balance.

To account for this potential delay, `EconomyManager` uses an **active polling mechanism** via the method `PollUntilBalanceChangesAsync`. This ensures the player's coin balance is refreshed once the backend processes the entitlement.


## Why Polling is Needed

- The webhook from FastSpring → backend → Unity Gaming Services may take a few seconds to process.
- There is no real-time push mechanism from UGS to Unity clients.
- Polling help the player sees their updated balance without needing to restart the app or manually refresh.


### 4. Economy Integration

This system uses Unity Gaming Services Economy. Make sure your project:
- Has Unity Authentication and Economy set up in the Unity Dashboard.
- Uses a currency with ID COINS (or change this in the EconomyManager).

To display a thank-you message with updated coins:

```csharp
EconomyManager.Instance.ShowThanksYouPopup(delta);
```

### 5. Generating and Opening a Secure FastSpring Purchase

This section explains how a secure FastSpring purchase is initiated from the Unity client, using an encoded payload provided by your backend.

## Purpose

The Unity client does **not** directly generate a FastSpring session. Instead, it delegates that to your **backend**. To securely open a FastSpring checkout for a specific product, the Unity client:

1. Verifies the player is authenticated.
2. Signs the purchase data using a private key.
3. Returns the signed payload and key to Unity.
4. Unity builds a secure FastSpring store URL with this data.

This ensures:
- The product data cannot be tampered with.
- The purchase is linked to the signed-in player.


#### Step 1: Unity Generates the Request

When a player taps to purchase an item (e.g. "coinpack-500"), Unity sends a POST request to your backend endpoint. The header should send this: 

```csharp
request.SetRequestHeader("Content-Type", "application/json");
request.SetRequestHeader("Authorization", unityAccessToken);
```
And the body should generate a json like this one: 

```json
{
  "product": "coinpack-500"
}

```

After is done, it will return an URL with the securedPayload:

```
https://storeFrontURL?
product=coinpack-150&
securePayload=XXX&
returnUrl=fastspring://shop-return
```


## Multi-Platform Native WebStore Implementation

This project implements a flexible system for opening the FastSpring web store across different platforms using a **IShopProvider** interface pattern. This allows the application to use the most appropriate web browsing solution for each platform depending on what device is detected.


| Implementation | Description |
|------|-------------|
| `Android external (WebController)` | Opens the store in the device's default browser outside the app`) |
| `Chrome Custom Tabs` | Opens the store in a lightweight Chrome overlay with custom UI |


### Architecture Overview

The system uses conditional compilation and a provider pattern to select the optimal web browsing implementation at runtime:
```csharp
private void OpenShopProvider(string fullUrl)
{
    IShopProvider shopProvider;
#if UNITY_EDITOR   
    shopProvider = new WebController();
#elif ANDROID_CHROMETABS
    shopProvider = new ChromeCustomTabProvider();
#elif ANDROID_WEBVIEW
    //TODO
#elif ANDROID_EXTERNALCHROME
    shopProvider = new WebController();
#endif
    shopProvider.OpenStore(fullUrl);
}
```

### Platform-Specific Implementations

#### Android Chrome Custom Tabs

For Android devices, we use Chrome Custom Tabs for a native in-app browsing experience. This requires two components:

**1. Java Plugin (ChromeCustomTabsProvider.java)**

Place it in `Assets/Plugins/Android/`, this class handles the Chrome Custom Tabs integration:
```java
public class ChromeCustomTabsProvider {
    private static Activity unityActivity;

    public static void setUnityActivity(Activity activity) {
        unityActivity = activity;
    }

    public static void openCheckout(String url) {
        if (unityActivity == null) return;
        
        CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
        builder.setShowTitle(true);
        
        CustomTabsIntent customTabsIntent = builder.build();
        customTabsIntent.launchUrl(unityActivity, Uri.parse(url));
    }
}
```

**2. Custom Unity Player Activity**

The `CustomUnityPlayerActivity` extends Unity's default activity to handle deep link returns:
```java
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
            UnityPlayer.UnitySendMessage(
                "DeepLinkHandler", 
                "OnDeepLinkActivated",
                url
            );
        }
    }
}
```

| :warning: WARNING           |
|:----------------------------|
| The call to UnityPlayer.UnitySendMessage("DeepLinkHandler", "OnDeepLinkActivated", url); sends a message from the native Android layer back to Unity.	DeepLinkHandler must be the name of a root GameObject in your Unity scene (not a child object).The target script attached to that GameObject must define a public method matching the name passed in the call   |

### Adding Custom Implementations

To add a new platform implementation:

1. Create a class that implements `IShopProvider`
2. Implement the `OpenStore(string url)` method
3. Add the appropriate conditional compilation directive in `OpenShopProvider`
4. If using native plugins (Android and/or iOS), place them in the corresponding `Assets/Plugins/` directory

### Dependencies

**Android Chrome Custom Tabs:**
- Add to `mainTemplate.gradle`:
```gradle
  dependencies {
      implementation 'androidx.browser:browser:1.5.0'
  }
```

**Android Manifest:**
- Ensure your `AndroidManifest.xml` specifies the custom activity and deep link intent filter:
```xml
  <activity android:name="com.ollieinteractive.store.CustomUnityPlayerActivity">
      <intent-filter>
          <action android:name="android.intent.action.VIEW" />
          <category android:name="android.intent.category.DEFAULT" />
          <category android:name="android.intent.category.BROWSABLE" />
          <data android:scheme="fastspring" android:host="shop-return" />
      </intent-filter>
  </activity>
```


