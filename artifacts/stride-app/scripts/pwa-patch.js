/**
 * pwa-patch.js — run after `expo export --platform web`
 *
 * Adds proper PWA support to the exported web-dist:
 *   1. Copies pre-sized icon assets into web-dist/
 *   2. Writes manifest.json with correct start_url, scope and icons
 *   3. Patches web-dist/index.html to add <link rel="manifest"> and
 *      Apple/Android PWA meta tags (idempotent — won't double-add)
 *
 * Icons are pre-generated in assets/images/ from the original icon.png
 * using ImageMagick:
 *   magick assets/images/icon.png -resize 512x512 assets/images/icon-512.png
 *   magick assets/images/icon.png -resize 192x192 assets/images/icon-192.png
 *   magick assets/images/icon.png -resize 180x180 -background white -alpha remove assets/images/apple-touch-icon.png
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

if (!html.includes('rel="manifest"')) {
  const pwaHead = [
    "  <!-- PWA manifest -->",
    '  <link rel="manifest" href="/manifest.json" />',
    "  <!-- Apple / iOS PWA -->",
    '  <meta name="apple-mobile-web-app-capable" content="yes" />',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '  <meta name="apple-mobile-web-app-title" content="Stride" />',
    '  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    "  <!-- Android / Chrome PWA -->",
    '  <meta name="mobile-web-app-capable" content="yes" />',
    '  <meta name="application-name" content="Stride" />',
  ].join("\n");

  html = html.replace("</head>", `${pwaHead}\n</head>`);
  fs.writeFileSync(indexPath, html);
  console.log("[pwa-patch] Patched index.html with PWA meta tags");
} else {
  console.log("[pwa-patch] index.html already has manifest link — skipping patch");
}

console.log("[pwa-patch] Done ✓");
