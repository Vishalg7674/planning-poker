# Reveal — Real-time Planning Poker for Teams

**Estimate together. Reveal together. No login required.**

Reveal is a real-time, no-database **Planning Poker** app for agile teams.
Create a room, share one link, and your team estimates stories in private —
votes stay hidden until the host reveals them, then everyone sees the cards,
statistics and a consensus verdict together.

Rooms live **only in server memory**. No database, no accounts, no history.
When the room empties (or the server restarts), it vanishes — by design.

The app is **Night/Dark Mode only** — there is no light theme and no theme
switcher.

---

## Core flow

```
Host creates a room (name, optional team name, deck, accent)
  →  shares the link / QR code (room code stays the same)
  →  participants join with just a name
      ↓
Host starts voting (optionally with a 10/15/30s timer, and a story id/title)
      ↓
Everyone picks exactly one card — the vote locks the instant it lands
      ↓
Host sees who voted / who is still thinking (values stay hidden)
      ↓
Reveal unlocks when everyone has voted (or the timer ends the round)
      ↓
Everyone sees every vote + statistics + a consensus verdict
      ↓
Host starts the next story — in the SAME room, same link, same people
```

## Features

- **5 estimation decks** — Fibonacci (default), Modified Fibonacci, Sequential,
  T-Shirt and Powers of 2, with per-deck statistics (numeric decks get
  average / median / highest / lowest / range; T-Shirt gets mode + distribution).
- **Room customization** — host sets their name, an optional team name, room
  title, deck and accent (gold / purple / blue / green).
- **Optional synchronized timer** — 10 / 15 / 30 seconds, driven by the server;
  every client counts down from the same timestamp and hits zero together.
- **Story tracking** — optionally attach a ticket id, title and description to
  every round.
- **Multiple rounds per room** — after a round is revealed the host starts the
  next story in the same room (same URL, same participants); votes and results
  reset for everyone in real time. No revote *within* a round, no history.
- **Permanent vote lock, enforced on the server** — a second vote from the
  same participant is rejected, period.
- **Private until the reveal** — before the host reveals, nobody (not even the
  host) sees vote values, only *Voted / Thinking* status.
- **Consensus verdict** — full / strong / moderate / large, computed
  server-side from the vote distribution, with a round-result modal for full
  consensus 🎉 and large disagreement ⚡.
- **Live presence** — Joined → Thinking → Voted, plus Disconnected, with a
  subtle "Reconnected" toast. A disconnected participant never blocks the
  reveal.
- **Host controls** — start, reveal, skip (host can sit a round out), **new
  story**, **remove a participant**, **lock/unlock the room** (new joiners
  refused while locked), **presentation mode**, and end the session. Every
  control is validated server-side.
- **QR + sharing** — the lobby shows a locally-generated QR code of the room
  URL (no external service) and a copy-invite button.
- **No accounts** — an identity is a name in sessionStorage for one tab.
- **Big-screen mode** — `/r/<CODE>/screen` is a read-only projection of the
  table (joins as a `screen`, not a participant).
- **Ephemeral rooms** — rooms expire 10 minutes after the last person leaves.
- **Resilient realtime** — if the socket server is unreachable the UI shows
  *Connecting / Reconnecting / Server offline — Retry* instead of crashing;
  acknowledgements never produce unhandled promise errors, and a reconnect
  restores your seat without reloading the page.

## Tech stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | Next.js 15 (App Router, React 19)             |
| Language  | TypeScript 5 (strict)                         |
| State     | Redux Toolkit 2 + react-redux 9               |
| Realtime  | Socket.io 4 (client + in-memory server)       |
| Forms     | react-hook-form + yup                         |
| Styling   | SCSS modules (sass), night-only design tokens |
| QR        | qrcode.react (local SVG generation)           |
| Testing   | Vitest (unit + component tests)               |
| Linting   | ESLint 9 (eslint-config-next)                 |

## Project structure

```
├── src/
│   ├── app/                  # Next.js routes: /, /create, /r/[roomCode], /r/[roomCode]/screen
│   ├── components/
│   │   ├── room/             # Deck, StartPanel, RevealBar, EndedPanel, ResultsPanel,
│   │   │                     # PresentationView, ParticipantsPanel, TimerBadge, …
│   │   ├── modals/           # EndSessionModal, RemoveParticipantModal, RoundResultModal, NewRoundModal
│   │   ├── providers.tsx     # Redux Provider
│   │   └── RealtimeBridge.tsx# socket → Redux bridge (the only socket consumer)
│   ├── lib/                  # cx, decks, errors, identity, roomActions, socket, types
│   ├── store/                # Redux store + 5 slices (room, participants, voting, timer, ui)
│   └── styles/               # global SCSS, tokens, mixins, animations, accent presets
├── server/
│   ├── index.mjs             # Socket.io wiring, rate limiting, room expiry
│   └── room.mjs              # pure Planning Poker room logic (unit-tested)
├── tests/                    # unit + component tests (Vitest)
├── docs/                     # architecture, PRD, API, testing, deployment, …
├── vitest.config.ts
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

> The realtime server **must be running** for rooms to work. `npm run dev`
> starts both processes together; if you run the Next app alone, the UI will
> show *Server offline* rather than crashing.

### Running the pieces separately

```bash
npm run dev:next   # Next.js only (defaults to :3000)
npm run dev:rt     # realtime server only (defaults to :3001)
npm run rt         # same as dev:rt
```

### “Port 3001 is already in use”

`npm run dev` starts the realtime server exactly once, so the port conflict
means a leftover process is holding it — usually an earlier run that didn’t
shut down cleanly (Ctrl+C in some IDE terminals can orphan the child process
on Windows). Find and stop it, then run `npm run dev` again:

```bash
# Windows (cmd / PowerShell)
netstat -ano | findstr :3001
taskkill /PID <pid> /F

# Git Bash / Linux / macOS
netstat -tlnp | grep 3001
kill <pid>
```

The realtime server also prints this guidance itself when it fails to start
on an occupied port — including how to pick another port:
`SOCKET_PORT=3002 npm run dev`.

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

## Theme

Reveal ships **Night/Dark Mode only**. The dark felt, warm gold accent and
ivory card surfaces are the single theme — there is no light mode, no theme
toggle and no OS-preference switching. `data-theme="dark"` is set statically
on `<html>` in `src/app/layout.tsx`, and all design tokens live in
`src/styles/globals.scss`.

## Testing

```bash
npm test                  # unit + component tests (Vitest, jsdom)
npm run test:watch        # Vitest in watch mode
npm run test:coverage     # Vitest with coverage report
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
