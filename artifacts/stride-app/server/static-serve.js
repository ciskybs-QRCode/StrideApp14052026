/**
 * Static file server for the pre-built Expo web export.
 *
 * Serves files from web-dist/ with /app/ base path handling:
 * - Strips /app/ prefix from incoming URLs
 * - Falls back to index.html (SPA routing) for unknown paths
 * - Patches index.html to add /app/ prefix to absolute asset URLs
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "web-dist");
const PORT = parseInt(process.env.PORT || "3000", 10);
const BASE = "/app";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".map": "application/json",
};

// Read and patch index.html once at startup
function buildIndexHtml() {
  const raw = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  // Rewrite absolute src/href that start with / but not already /app/
  return raw
    .replace(/((?:src|href)=")\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`)
    .replace(/((?:src|href)=')\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`);
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
    // Serve the actual file
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Length": content.length,
    });
    res.end(content);
  } else {
    // SPA fallback: serve patched index.html
    const buf = Buffer.from(indexHtml, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
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
