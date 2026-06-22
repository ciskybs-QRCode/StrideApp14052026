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

console.log("[pwa-patch] Done ✓");
