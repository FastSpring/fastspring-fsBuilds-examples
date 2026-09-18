# React Native FastSpring Integration

This React Native Expo app provides a ready-to-use integration with a FastSpring web-based store using a secure backend payload. It supports:

- Automatic player authentication using device ID
- Opening a web-based FastSpring checkout in Safari/Chrome
- Handling FastSpring return deep links (e.g., `fsreactapp://purchase-complete`)
- Polling subscription status every 30 seconds to detect changes
- Displaying subscription offer or premium content based on subscription state

## Requirements

- Node.js 18+
- npm or yarn
- macOS with Xcode 14+ (for iOS)
- Android Studio (for Android)

## Setup

### Install Node.js (if not installed)

**Check if Node.js is installed:**
```bash
node --version
```

**If not installed, install Node.js:**

Option 1: Using Homebrew (recommended for macOS)
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

Option 2: Download from official website
- Visit https://nodejs.org
- Download the LTS version installer for your machine.
- Run the installer

### Install Dependencies

```bash
# Install npm dependencies
npm install

# iOS: Install CocoaPods if not already installed
# If gem command not found, install Ruby first (macOS includes Ruby by default)
sudo gem install cocoapods

# Install pods
cd ios
pod install
cd ..
```

### Running the App

**Development with Metro (recommended for development):**
```bash
# Start Metro bundler
npx expo start

# Then press 'i' for iOS simulator or 'a' for Android emulator
# Or scan QR code with Expo Go app on physical device
```

**iOS Simulator:**
```bash
npx expo run:ios
```

**iOS Device (specific device and configuration):**
```bash
npx expo run:ios --device "iPhoneSam" --configuration Release
```

**Android:**
```bash
npx expo run:android
```

---

## Project Structure

### Service Layer

| Service | Purpose |
|---------|---------|
| `apiService.js` | Centralized API calls to backend |
| `authService.js` | Player authentication using device ID |
| `deviceService.js` | Device ID generation and retrieval |
| `subscriptionService.js` | Subscription status checking |
| `purchaseService.js` | FastSpring checkout URL generation |
| `storageService.js` | Local storage for tokens and player data |

### Components

| Component | Purpose |
|-----------|---------|
| `App.js` | Main app with subscription flow and polling |
| `FastSpringCheckout.js` | Safari/Chrome checkout modal |

---

## How It Works

### 1. Player Authentication

When the app starts, it automatically authenticates the player using their device ID. This ID is consistent for each device and used to identify the player across sessions.

**What happens:**
1. App retrieves device ID from device storage
2. Sends POST request to `/login` with device ID
3. Backend returns player token and playerId
4. Token is stored locally for subsequent API calls

**API Call:**
```http
POST /login
Headers: { "Content-Type": "application/json" }
Body: { "deviceId": "unique-device-identifier" }
```

**Response:**
```json
{
  "success": true,
  "login": {
    "token": "player-auth-token",
    "playerId": "player_123456"
  }
}
```

---

### 2. Checking Subscription Status

After authentication, the app checks if the player has an active subscription by calling the backend endpoint.

**What happens:**
1. App sends player token to `/getSubscription`
2. Backend verifies subscription with FastSpring
3. Returns subscription state (active, canceled, deactivated, etc.)
4. App shows premium content if state is `active`, `overdue`, or `trial`

**API Call:**
```http
POST /getSubscription
Headers: {
  "Content-Type": "application/json",
  "Authorization": "player-auth-token"
}
Body: { "subscription": "bronze-monthly" }
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "playerId": "19e5c03c-44e8-4f76-8089-887eaf598938",
    "subscriptionId": "bronze-monthly",
    "state": "deactivated"
  }
}
```

**Subscription States:**
- `active` - User has access
- `overdue` - Payment failed but grace period, user has access
- `trial` - Free trial period, user has access
- `canceled` - Subscription canceled, no access
- `deactivated` - Subscription deactivated, no access

---

### 3. Polling Subscription Status

