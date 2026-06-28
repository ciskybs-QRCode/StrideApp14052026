/**
 * pwa-patch.js — run after `expo export --platform web`
 *
 * Adds proper PWA support to the exported web-dist:
 *   1. Copies pre-sized icon assets into web-dist/
 *   2. Writes manifest.json with correct start_url, scope and icons
 *   3. Patches web-dist/index.html to add <link rel="manifest"> and
 *      Apple/Android PWA meta tags (idempotent — won't double-add)
 *   4. Patches JS bundles: replaces "/assets/ with "/app/assets/ in case
 *      experiments.baseUrl was not picked up (safety net for future builds)
 *
 * Icons are pre-generated in assets/images/ from favicon.png (original transparent logo)
 * using ImageMagick — white background, no rounded corners (device adds rounding):
 *   magick assets/images/favicon.png -background white -alpha remove -gravity center -resize 820x820 -extent 1024x1024 assets/images/icon.png
 *   magick assets/images/favicon.png -background white -alpha remove -gravity center -resize 410x410 -extent 512x512 assets/images/icon-512.png
 *   magick assets/images/favicon.png -background white -alpha remove -gravity center -resize 154x154 -extent 192x192 assets/images/icon-192.png
 *   magick assets/images/favicon.png -background white -alpha remove -gravity center -resize 144x144 -extent 180x180 assets/images/apple-touch-icon.png
 */

const fs   = require("fs");
const path = require("path");

const ROOT   = path.resolve(__dirname, "..");
const DIST   = path.join(ROOT, "web-dist");
const ASSETS = path.join(ROOT, "assets", "images");

// ── 1. Copy icon files into web-dist ─────────────────────────────────────────
const iconsToCopy = [
  { src: "icon-192.png",         dst: "icon-192.png" },
  { src: "icon-512.png",         dst: "icon-512.png" },
  { src: "apple-touch-icon.png", dst: "apple-touch-icon.png" },
];

for (const { src, dst } of iconsToCopy) {
  const srcPath = path.join(ASSETS, src);
  const dstPath = path.join(DIST, dst);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, dstPath);
    console.log(`[pwa-patch] Copied ${src} → web-dist/${dst}`);
  } else {
    console.warn(`[pwa-patch] WARNING: ${src} not found in assets/images/ — skipping`);
  }
}

