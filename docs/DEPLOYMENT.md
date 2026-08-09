# Deployment Guide — Reveal

Reveal is **two processes behind one origin**:

1. The **Next.js app** (`src/`) — pages, Redux, Socket.io client.
2. The **realtime server** (`server/index.mjs` + `server/room.mjs`) — an
   in-memory Socket.io server that owns all room state.

Both must run in production, and the browser must be able to reach the
realtime server over WebSocket.

---

## 1. Environment variables

| Variable                | Used by            | Default                   | Required in prod |
| ----------------------- | ------------------ | ------------------------- | ---------------- |
| `SOCKET_PORT`           | realtime server    | `3001`                    | if not default   |
| `SOCKET_ORIGIN`         | realtime server    | `http://localhost:3000`   | ✅ set to app origin(s) |
| `NEXT_PUBLIC_SOCKET_URL`| browser client     | `http://localhost:3001`   | ✅ set to the realtime server's public URL |
| `NEXT_DIST_DIR`         | Next build         | `.next`                   | only for e2e isolation |

- `SOCKET_ORIGIN` accepts a comma-separated list of origins allowed to open a
  WebSocket connection. In production it must be the origin(s) the app is
  served from (e.g. `https://poker.example.com`), **not** `localhost`.
- `NEXT_PUBLIC_SOCKET_URL` is baked into the client bundle at build time. It
  must be the URL a *browser* can reach — on a proxy that terminates TLS, use
  the public `https://wss.example.com` style URL (see WebSocket support
  below), not an internal hostname.

Copy `.env.example` → `.env.local` and fill in real values. Never commit real
values; keep `.env.local` out of version control (it is gitignored).

---

## 2. Build & start

```bash
npm ci                      # install exact locked dependencies
npm run build               # lints + typechecks + builds into .next
```

Then run both processes:

```bash
npm start                   # Next.js production server (defaults to :3000)
npm run rt                  # realtime server (defaults to :3001)
```

Example with explicit ports:

```bash
SOCKET_PORT=4000 NEXT_PUBLIC_SOCKET_URL=https://rt.poker.example.com npm run build
SOCKET_PORT=4000 SOCKET_ORIGIN=https://poker.example.com node server/index.mjs
```

---

## 3. Socket.io / WebSocket requirements

- The realtime server uses Socket.io **WebSocket transport** (engine.io).
  Anything sitting in front of it — reverse proxy, load balancer, CDN —
  must **forward WebSocket upgrades** (`Upgrade: websocket`) and keep
  connections open for long-lived sockets. Nginx requires
  `proxy_http_version 1.1;` and `proxy_set_header Upgrade $http_upgrade;` /
  `proxy_set_header Connection "upgrade";`.
- Socket.io also falls back to long-polling by default; keep the polling
  path proxied too if you do not disable it.
- If the realtime server and Next.js are on the same origin, the client can
  connect with a relative URL and the proxy must route `/socket.io/*`
  (engine.io path) to the realtime server.

---

## 4. In-memory room state — hard constraints

Room state lives **only in the memory of the realtime server process**:

- There is **no database, no Redis, no disk writes**. A server restart loses
  every room instantly — this is a product decision, not a bug.
- Rooms are removed from memory when the host ends the session
  (`room:end`) or when a room sits empty for 10 minutes (`ROOM_TTL_MS`).
- The server is **single-instance**: every participant must reach the *same*
  process, because that process holds the room.

### Scaling considerations

Horizontal scaling (multiple app/realtime instances) is **not supported
today** and is deliberately out of scope. If you ever need it, you would
have to:

1. Move room state out of process memory (e.g. a Redis store), and
2. Use Socket.io's Redis adapter
   (`@socket.io/redis-adapter`) for cross-instance broadcasts, and
3. Route clients to the instance that owns their room (sticky sessions /
   consistent hashing on the room code).

None of that exists in the codebase — do not assume it does.

---

## 5. Sample deployments

### A. Two processes on one VPS, behind Nginx

```
Internet → Nginx (:443, TLS)
             ├── /            → Next.js  (localhost:3000)
             └── /socket.io/* → realtime (localhost:3001, websocket upgrade)
```

Env: `SOCKET_ORIGIN=https://poker.example.com`,
`NEXT_PUBLIC_SOCKET_URL=/` (relative — proxied) or
`https://poker.example.com/` (same origin, upgrade path proxied).

Run both with a process manager (systemd / pm2) and
`Restart=always`; the app tolerates restarts because room loss is expected
behavior. Log to stdout.

### B. Serverless / edge platforms

- **Not recommended.** Serverless platforms impose per-request ephemeral
  execution and cannot host long-lived WebSocket rooms reliably. Next.js
  itself can run serverless, but the realtime server needs a persistent
  process (a VM, container, or a "serverful" host) and a stable public URL
  for `NEXT_PUBLIC_SOCKET_URL`. See section 4 for the state implications.

### C. Docker

Two containers: `app` (Next.js, `npm start`) and `rt` (realtime server,
`node server/index.mjs`), sharing a network. Pass env vars per service; keep
the `rt` container publicly reachable (or proxied with WebSocket upgrade) at
the URL you put in `NEXT_PUBLIC_SOCKET_URL` at build time.

---

## 6. Operational notes

- **Health checks:** `GET /` on the realtime server returns a plain 200 text
  banner — usable as a readiness probe.
- **Restarts lose rooms:** document this for your team. Participants simply
  create a new room; there is no recovery path and none is planned.
- **Capacity:** room state is small (a code, a few participants, votes).
  One process comfortably handles many concurrent rooms; memory grows with
  active rooms only, since empty rooms are swept every 30 s.
- **TLS:** terminate TLS at the proxy. Socket.io works fine behind TLS as
  long as upgrades are forwarded and the page was loaded over `https://` (a
  secure page requires a secure WebSocket URL).
