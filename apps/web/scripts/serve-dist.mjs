import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "4173");
const distDir = resolve("apps/web/dist");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const securityHeaders = {
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: http: ws: wss:",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    ...securityHeaders,
    "content-type": contentTypes[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const rawUrl = request.url ?? "/";
  const path = rawUrl.split("?")[0] ?? "/";
  const normalizedPath = normalize(path).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const candidate = join(distDir, normalizedPath === "" ? "index.html" : normalizedPath);

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(response, candidate);
    return;
  }

  const fallback = join(distDir, "index.html");
  if (!existsSync(fallback)) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("dist/index.html is missing; run the web build before starting the static server");
    return;
  }

  sendFile(response, fallback);
}).listen(port, host, () => {
  process.stdout.write(`Static web server listening on http://${host}:${port}\n`);
});
