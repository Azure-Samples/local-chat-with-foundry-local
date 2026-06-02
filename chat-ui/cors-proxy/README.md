# CORS proxy backend for the chat quickstart

A tiny Node script that lets the chat UI (running in your browser on
`http://localhost:5173`) talk to Foundry Local through your `kubectl
port-forward` without hitting a browser CORS preflight failure.

This proxy is **part of the quickstart, not part of a production setup.**
The quickstart's pitch is "no backend, browser → model directly, chat in
15 minutes." That intentionally cuts out the backend that any
real-world deployment of a chat UI would have between the browser and
the model. This script restores that backend at the smallest possible
scope — a single file, no dependencies — so the browser's CORS preflight
can succeed. In a real deployment you would replace it with your own
server (handling authentication, rate limiting, audit logging, and the
many other concerns a production backend takes on).

## What it does

- Listens on `http://localhost:5001`.
- Answers `OPTIONS` (CORS preflight) requests itself with `204` +
  `Access-Control-Allow-*` headers, so the browser is satisfied.
- Forwards every other request — method, path, headers (including your
  `Authorization: Bearer <key>`), body — to `http://localhost:5000`
  (where `kubectl port-forward` exposes the model server). Responses
  are streamed back chunk by chunk, so streamed chat completions work.

The auth contract on the real `POST /v1/chat/completions` is unchanged:
Foundry Local still requires the per-deployment API key, and your
`.env`'s `VITE_COMPLETIONS_API_KEY` is what supplies it.

## Run it

Open a **new terminal** (the third one — terminal 1 runs `npm run dev`,
terminal 2 runs `kubectl port-forward`) and from the root of this repo:

```bash
node chat-ui/cors-proxy/server.mjs
```

Expected output:

```text
[cors-proxy] listening on http://localhost:5001 -> http://localhost:5000
[cors-proxy] set VITE_API_URL=http://localhost:5001/v1 in the chat UI's .env
[cors-proxy] press Ctrl+C to stop
```

Leave it running for the rest of the session. `Ctrl+C` to stop.

## Configure it (optional)

Two environment variables override the defaults:

| Variable | Default | When to change it |
|---|---|---|
| `PORT` | `5001` | Something else on your machine is already using `5001`. |
| `UPSTREAM` | `http://localhost:5000` | Your `kubectl port-forward` is running on a different local port (e.g. macOS AirPlay holds port `5000`; use `kubectl port-forward ... 5050:5000` and run the proxy with `UPSTREAM=http://localhost:5050`). |

Example:

```bash
UPSTREAM=http://localhost:5050 node chat-ui/cors-proxy/server.mjs
```

## Requirements

Node.js 18 LTS or newer. No `npm install` step — the script uses only
Node's built-in `node:http` module.
