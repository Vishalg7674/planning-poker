# Reveal — planning poker with no database

A free, real-time planning poker table. One round per room: everyone votes in
secret, votes **lock permanently**, and the host reveals the whole table at
once — then everyone sees the votes and the statistics.

Rooms live **only in server memory**. No database, no accounts, no signup, no
history. When the room empties (or the server restarts), it vanishes — by
design.

---

## Core flow

```
Host creates room (name, team, title, deck, accent)
  →  shares the link / QR code
  →  participants join with just a name
      ↓
Host starts voting (optional timer: Off / 10s / 15s / 30s)
      ↓
Everyone votes exactly once — the vote locks the instant it lands
      ↓
Host sees who voted / who is still thinking (values stay hidden)
      ↓
Reveal unlocks when everyone has voted (or the timer ends the round)
      ↓
Everyone sees every vote + average / median / mode / range / consensus
```

## Features

- **Room customization** — host sets their name, an optional team name and
  room title, picks one of **five decks** (Fibonacci, Modified Fibonacci,
  Sequential, T-Shirt, Powers of 2) and an **accent color** (gold / purple /
  blue / green) that re-skins the whole table.
- **One round per room** — no stories, no queues, no revote, no history.
- **Permanent vote lock, enforced on the server** — a second `vote:cast` from
  the same participant is rejected, period.
- **Private until the reveal** — before the host reveals, nobody (not even the
  host) sees vote values, only *Voted / Thinking* status.
- **Live presence** — Joined → Thinking → Voted, plus Disconnected and a
  subtle "Reconnected" toast, with an animated thinking indicator and a live
  participant count.
- **Optional synchronized timer** — Off by default; 10s / 15s / 30s presets
  only. The server owns the countdown and ends the round for everyone.
- **Reveal rules** — timer off: reveal unlocks the moment *everyone* has
  voted; timer on: reveal unlocks when the timer ends the round (or earlier,
  if everyone votes first).
