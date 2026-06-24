/**
 * Static file server for the pre-built Expo web export.
 *
 * Serves files from web-dist/ with /app/ base path handling:
 * - Strips /app/ prefix from incoming URLs
 * - Falls back to index.html (SPA routing) for unknown paths
 * - Patches index.html to add /app/ prefix to absolute asset URLs
 * - Injects PWA deep-link recovery script so stale saved URLs auto-redirect
 *   to /app/ before Expo Router initialises (no bundle rebuild needed)
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "web-dist");
const PORT = parseInt(process.env.PORT || "3000", 10);
const BASE = "/app";

const MIME = {
  ".html":  "text/html; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".otf":   "font/otf",
  ".webp":  "image/webp",
  ".gif":   "image/gif",
  ".map":   "application/json",
};

/**
 * Tiny inline script injected into every index.html response.
 *
 * Runs synchronously before the React bundle so Expo Router never sees
 * a stale deep-link URL.  replaceState keeps the session history clean
 * (no extra back-button entry).
 *
 * Logic:
 *   - If path is exactly /app or /app/ → do nothing (correct root)
 *   - Otherwise → snap back to /app/ so the app always boots at login
 */
const PWA_REDIRECT_SCRIPT = `<script>
(function(){
  var base = '${BASE}';
  var p = location.pathname;
  if (p !== base && p !== base + '/') {
    history.replaceState(null, '', base + '/');
  }
})();
</script>`;

// Read and patch index.html once at startup
function buildIndexHtml() {
  const raw = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

  // 1. Rewrite absolute src/href that start with / but not already /app/
  let patched = raw
    .replace(/((?:src|href)=")\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`)
    .replace(/((?:src|href)=')\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`);

  // 2. Inject deep-link recovery script right before </head>
  patched = patched.replace("</head>", `${PWA_REDIRECT_SCRIPT}\n</head>`);

  return patched;
}

let indexHtml;
try {
  indexHtml = buildIndexHtml();
  console.log(`[static-serve] Built index.html from ${DIST}`);
} catch (e) {
  console.error("[static-serve] ERROR: web-dist/index.html not found. Run 'pnpm run build:web' first.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath = new URL(req.url || "/", `http://localhost`).pathname;

  // Strip base path prefix
  if (urlPath === BASE || urlPath.startsWith(BASE + "/")) {
    urlPath = urlPath.slice(BASE.length) || "/";
  }

  // Security: prevent path traversal
  const filePath = path.join(DIST, path.normalize(urlPath));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Check if file exists and is not a directory
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }

  if (stat && !stat.isDirectory()) {
    // Serve the actual static file
    const ext      = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    const content  = fs.readFileSync(filePath);

    // manifest.json and PWA icons must revalidate so browsers pick up updates.
    // JS/CSS bundles are content-hashed → safe to cache forever.
    let cacheControl;
    if (ext === ".html") {
      cacheControl = "no-cache";
    } else if (
      basename === "manifest.json" ||
      basename === "version.json" ||
      basename === "sw.js" ||
      basename.startsWith("icon-") ||
      basename === "apple-touch-icon.png"
    ) {
      cacheControl = "no-cache, no-store, must-revalidate";
    } else {
      cacheControl = "public, max-age=31536000, immutable";
    }

    res.writeHead(200, {
      "Content-Type":  mime,
      "Cache-Control": cacheControl,
      "Content-Length": content.length,
    });
    res.end(content);
  } else {
    // SPA fallback: serve patched index.html (includes deep-link recovery script)
    const buf = Buffer.from(indexHtml, "utf8");
    res.writeHead(200, {
      "Content-Type":  "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Content-Length": buf.length,
    });
    res.end(buf);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[static-serve] Stride web app ready on port ${PORT}`);
  console.log(`[static-serve] Serving from ${DIST} at base path ${BASE}`);
});
