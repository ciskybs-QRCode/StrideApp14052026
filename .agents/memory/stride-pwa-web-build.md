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

**Every time code changes are made to the Stride App, run this before deploying:**
```
pnpm --filter @workspace/stride-app run build:web
```
This chains pwa-patch.js automatically. The new bundle files in `web-dist/_expo/static/js/web/` will have new hashes (different filenames). Both old and new filenames must be committed — the expo export `--clear` flag removes old ones automatically.

**Deploy pipeline for PWA changes:**
1. Make code changes
2. Run `pnpm --filter @workspace/stride-app run build:web` (takes ~3-4 min)
3. Commit (Replit auto-commits at end of session — new bundle files are untracked until then)
4. Click Deploy button

**Important:** artifact.toml `build` command runs `scripts/build.js` (Metro native build for iOS/Android), NOT `build:web`. The PWA web bundle must be pre-built and committed separately. The production `serve` script (`static-serve.js`) just serves whatever is in `web-dist/`.

**Bash timeout note:** `build:web` takes ~3-4 minutes. The bash tool timeout max is 120s. Run with `| head -N` will SIGPIPE-kill the build early. Run without pipe but accept that the command may appear to "fail" — check `web-dist/` afterwards to confirm new bundle hashes appeared.

## PWA home screen icon update

Browsers **never** update the home screen icon of an already-installed PWA automatically. The user must:
1. Remove the old app from the home screen
2. Open Chrome → navigate to the app URL
3. Re-install via "Add to Home Screen"
