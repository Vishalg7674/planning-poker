# Optimization Plan — Reveal

> This document is the **gap analysis + execution plan** companion to
> [`system-design.md`](system-design.md). It lists everything that is **not yet
> implemented** (or only partially), the risk it addresses, the fix, and a
> prioritized, phased plan. Each item is scoped so it can be picked up
> independently. Legend: **P0** = launch-blocker or correctness risk,
> **P1** = should-do soon, **P2** = nice-to-have / scale-stage.

---

## 1. Current state — what is already solid (don't touch)

- Server-authoritative rules (vote lock, reveal, timer, validation) — implemented + unit-tested.
- Vote privacy (values never leave the server pre-reveal) — implemented + e2e-tested.
- Snapshot-per-mutation protocol — simple, no drift.
- Reconnection / rejoin / host promotion — implemented.
- Room expiry TTL (10 min) + 500 ms timer sweep + 30 s expiry sweep — implemented.
- Generic game engine with 60+ JSON-driven games — implemented.
- Layered test suite (Vitest unit/components, socket E2E, Playwright) — implemented.
- CORS allow-list, payload cap, input clamping — implemented.
- `render.yaml` blueprint + health endpoint — implemented.

---

## 2. Gap analysis (what is missing)

| # | Gap | Risk it addresses | Severity | Status |
| --- | --- | --- | --- | --- |
| G1 | **No rate limiting** (socket or HTTP) | Room-creation floods, vote spam, join floods, code enumeration | 🔴 High | ✅ Done (Phase 0) |
| G2 | **No monitoring/metrics** (no `/metrics`, no prom-client, no dashboards) | Blind in production: can't see sockets, rooms, event-loop lag, broadcast volume | 🔴 High | ✅ Done (Phase 0) |
| G3 | **No structured logging** (pino/winston) | Hard to debug multi-socket issues; only `console.log` today | 🟠 Medium | ✅ Done (Phase 0) |
| G4 | **No error tracking** (Sentry) | Client + server errors invisible until users complain | 🟠 Medium | ✅ Done (Phase 1) |
| G5 | **No load testing** (k6/artillery) | Capacity claims in system-design.md are unproven; can't find the real ceiling | 🟠 Medium | Missing (Phase 1) |
| G6 | **No CI pipeline** (GitHub Actions) | Lint/typecheck/tests only run locally; deploys aren't gated | 🟠 Medium | ✅ Done (Phase 0) |
| G7 | **No graceful shutdown** (SIGTERM/SIGINT) | Mid-reveal restarts cut connections hard; no "server going down" notice | 🟠 Medium | ✅ Done (Phase 0) |
| G8 | **No process manager / restart policy in prod guidance** | Crash = manual restart + full downtime window | 🟡 Low–Med | Missing (docs mention pm2/systemd only) |
| G9 | **No security headers** (CSP, etc.) | XSS/CSP baseline missing; socket origin not declared in CSP | 🟠 Medium | ✅ Done (Phase 0) |
| G10 | **No horizontal scaling** (Redis adapter, sticky LB) | Hard ceiling at ~2–5k concurrent sockets; single point of failure | 🟡 Low–Med (scale-stage) | Deliberately deferred |
| G11 | **Room state not in Redis** | Rooms die on restart (by design today — needs product decision) | 🟡 Low (product) | Deferred by design |
| G12 | **No `trust proxy` setting** | Rate limiting (G1) and IP logging would see the LB's IP, not the client's | 🟠 Medium | Missing (needed once behind LB) |
| G13 | **No HTTP caching headers / ISR** for catalog & static pages | Slightly slower page loads; edge caching unused | 🟡 Low | Missing |
| G14 | **No per-IP connection caps** | One client can open hundreds of sockets (memory/DoS) | 🟠 Medium | Missing |
| G15 | **No server cap on room size** | A 500-person room would broadcast huge snapshots (README says 3–20) | 🟡 Low–Med | Missing |
| G16 | **No dependency scanning** (`npm audit` in CI, Dependabot) | Known CVEs shipped silently | 🟡 Low–Med | Missing |
| G17 | **No snapshot coalescing / payload trimming** | Fan-out cost grows with room size; only matters at 10k+ users | 🟢 Low (scale-stage) | Deferred |
| G18 | **Free-tier cold start** | Render free service sleeps → first visitor may time out (7 s client limit) | 🟠 Medium | Ops decision (paid plan) |
| G19 | **No analytics** (product telemetry) | Can't measure rooms created, games played, drop-off | 🟢 Low (product) | Missing |
| G20 | **Compression unverified** | Snapshot payloads could be 5–10× smaller if per-message deflate is on | 🟢 Low | Verify + enable |

---

## 3. Prioritized plan

### Phase 0 — Launch hardening ✅ implemented

