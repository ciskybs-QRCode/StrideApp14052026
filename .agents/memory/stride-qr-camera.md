---
name: Stride QR camera
description: expo-camera setup, version quirks, and Platform.OS web fix
---

## expo-camera version mismatch

Installed `expo-camera@55.0.14`; Expo SDK 54 expects `~17.0.10`. This generates a warning but the app still functions. Do NOT try to downgrade without testing — it may break barcode scanning or CameraView API.

## Platform.OS === "web" fix (done)

Both `app/(operator)/dashboard.tsx` and `app/(kiosk)/index.tsx` previously showed simulate-only UI on web by checking `Platform.OS === "web"` before rendering `CameraView`. Fixed to gate on `permission?.granted` instead — so the real camera opens on all platforms when permission is granted, and a "Enable Camera" / "Grant Permission" button is shown otherwise.

**Why:** `expo-camera` supports web via the browser's `getUserMedia` API. The original check was added as a quick workaround and blocked real camera use in the canvas preview.

## app.json plugin

`expo-camera` plugin added to `app.json` with `cameraPermission` string and `microphonePermission: false`. Required for native (iOS/Android) builds to declare `NSCameraUsageDescription` / `android.permission.CAMERA`.

## React Compiler

DISABLED (`"reactCompiler": false` in app.json). Do NOT re-enable — causes runtime issues.
