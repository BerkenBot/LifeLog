---
description: Build and deploy LifeLog app to physical iOS device (Release mode, no server needed)
---

# Build to Device (Release)

// turbo-all

1. Connect your iPhone via USB and trust the computer if prompted

2. Build and install the Release version:
```bash
cd /Users/justinberken/XCODE_PROJECTS/LifeLog && npx expo run:ios --device --configuration Release
```

3. If prompted to select a device, choose your iPhone from the list

4. Wait for the build to complete (~2-5 minutes first time)

5. The app will launch on your phone — no server connection needed!

---

## Notes
- Release builds bundle all JavaScript into the app
- Works completely offline
- This is how the App Store version will work
