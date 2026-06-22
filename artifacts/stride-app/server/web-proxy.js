/**
 * Thin reverse proxy between Replit's routing proxy and the Expo web dev server.
 *
 * Problem: Expo serves HTML with absolute script/link URLs like:
 *   <script src="/node_modules/.pnpm/.../entry.bundle?platform=web">
 *
 * Chrome sees this page at https://stride-ops.com/app/ and fetches:
 *   https://stride-ops.com/node_modules/.pnpm/.../entry.bundle
 *   → routed to the landing page (wrong service) → 404 → blank white screen
 *
 * Fix: Strip the /app/ prefix from incoming requests before forwarding to
 * Expo, and rewrite absolute src/href in HTML responses to add /app/ prefix
 * so Chrome requests land at /app/... and are correctly routed to this service.
 */

const http = require("http");

const PROXY_PORT = parseInt(process.env.PORT || "3000", 10);
const EXPO_PORT = parseInt(process.env.EXPO_INTERNAL_PORT || "9090", 10);
const BASE = "/app";

let expoReady = false;

async function waitForExpo(maxWaitMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: "localhost", port: EXPO_PORT, path: "/", method: "GET" },
          (res) => resolve(res.statusCode),
        );
        req.setTimeout(3000, () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.end();
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

function rewriteHtml(html) {
  return html
    .replace(/((?:src|href|action)=")\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`)
    .replace(/((?:src|href|action)=')\/(?!app\/|\/|#|data:)/g, `$1${BASE}/`)
    .replace(
      /url\(["']?\/(?!app\/|\/|#|data:)/g,
      `url("${BASE}/`,
    );
}

const LOADING_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stride — Loading</title>
<style>
  body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh;
    background:#1E3A8A; font-family:-apple-system,sans-serif; }
  .box { text-align:center; color:#fff; }
  .spinner { width:40px; height:40px; border:3px solid rgba(251,191,36,.3);
    border-top-color:#FBBF24; border-radius:50%; animation:spin .8s linear infinite; margin:0 auto 16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  p { margin:0; font-size:15px; opacity:.8; }
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <p>Starting Stride…</p>
</div>
<script>setTimeout(()=>location.reload(),3000)</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (!expoReady) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(LOADING_HTML);
    return;
  }

  let proxyPath = req.url || "/";
  if (proxyPath === BASE || proxyPath.startsWith(BASE + "/")) {
    proxyPath = proxyPath.slice(BASE.length) || "/";
  }

  // Strip origin/referer so Expo's CORS middleware doesn't reject the request.
  // Expo only whitelists localhost; the Replit proxy domain would be blocked.
  const fwdHeaders = { ...req.headers };
  fwdHeaders.host   = `localhost:${EXPO_PORT}`;
  delete fwdHeaders.origin;
  delete fwdHeaders.referer;

  const options = {
    hostname: "localhost",
    port: EXPO_PORT,
    path: proxyPath,
    method: req.method,
    headers: fwdHeaders,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "";
    const isHtml = contentType.includes("text/html");

    if (!isHtml) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }

    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const html = Buffer.concat(chunks).toString("utf8");
      const rewritten = rewriteHtml(html);
      const outHeaders = { ...proxyRes.headers };
      delete outHeaders["content-encoding"];
      outHeaders["content-length"] = Buffer.byteLength(rewritten, "utf8");
      outHeaders["content-type"] = "text/html; charset=utf-8";
      res.writeHead(proxyRes.statusCode, outHeaders);
      res.end(rewritten);
    });
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway: " + err.message);
    }
  });

  proxyReq.setTimeout(60_000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504);
      res.end("Gateway Timeout");
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(
    `[web-proxy] Listening on port ${PROXY_PORT}, waiting for Expo on ${EXPO_PORT}…`,
  );
  waitForExpo().then((ok) => {
    if (ok) {
      expoReady = true;
      console.log(`[web-proxy] Expo ready — proxy active`);
    } else {
      console.error("[web-proxy] Expo never became ready");
    }
  });
});
