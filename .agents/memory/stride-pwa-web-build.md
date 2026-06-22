---
name: Stride PWA web build asset path bug
description: expo export without experiments.baseUrl generates /assets/... paths instead of /app/assets/... — those requests hit the landing-page server, not the Stride app, breaking ALL icons inside the app.
---

## The bug

`expo export --platform web` (or `build:web`) produces JS bundles where font/image asset URLs are:

```
"/assets/__node_modules/.pnpm/@expo+vector-icons@..."
```

Because the Stride app is served at path `/app/`, requests to `/assets/...` are routed by the Replit proxy to the **landing page server**, not the Stride app's static-serve.js. Result: every icon in the app shows a broken X rectangle.

## Root cause

`web.publicPath: "/app/"` in app.json is NOT sufficient for Metro/Expo Router SDK 54.  
The correct config is `experiments.baseUrl: "/app"` (without trailing slash).

## Permanent fix

`app.json` must have:
```json
"experiments": {
  "baseUrl": "/app"
}
```

## Safety net

`scripts/pwa-patch.js` (step 4) patches all JS bundles in `web-dist/_expo/static/js/web/` after every `expo export`:

```javascript
src.replaceAll('"/assets/', '"/app/assets/')
```

This catches any future case where `experiments.baseUrl` doesn't take effect.

**Why:** The build:web script already runs pwa-patch.js as a post-build step via `&& node scripts/pwa-patch.js`.

## How to apply

Never run `expo export` from a shell without the experiments.baseUrl set. Always run via:
```
pnpm --filter @workspace/stride-app run build:web
```
which chains pwa-patch.js automatically.

## PWA home screen icon update

Browsers **never** update the home screen icon of an already-installed PWA automatically. The user must:
1. Remove the old app from the home screen
2. Open Chrome → navigate to the app URL
3. Re-install via "Add to Home Screen"
