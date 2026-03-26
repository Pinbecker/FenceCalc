import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { Readable } from "node:stream";
import selfsigned from "selfsigned";

const httpsPort = Number.parseInt(process.env.PROXY_HTTPS_PORT ?? "8443", 10);
const httpPortRaw = process.env.PROXY_HTTP_PORT?.trim() ?? "8080";
const httpPort = httpPortRaw.length > 0 ? Number.parseInt(httpPortRaw, 10) : null;
const hostname = process.env.PROXY_HOSTNAME?.trim() || "localhost";
const apiUpstream = new URL(process.env.API_UPSTREAM ?? "http://127.0.0.1:3001");
const webUpstream = new URL(process.env.WEB_UPSTREAM ?? "http://127.0.0.1:4173");

function getUpstream(pathname) {
  if (pathname === "/health" || pathname.startsWith("/api/")) {
    return apiUpstream;
  }

  return webUpstream;
}

function buildForwardHeaders(request) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.toLowerCase() === "host" || name.toLowerCase() === "content-length") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    headers.set(name, value);
  }

  headers.set("x-forwarded-host", request.headers.host ?? `${hostname}:${httpsPort}`);
  headers.set("x-forwarded-proto", "https");

  return headers;
}

async function forwardRequest(request, response) {
  const requestUrl = new URL(request.url ?? "/", `https://${hostname}:${httpsPort}`);
  const upstream = getUpstream(requestUrl.pathname);
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstream);
  const requestBody = request.method === "GET" || request.method === "HEAD" ? undefined : request;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildForwardHeaders(request),
      body: requestBody,
      duplex: requestBody ? "half" : undefined
    });

    const responseHeaders = {};
    upstreamResponse.headers.forEach((value, name) => {
      if (name.toLowerCase() === "content-length") {
        return;
      }
      responseHeaders[name] = value;
    });

    if (typeof upstreamResponse.headers.getSetCookie === "function") {
      const setCookies = upstreamResponse.headers.getSetCookie();
      if (setCookies.length > 0) {
        responseHeaders["set-cookie"] = setCookies;
      }
    }

    response.writeHead(upstreamResponse.status, responseHeaders);

    if (!upstreamResponse.body) {
      response.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(response);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Reverse proxy upstream failure", detail: String(error) }));
  }
}

const certificate = await selfsigned.generate(
  [{ name: "commonName", value: hostname }],
  {
    algorithm: "sha256",
    days: 30,
    keySize: 2048,
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: hostname },
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" }
        ]
      }
    ]
  }
);

const httpsServer = createHttpsServer(
  {
    key: certificate.private,
    cert: certificate.cert
  },
  (request, response) => {
    void forwardRequest(request, response);
  }
);

httpsServer.listen(httpsPort, () => {
  console.log(`HTTPS reverse proxy listening on https://${hostname}:${httpsPort}`);
});

if (httpPort !== null && Number.isFinite(httpPort)) {
  const httpServer = createHttpServer((request, response) => {
    const target = new URL(request.url ?? "/", `http://${hostname}:${httpPort}`);
    response.writeHead(308, {
      location: `https://${hostname}:${httpsPort}${target.pathname}${target.search}`
    });
    response.end();
  });

  httpServer.listen(httpPort, () => {
    console.log(`HTTP redirect listening on http://${hostname}:${httpPort}`);
  });
}