**Goal: make the current single-instance deployment safe to promote.** All six tasks below are
**done** — see the diff summary at the end of this section.

> **Diff summary (Phase 0):** `server/rateLimit.mjs` (new, unit-tested) + rate limits wired into
> `server/index.mjs` (room:create 5/min/IP, room:join 30/min/IP, vote events 10/s/socket,
> 20 sockets/IP, `rate_limited` acks, `RATE_LIMIT_DISABLED=1` for tests); `GET /metrics`
> (prom-client: rooms, sockets, snapshots, broadcast bytes, events, rejected actions,
> rate-limited + default node/event-loop metrics); pino JSON logging (`LOG_LEVEL`);
> graceful shutdown on SIGTERM/SIGINT (broadcasts `room:ended`, drains); security headers
> in `next.config.mjs` (CSP incl. socket origin + Google Fonts, nosniff, X-Frame-Options,
> Referrer-Policy, Permissions-Policy); GitHub Actions CI (`.github/workflows/ci.yml`:
> lint → build → unit → socket E2E → Playwright → non-blocking npm audit). Also fixed a
> latent harness bug: `playwright.config.ts` now sets `SOCKET_ORIGIN` so the browser
> (app on :3100) is allowed to open WebSockets to the realtime server.

| Task | Details | Effort |
| --- | --- | --- |
| **T1 — Rate limiting (G1, G14)** | Add a Socket.io middleware with a token bucket: `room:create` ≤ 5/min/IP, `room:join` ≤ 30/min/IP, `vote:cast` + `game:*` ≤ 10/s/socket, plus a max concurrent sockets per IP (e.g. 20). Return `{ ok:false, error:'rate_limited' }` acks so the client shows a friendly message. Package: `@socket.io/rate-limiter` or ~60 lines of hand-rolled bucket in `server/index.mjs`. | 0.5–1 day |
| **T2 — Monitoring basics (G2)** | Add `prom-client` + a `GET /metrics` endpoint on the realtime server (rooms count, connected sockets, snapshots/s, broadcast bytes, event-loop lag via `perf_hooks`, memory). Ship a minimal Grafana dashboard JSON. Render can scrape or you poll `/metrics`. | 0.5–1 day |
| **T3 — Structured logging (G3)** | Replace `console.log` with pino JSON logs: connection open/close (with room code + participant id), room create/end, rejected actions (with error codes). Log levels: info/debug/error. | 0.5 day |
| **T4 — Security headers (G9)** | In `next.config.mjs` add `headers()`: CSP (allow `connect-src` to the socket origin — `wss:`/`ws:`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`. | 0.5 day |
| **T5 — Graceful shutdown (G7)** | Handle `SIGTERM`/`SIGINT` in `server/index.mjs`: stop the sweeps, broadcast a `room:ended`-style notice to every room, close HTTP server, then exit. Test locally with Ctrl-C and a SIGTERM. | 0.5 day |
| **T6 — CI pipeline (G6)** | GitHub Actions workflow: `npm ci` → `npm run lint` → `npm run build` → `npm test` → `npm run test:e2e` (Playwright with Chrome channel). Gate deploys on it. Also run `npm audit --audit-level=high` (G16) as a non-blocking job. | 1 day |

**Phase 0 exit criteria:** a scripted load of 500 sockets stays healthy; metrics + logs exist;
CI is green; rate limits return friendly errors.

---

### Phase 1 — Reliability & visibility (next; ~3–5 days)

| Task | Details | Effort |
| --- | --- | --- |
| **T7 — Error tracking (G4)** ✅ done | `@sentry/nextjs` v10 wired per the manual setup: `src/instrumentation.ts` + `src/sentry.server.config.ts` / `src/sentry.edge.config.ts` / `src/instrumentation-client.ts` (guarded by `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`), `withSentryConfig` in `next.config.mjs` (source maps via `SENTRY_AUTH_TOKEN`), `src/app/global-error.tsx`, `onRequestError`. Realtime server: `@sentry/node` init (10% trace rate), try/catch safety net around every socket handler, `room:create` catch, and `uncaughtException`/`unhandledRejection` handlers that capture + gracefully shut down. | 0.5–1 day |
| **T8 — Load testing (G5)** | Add a k6 script (`scripts/load/`) that opens N rooms × M sockets, casts votes, reveals, and asserts p95 broadcast latency < 200 ms. Document the ceiling you find (update §14 of system-design.md). | 1 day |
| **T9 — Compression + payload trim (G20, G17-lite)** | Verify/enable `perMessageDeflate` on the Socket.io server; measure snapshot sizes; trim per-round participant fields from snapshots if cheap (keep `votedIds` + name/status only). | 0.5 day |
| **T10 — Room-size cap (G15)** | Enforce a server-side participant cap (e.g. 40) at `room:join` with `room_full` error; surface it in the waiting room UI. | 0.5 day |
| **T11 — HTTP caching for static pages (G13)** | Add `Cache-Control` via Next `headers()`: `s-maxage=31536000, immutable` for hashed assets, and ISR (`revalidate`) or static for `/games` and `/` catalog data if they ever become dynamic. | 0.5 day |
| **T12 — Restart policy + deploy doc (G8, G18)** | Document a pm2/systemd setup or upgrade the Render plan to non-sleeping; add a "deploy during low traffic; rooms will be lost" runbook to DEPLOYMENT.md. | 0.5 day |

**Phase 1 exit criteria:** load test numbers recorded; Sentry alarms exist; compressed
snapshots verified; room cap enforced; static pages served from edge cache.

---

### Phase 2 — Scale (only when 5k+ concurrent users is real)

| Task | Details | Effort |
| --- | --- | --- |
| **T13 — Redis adapter + sticky sessions (G10)** | `@socket.io/redis-adapter`; run 2+ realtime instances; LB (Nginx/HAProxy) with WebSocket upgrade forwarding + sticky sessions (ideally consistent hashing on room code); set `trust proxy` (G12). Client code unchanged — event/snapshot contract stays identical. | 2–4 days |
| **T14 — Room state in Redis (G11)** | Only if product wants crash-tolerant rooms. Move the room Map into Redis hashes; keep the engine logic pure (it already is — the adapter is thin). **Requires product sign-off** because it changes the ephemerality promise. | 2–3 days |
| **T15 — Snapshot coalescing (G17)** | Batch rapid mutations into one snapshot per ~100 ms tick per room during bursts (reveals). Only if load tests show fan-out pressure. | 1 day |
| **T16 — Analytics (G19)** | Emit lightweight room-created / round-revealed events to a sink (Postgres/ClickHouse or a hosted analytics product). Never include vote values. | 1–2 days |
| **T17 — Multi-region (G10+) | Deploy the realtime fleet per region; DNS-based routing (Route53/Cloudflare) pinning a room's code space to a region. Only at very large scale. | 2+ days |

---

## 4. Sequencing rationale

1. **Phase 0 is all about correctness and ops safety on the current single instance** —
   nothing there requires product decisions or new infrastructure; each task is small and
   testable. Rate limiting and monitoring are the two highest-leverage items.
2. **Phase 1 closes the visibility loop** (load tests prove the ceiling; Sentry finds bugs;
   compression buys headroom) and removes the remaining product risks (room cap).
3. **Phase 2 is gated on real traffic.** Do not build the Redis adapter before load tests say
   the single instance is the bottleneck — the current design is deliberately simple, and
   simplicity is the feature.

---

## 5. Quick wins

**Done (Phase 0):**

- [x] Socket middleware rate limiters (`room:create`, `room:join`, vote events, socket cap) — G1
- [x] `GET /metrics` with prom-client (rooms, sockets, snapshots, bytes, events, rejections) — G2
- [x] pino structured logging on the realtime server — G3
- [x] Security headers in `next.config.mjs` (CSP + friends) — G9
- [x] SIGTERM/SIGINT graceful shutdown — G7
- [x] GitHub Actions CI (lint → build → unit → socket E2E → Playwright → audit) — G6

**Still open (Phase 1+):**

- [ ] Verify `perMessageDeflate` is enabled; record snapshot byte sizes — G20
- [ ] Server-side room participant cap — G15
- [x] Sentry error tracking — G4
- [ ] k6 load tests to record the real connection ceiling — G5

---

## 6. Measurement checklist (after each phase)

| Metric | Target | Where |
| --- | --- | --- |
| Event-loop lag | < 100 ms p95 | Grafana (prom-client) |
| Snapshot broadcast latency | < 200 ms p95 at 1k sockets | k6 load test |
| Connected sockets per instance | documented ceiling | Grafana |
| Room create latency | < 100 ms p95 | Grafana |
| Memory growth with rooms | linear, swept | Grafana |
| Vote → snapshot seen by all peers | < 300 ms p95 | k6 assertion |
| Error rate (rejected acks) | < 1% during load | logs / metrics |

---

## 7. Decision log / open questions

| Question | Affects | Suggested answer |
| --- | --- | --- |
| Should rooms survive a server restart? | G11 / T14 | No — keep ephemeral; document it. Revisit only with product sign-off. |
| Paid Render plan (no sleep) vs self-host? | G18 | Paid plan for a reliable demo; VPS + pm2 for more control. |
| Public launch audience size? | Phase 2 trigger | If < 2k concurrent users expected, Phase 2 can wait. |
| Analytics worth the privacy cost? | T16 | Fine if anonymized and no vote values. |