The app continuously checks subscription status every 30 seconds to detect when a purchase completes or when a subscription expires.

**Why polling is needed:**

When a user completes a purchase via the FastSpring checkout, there may be a delay before:
- FastSpring webhook notifies the backend
- Backend updates the subscription database
- Changes propagate to the API

Polling ensures the app detects subscription changes automatically without requiring the user to manually refresh or restart the app. This is especially important on iOS simulators where deep linking may not work reliably.

**How it works:**
```javascript
// Runs every 30 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const result = await checkSubscription(token, playerId);
    if (result.isActive) {
      // Show premium content
    } else {
      // Show subscription offer
    }
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, [token, playerId]);
```

**Polling pauses when:**
- Checkout modal is open
- Player is not logged in

---

### 4. Purchasing a Subscription

To purchase a subscription, the app requests a secure checkout URL from the backend, then opens it in Safari (iOS) or Chrome (Android).

**What happens:**
1. User taps "Buy Direct" button
2. App calls `/encode` endpoint with subscription ID
3. Backend generates secure payload signed with HMAC
4. Backend returns `securePayload` and `secureKey`
5. App builds FastSpring checkout URL
6. Opens URL in browser with deep link return URL

**API Call:**
```http
POST /encode
Headers: {
  "Content-Type": "application/json",
  "Authorization": "player-auth-token"
}
Body: { "subscription": "bronze-monthly" }
```

**Response:**
```json
{
  "success": true,
  "encode": {
    "securePayload": "base64-encoded-payload-with-hmac",
    "secureKey": "base64-encoded-security-key"
  }
}
```

**Generated Checkout URL:**
```
https://storefront.cloudfront.net
  ?product=bronze-monthly
  &securePayload=...
  &secureKey=...
  &returnUrl=fsreactapp://purchase-complete
```

**Security Note:** The app never generates secure payloads directly. All payload signing happens on the backend using FastSpring private keys.

---

### 5. Handling Purchase Completion

After completing a purchase, FastSpring redirects to the custom deep link scheme configured in the app.

**Deep Link Format:**
```
fsreactapp://purchase-complete
```

**What happens:**
1. User completes purchase in Safari/Chrome
2. FastSpring redirects to `fsreactapp://purchase-complete`
3. App receives deep link event
4. Safari/Chrome browser dismisses automatically
5. App checks subscription status via API
6. UI updates to show premium content
7. Success alert displayed to user

**iOS Configuration** (`ios/FSReactApp/Info.plist`):
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>fsreactapp</string>
    </array>
  </dict>
</array>
```

**Android Configuration** (`android/app/src/main/AndroidManifest.xml`):
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="fsreactapp"/>
</intent-filter>
```

---

## Testing

### Test Flow

1. Start app → Automatic login with device ID
2. See subscription offer page (no subscription initially)
3. Tap "Buy Direct" button
4. FastSpring checkout opens in Safari/Chrome
5. Complete test purchase
6. Browser redirects to `fsreactapp://purchase-complete`
7. App automatically detects subscription via deep link
8. Premium content page appears
9. Polling continues every 30 seconds

### Testing Subscription States

You can test different subscription states by modifying the subscription in FastSpring dashboard:
- Active subscription → Premium content shown
- Cancel subscription → Polling detects change within 30 seconds
- Subscription offer page reappears

---

## Building for Production

### Android APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### iOS

For iOS builds, you need:
1. Valid Apple Developer account
2. Provisioning profiles configured
3. Code signing certificates

Build in Xcode:
```bash
cd ios
open FSReactApp.xcworkspace
```

Then select your device/simulator and click Run (▶).

For distribution, archive the app in Xcode (Product → Archive) and follow Apple's App Store submission process.

---

## Security

**The app never stores or generates FastSpring private keys.** All security-sensitive operations happen on the backend:

- Payload signing with HMAC-SHA256
- FastSpring webhook handling
- Subscription verification

The app only:
- Requests signed payloads from backend
- Passes encoded data to FastSpring
- Displays content based on subscription state
