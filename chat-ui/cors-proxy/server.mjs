#!/usr/bin/env node
// CORS proxy backend for the Foundry Local chat quickstart.
//
// Listens on http://localhost:${PORT} (default 5001) and forwards every
// request to ${UPSTREAM} (default http://localhost:5000). CORS preflight
// (OPTIONS) requests are answered locally with permissive Access-Control-*
// headers; everything else — method, URL path, headers (including the
// caller's Authorization), body, response status, response body — is
// streamed through verbatim. Streaming responses (Server-Sent Events from
// /v1/chat/completions when stream=true) are forwarded chunk-by-chunk.
//
// This proxy stands in for the backend any production deployment of the
// chat UI would have between the browser and Foundry Local. The
// quickstart cuts that backend out for demo speed; this script restores
// it at the smallest possible scope so the browser's CORS preflight
// can succeed without changing how Foundry Local authenticates the
// real /v1/chat/completions call.

import http from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "5001", 10);
const UPSTREAM = process.env.UPSTREAM ?? "http://localhost:5000";

const upstreamUrl = new URL(UPSTREAM);
if (upstreamUrl.protocol !== "http:") {
  console.error(
    `[cors-proxy] Only http:// upstream is supported in the quickstart ` +
      `(got "${upstreamUrl.protocol}"). The Step 7 port-forward targets the ` +
      `Deployment directly on plain HTTP — see README §troubleshooting.`,
  );
  process.exit(2);
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-max-age": "600",
  "access-control-expose-headers": "x-request-id",
};

// Echo whatever headers the browser asks for in the preflight. The chat UI
// sends the API key in both Authorization and api-key headers per its
// upstream .env.example, and we'd rather not enumerate every combination
// any client might use.
const DEFAULT_ALLOW_HEADERS =
  "authorization, content-type, accept, api-key, x-request-id";

function applyCorsHeaders(res, req) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  const requested = req?.headers?.["access-control-request-headers"];
  res.setHeader("access-control-allow-headers", requested || DEFAULT_ALLOW_HEADERS);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    applyCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  delete forwardHeaders["content-length"];

  const upstreamReq = http.request(
    {
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || 80,
      method: req.method,
      path: req.url,
      headers: forwardHeaders,
    },
    (upstreamRes) => {
      applyCorsHeaders(res, req);
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        if (k.toLowerCase().startsWith("access-control-")) continue;
        res.setHeader(k, v);
      }
      res.writeHead(upstreamRes.statusCode ?? 502);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on("error", (err) => {
    console.error(`[cors-proxy] upstream error: ${err.message}`);
    applyCorsHeaders(res, req);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: {
          message: `cors-proxy: upstream ${UPSTREAM} unreachable (${err.code ?? err.message}). Is kubectl port-forward still running on its target port?`,
          type: "proxy_error",
        },
      }),
    );
  });

  req.pipe(upstreamReq);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[cors-proxy] listening on http://localhost:${PORT} -> ${UPSTREAM}`,
  );
  console.log(
    `[cors-proxy] set VITE_API_URL=http://localhost:${PORT}/v1 in the chat UI's .env`,
  );
  console.log(`[cors-proxy] press Ctrl+C to stop`);
});

const shutdown = (sig) => {
  console.log(`[cors-proxy] ${sig} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