- **Smart statistics** — average, median, most-selected, **highest, lowest,
  range**, vote distribution and voter count, computed from submitted votes
  only (non-voters are excluded from the math but shown as *Didn't vote*).
  T-Shirt rounds get mode + distribution instead of a meaningless numeric
  average.
- **Consensus verdict** — a deterministic server-computed level (full /
  strong / moderate / large) with a "worth discussing?" prompt on large
  disagreements, and a confetti celebration on full consensus.
- **Host controls** — start, reveal, **remove a participant**, **lock/unlock
  the room** (new joiners refused while locked), **presentation mode** for
  TV/projector, and end the session. Every control is validated server-side.
- **QR + sharing** — the lobby shows a locally-generated QR code of the room
  URL (no external service), a copy-invite button with a friendly message,
  and native Web Share on supported devices.
- **No accounts** — an identity is a name in sessionStorage for one tab.
- **Big-screen mode** — `/r/<CODE>/screen` is a read-only projection of the
  table (join as a `screen`, not a participant), and hosts can also toggle an
  in-room **presentation view**.
- **Ephemeral rooms** — rooms expire 10 minutes after the last person leaves.

## Tech stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | Next.js 15 (App Router, React 19)             |
| Language  | TypeScript 5 (strict)                         |
| State     | Redux Toolkit 2 + react-redux 9               |
| Realtime  | Socket.io 4 (client + in-memory server)       |
| Forms     | react-hook-form + yup                         |
| Styling   | SCSS modules (sass)                           |
| QR        | qrcode.react (local SVG generation)           |
| Testing   | Vitest (unit/components), Playwright (E2E)    |
| Linting   | ESLint 9 (eslint-config-next)                 |

## Project structure

```
├── src/
│   ├── app/                  # Next.js routes: /, /create, /r/[roomCode], /r/[roomCode]/screen
│   ├── components/           # UI components (Button, Modal, Avatar, RoomQR, Toasts, …)
│   │   ├── room/             # Deck, StartPanel, RevealBar, EndedPanel, ResultsPanel,
│   │   │                     # PresentationView, ParticipantsPanel, …
│   │   ├── modals/           # EndSessionModal, RemoveParticipantModal
│   │   ├── providers.tsx     # Redux provider + theme sync
│   │   └── RealtimeBridge.tsx# socket → Redux bridge (the only socket consumer)
│   ├── lib/                  # cx, decks, identity, socket, theme, types
│   ├── store/                # Redux store + 5 slices (room, participants, voting, timer, ui)
│   │   └── actions.ts        # realtime → redux actions
│   └── styles/               # global SCSS, tokens, mixins, animations, accent presets
├── server/
│   ├── index.mjs             # Socket.io wiring, timers, room expiry
│   └── room.mjs              # pure room-state logic (unit-tested)
├── scripts/e2e.mjs           # socket-level E2E suite (121 checks)
├── tests/
│   ├── unit/                 # Vitest: lib, Redux slices, server room logic
│   ├── components/           # Vitest + Testing Library
│   ├── e2e/                  # Playwright specs + helpers
│   └── helpers/              # store/fixture builders for tests
├── docs/                     # architecture, PRD, API, testing, deployment, …
├── vitest.config.ts
├── playwright.config.ts
└── eslint.config.mjs
```

## Getting started

```bash
npm install

# one command: Next.js on :3000 + realtime server on :3001
npm run dev
```

Open http://localhost:3000, create a room, and open the share link in a second
tab (or another device on your network — see env vars below).

### Running the pieces separately

```bash
npm run dev:next   # Next.js only (defaults to :3000)
npm run dev:rt     # realtime server only (defaults to :3001)
npm run rt         # same as dev:rt
```

## Environment variables

See [`.env.example`](.env.example) — copy it to `.env.local` and adjust:

| Variable               | Used by           | Default                 |
| ---------------------- | ----------------- | ----------------------- |
| `SOCKET_PORT`          | realtime server   | `3001`                  |
| `SOCKET_ORIGIN`        | realtime server   | `http://localhost:3000` |
| `NEXT_PUBLIC_SOCKET_URL` | browser client  | `http://localhost:3001` |
| `NEXT_DIST_DIR`        | Next build        | (unset → `.next`)       |

For other devices on your LAN to join, set `NEXT_PUBLIC_SOCKET_URL` (and
`SOCKET_ORIGIN`) to your machine's LAN IP instead of `localhost`.

## Testing

```bash
npm test                  # unit + component tests (Vitest, jsdom)
npm run test:watch        # Vitest in watch mode
npm run test:coverage     # Vitest with coverage report
npm run test:realtime     # socket-level E2E suite against a live server
npm run test:e2e          # Playwright browser E2E (starts its own servers)
npm run test:e2e:headed   # Playwright headed, to watch it run
npm run test:e2e:ui       # Playwright UI mode
npm run test:all          # coverage + Playwright
```

See [docs/TESTING.md](docs/TESTING.md) for details.

## Linting

```bash
npm run lint
```

## Production build

```bash
npm run build   # lints + typechecks + builds into .next
npm start       # serve the production build (defaults to :3000)
npm run rt      # run the realtime server alongside it
```

> **Important:** the realtime server is a separate process from Next.js. In
> production you must run both (`npm start` + `npm run rt`), and point
> `NEXT_PUBLIC_SOCKET_URL` at the realtime server's public URL. Room state is
> **in memory** — one server instance. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, room lifecycle, state ownership
- [docs/PRD.md](docs/PRD.md) — product requirements
- [docs/TRD.md](docs/TRD.md) — technical requirements, data models, socket contract
- [docs/API.md](docs/API.md) — realtime API reference
- [docs/REALTIME.md](docs/REALTIME.md) — realtime architecture & server authority
- [docs/STATE_MANAGEMENT.md](docs/STATE_MANAGEMENT.md) — Redux slices and data flow
- [docs/TESTING.md](docs/TESTING.md) — testing strategy and how to run the suites
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment requirements & limitations
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — contributing guidelines