// ── 2. Write manifest.json ────────────────────────────────────────────────────
const manifest = {
  name:             "Stride",
  short_name:       "Stride",
  description:      "Association management — QR attendance, smart pick-up, emergency alerts.",
  start_url:        "/app/",
  scope:            "/app/",
  display:          "standalone",
  orientation:      "portrait",
  background_color: "#1E3A8A",
  theme_color:      "#1E3A8A",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

fs.writeFileSync(
  path.join(DIST, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("[pwa-patch] Written manifest.json");

// ── 3. Patch index.html ───────────────────────────────────────────────────────
const indexPath = path.join(DIST, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("[pwa-patch] ERROR: web-dist/index.html not found");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");

// Always ensure correct /app/ prefixed URLs (re-apply even if already patched with wrong URL)
const needsInsert  = !html.includes('rel="manifest"');
const hasWrongUrls = html.includes('href="/manifest.json"') || html.includes('href="/apple-touch-icon.png"');

if (needsInsert) {
  const pwaHead = [
    "  <!-- PWA manifest -->",
    '  <link rel="manifest" href="/app/manifest.json" />',
    "  <!-- Apple / iOS PWA -->",
    '  <meta name="apple-mobile-web-app-capable" content="yes" />',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '  <meta name="apple-mobile-web-app-title" content="Stride" />',
    '  <link rel="apple-touch-icon" href="/app/apple-touch-icon.png" />',
    "  <!-- Android / Chrome PWA -->",
    '  <meta name="mobile-web-app-capable" content="yes" />',
    '  <meta name="application-name" content="Stride" />',
  ].join("\n");
  html = html.replace("</head>", `${pwaHead}\n</head>`);
  fs.writeFileSync(indexPath, html);
  console.log("[pwa-patch] Patched index.html with PWA meta tags");
} else if (hasWrongUrls) {
  // Fix wrong root-relative URLs → correct /app/-prefixed URLs
  html = html
    .replace(/href="\/manifest\.json"/g,        'href="/app/manifest.json"')
    .replace(/href="\/apple-touch-icon\.png"/g, 'href="/app/apple-touch-icon.png"');
  fs.writeFileSync(indexPath, html);
  console.log("[pwa-patch] Fixed wrong manifest/icon URLs in index.html");
} else {
  console.log("[pwa-patch] index.html already correct — skipping patch");
}

// ── 4. Patch JS bundles: fix asset base path ──────────────────────────────────
// expo export without experiments.baseUrl produces "/assets/..." paths.
// These are routed to the landing-page server (path "/"), not the Stride app
// (path "/app/"). Prefix them with "/app" so they resolve correctly.
const bundleDir = path.join(DIST, "_expo", "static", "js", "web");
if (fs.existsSync(bundleDir)) {
  const bundles = fs.readdirSync(bundleDir).filter(f => f.endsWith(".js"));
  for (const bundle of bundles) {
    const bundlePath = path.join(bundleDir, bundle);
    const src = fs.readFileSync(bundlePath, "utf8");
    if (src.includes('"/assets/')) {
      const patched = src.replaceAll('"/assets/', '"/app/assets/');
      const count   = (src.match(/\"\/assets\//g) || []).length;
      fs.writeFileSync(bundlePath, patched);
      console.log(`[pwa-patch] Patched ${bundle}: fixed ${count} asset path(s)`);
    } else {
      console.log(`[pwa-patch] ${bundle}: asset paths already correct`);
    }
  }
} else {
  console.warn("[pwa-patch] WARNING: no bundle dir found — skipping asset path patch");
}

// ── 5. Generate version.json ──────────────────────────────────────────────────
// Extract hash from the main entry bundle filename (content-hashed by Metro).
// This hash changes with every build, giving clients a reliable version signal.
const bundlesForVersion = fs.existsSync(bundleDir)
  ? fs.readdirSync(bundleDir).filter(f => f.startsWith("entry-") && f.endsWith(".js"))
  : [];

const buildHash = bundlesForVersion.length > 0
  ? bundlesForVersion[0].replace("entry-", "").replace(".js", "")
  : String(Date.now());

const versionJson = JSON.stringify({ v: buildHash, ts: Date.now() }, null, 2);
fs.writeFileSync(path.join(DIST, "version.json"), versionJson);
console.log(`[pwa-patch] Written version.json (v=${buildHash.slice(0, 8)}…)`);

// ── 6. Write sw.js (Service Worker) ──────────────────────────────────────────
const swContent = `// Stride Service Worker — auto-generated by pwa-patch.js
var CACHE_NAME = 'stride-pwa-${buildHash.slice(0, 8)}';

// Activate immediately — do not wait for existing tabs to close
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  // Purge ALL old caches and claim clients immediately
  event.waitUntil(
    caches.keys()
      .then(function(keys) { return Promise.all(keys.map(function(k) { return caches.delete(k); })); })
      .then(function() { return self.clients.claim(); })
  );
});

// No fetch interception — the browser handles all requests normally.
// Auto-update is handled by version.json polling in index.html.
`;

fs.writeFileSync(path.join(DIST, "sw.js"), swContent);
console.log("[pwa-patch] Written sw.js");

// ── 7. Inject version-poll + SW registration into index.html ─────────────────
const autoUpdateScript = `
  <!-- Stride auto-update: SW controllerchange + version.json polling -->
  <script>
  (function(){
    var INTERVAL = 30 * 1000;
    // The version baked into THIS build — any mismatch means a newer build is live
    var knownVersion = '${buildHash}';
    var swReg = null;
    var reloading = false;

    function doReload(){
      if(reloading) return;
      reloading = true;
      // Force past any SW cache
      if('serviceWorker' in navigator && navigator.serviceWorker.controller){
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload(true);
    }

    function check(){
      fetch('/app/version.json?_=' + Date.now(), { cache: 'no-store' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d.v && d.v !== knownVersion){
            // Server has a different (newer) build — update SW then hard-reload
            if(swReg){
              swReg.update().then(doReload).catch(doReload);
            } else {
              doReload();
            }
          }
        }).catch(function(){});
    }

    // Check immediately on load, then every INTERVAL
    window.addEventListener('load', function(){ check(); setInterval(check, INTERVAL); });

    // Also check every time the user brings the PWA to the foreground
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) check();
    });

    // Register service worker — listen for controllerchange so we reload
    // the moment a newly-deployed SW takes over (even without version.json noticing)
    if('serviceWorker' in navigator){
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })
          .then(function(reg){
            swReg = reg;
            // controllerchange fires when a new SW activates and claims this client
            navigator.serviceWorker.addEventListener('controllerchange', doReload);
          })
          .catch(function(){});
      });
    }
  })();
  </script>`;

let htmlContent = fs.readFileSync(indexPath, "utf8");
// Always strip any existing auto-update block, then re-inject the latest version
htmlContent = htmlContent.replace(/\n?\s*<!-- Stride auto-update[\s\S]*?<\/script>/m, "");
htmlContent = htmlContent.replace("</body>", `${autoUpdateScript}\n</body>`);
fs.writeFileSync(indexPath, htmlContent);
console.log("[pwa-patch] Injected auto-update + SW registration into index.html");

console.log("[pwa-patch] Done ✓");
