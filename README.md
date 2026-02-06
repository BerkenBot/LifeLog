# Daily Check-In App

A personal wellness tracking app for iOS with HealthKit integration.

## Prerequisites

- **Mac** with Xcode 15+ installed
- **Node.js** 18+ 
- **Apple Developer Account** ($99/year) - for device testing
- **iPhone** for testing (HealthKit doesn't work in simulator)

## Quick Start

### 1. Install Dependencies

```bash
cd daily-checkin-app
npm install
```

### 2. Install Expo CLI & EAS CLI

```bash
npm install -g expo-cli eas-cli
```

### 3. Login to Expo & EAS

```bash
npx expo login
eas login
```

### 4. Configure EAS Project

```bash
eas build:configure
```

This creates your project on Expo's servers and updates `app.json` with your project ID.

### 5. Update Bundle Identifier

In `app.json`, change the bundle identifier to something unique:

```json
"ios": {
  "bundleIdentifier": "com.YOURNAME.dailycheckin"
}
```

## Running on Device

### Option A: Development Build (Recommended for Development)

This creates a debug build you can iterate on quickly.

```bash
# Build for your physical device
eas build --profile development --platform ios

# Once built, download and install via QR code or link
# Then start the dev server:
npx expo start --dev-client
```

### Option B: Direct Run via Xcode

```bash
# Generate native project files
npx expo prebuild

# Open in Xcode
open ios/dailycheckin.xcworkspace
```

Then in Xcode:
1. Select your Team in Signing & Capabilities
2. Select your connected iPhone as the target
3. Press ▶️ to build and run

### Option C: Run Directly (requires Xcode CLI tools)

```bash
# Plug in your iPhone, then:
npx expo run:ios --device
```

## HealthKit Setup

HealthKit permissions are already configured in `app.json`. The app requests read access to:

- Step Count
- Sleep Analysis  
- Heart Rate
- Active Energy Burned

When running the app for the first time, iOS will prompt for HealthKit permissions.

**Note:** HealthKit only works on physical devices, not the simulator.

## Project Structure

```
daily-checkin-app/
├── App.js                    # Main app component
├── app.json                  # Expo config (HealthKit permissions here)
├── eas.json                  # EAS Build profiles
├── package.json
├── src/
│   ├── utils/
│   │   ├── constants.js      # Moods, metrics, colors
│   │   └── storage.js        # AsyncStorage wrapper
│   └── hooks/
│       └── useHealthKit.js   # HealthKit data fetching
└── assets/
    ├── icon.png              # App icon (1024x1024)
    └── splash.png            # Splash screen
```

## Building for TestFlight

```bash
# Create a production build
eas build --profile production --platform ios

# Submit to App Store Connect
eas submit --platform ios
```

Then in App Store Connect, add the build to TestFlight for testing.

## Customization

### Add/Remove Tracked Metrics

Edit `src/utils/constants.js`:

```javascript
export const METRICS = [
  { key: 'stress', label: 'Stress', icon: '😰', color: '#FF3B30', low: 'Calm', high: 'Stressed' },
  // Add more metrics here...
];
```

### Change Quick Check-In Fields

```javascript
export const QUICK_METRICS = ['energy', 'stress'];
```

### Modify Colors

```javascript
export const COLORS = {
  background: '#F2F2F7',
  blue: '#007AFF',
  // ...
};
```

## Troubleshooting

### "No bundle identifier"
Make sure `app.json` has a unique `bundleIdentifier` under `expo.ios`.

### HealthKit not showing data
- HealthKit only works on real devices
- Check Settings > Health > Data Access to verify permissions
- Some data types need Apple Watch (detailed heart rate, etc.)

### Build fails with signing error
- Open the generated Xcode project: `open ios/*.xcworkspace`
- Go to Signing & Capabilities
- Select your Apple Developer Team
- Let Xcode manage signing automatically

### "Untrusted Developer" on device
Go to Settings > General > VPN & Device Management > Trust your developer certificate

## Next Steps

- [ ] Add app icon (1024x1024 PNG) to `assets/icon.png`
- [ ] Add splash screen to `assets/splash.png`  
- [ ] Configure push notifications for check-in reminders
- [ ] Add iCloud backup for data sync across devices
- [ ] Add widget for quick logging from home screen
