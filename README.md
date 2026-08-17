# Reveal — Fun Multiplayer Games for Teams

**Break the ice. Play together. No login required.**

Reveal is a real-time multiplayer games platform for teams, retrospectives,
icebreakers and everything in between — **112 games across 10 categories, all
live**. The catalog spans icebreakers, speed games, guessing, estimation,
funny/social, developer, creative, word and competitive games, plus two
hosted agile ceremonies (Team Health Check and Live Poll). Every game follows
the same philosophy: create a room, share the link, and play together with
zero signup.

Rooms live **only in server memory**. No database, no accounts, no history.
When the room empties (or the server restarts), it vanishes — by design.

The app is **Night/Dark Mode only** — there is no light theme and no theme
switcher.

---

## Core flow

```
Host creates a game room (name, optional team name)
  →  shares the link (room code stays the same)
  →  participants join with just a name
      ↓
Host starts the first round / prompt / question / poll
      ↓
Everyone answers exactly once — the answer locks the instant it lands
      ↓
Host sees who answered / who is still thinking (values stay hidden)
      ↓
Reveal unlocks when everyone has answered
      ↓
Everyone sees every answer + the round's statistics / winner
      ↓
Host starts the next round — in the SAME room, same link, same people
```

Planning Poker (the original game) lives at `/create` and follows the same
flow with decks, an optional synchronized timer and consensus statistics.

## Game catalog & engine

- The homepage and `/games` render entirely from one centralized registry,
  [`src/lib/games.ts`](src/lib/games.ts) — 112 games across 10 categories.
- Each game is a small data entry: icon, name, description, category, player
  count, duration and route.
- **Every engine-backed game** renders through one shared `GameRoom`
  component at `/games/[gameId]`, driven by:
  - the client config in [`src/lib/gameConfig.ts`](src/lib/gameConfig.ts)
    (which voting UI, socket events and copy each game uses),
  - the server registry in [`server/games/registry.mjs`](server/games/registry.mjs)
    (game kind + socket events),
  - the JSON prompt banks in [`server/games/data/`](server/games/data/)
    (questions / prompts / answers).
- **Team Health Check** and **Live Poll** are hosted agile activities — the
  host builds them at creation time (categories to rate, or the poll question
  and options) and the room plays through the same lifecycle.
- **One room → many activities**: the host can switch the room between
  Planning Poker, Team Health and Live Poll in place — the room code, URL,
  participants and host are preserved; everyone follows automatically.
- **Planning Poker** has its own dedicated page at `/create` (decks,
  timer presets, reveal modes, consensus stats).
- The catalog has instant **search** and **category filter chips**, plus
  per-category "View all" links.

## Features

- **Game catalog** — search + category filters over 112 games, grouped into
  10 category sections, responsive grid (4 → 2 → 1 cards per row).
- **Room customization** — host sets their name, an optional team name, and
  (for the hosted activities) the full activity configuration.
- **Multiple rounds per room** — after a round is revealed the host starts
  the next round in the same room (same URL, same participants); answers and
  results reset for everyone in real time. No revote *within* a round, no
  history.
- **Permanent answer lock, enforced on the server** — a second vote from the
  same participant is rejected, period.
- **Private until the reveal** — before the host reveals, nobody (not even
  the host) sees answer values, only *Answered / Thinking* status.
- **Live presence** — Joined → Thinking → Answered, plus Disconnected, with
  a subtle "Reconnected" toast.
- **Host controls** — start, reveal, **next round**, **remove a
  participant**, **lock/unlock the room** (new joiners refused while locked),
  **switch activity**, and end the session. Every control is validated
  server-side.
- **QR + sharing** — the lobby shows a locally-generated QR code of the room
  URL (no external service) and a copy-invite button.
- **No accounts** — an identity is a name in sessionStorage for one tab.
- **Big-screen mode** — `/r/<CODE>/screen` is a read-only projection of the
  Planning Poker table (join as a `screen`, not a participant).
- **Ephemeral rooms** — rooms expire 10 minutes after the last person leaves.
- **Resilient realtime** — if the socket server is unreachable the UI shows
  *Connecting / Reconnecting / Server offline — Retry* instead of crashing;
  acknowledgements never produce unhandled promise errors, and a reconnect
  restores your seat without reloading the game.

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
| Testing   | Vitest (unit/components), Playwright (E2E)    |
| Linting   | ESLint 9 (eslint-config-next)                 |

## Project structure

```
├── src/
│   ├── app/                  # Next.js routes: /, /games, /games/[gameId], /create, /r/[roomCode], /r/[roomCode]/screen
│   ├── components/
│   │   ├── game/             # GameRoom — the shared engine-game UI (create/join/play/results)
│   │   ├── games/            # GameCard, GameCatalog (homepage + /games catalog)
│   │   ├── room/             # Deck, StartPanel, RevealBar, EndedPanel, ResultsPanel,
│   │   │                     # PresentationView, ParticipantsPanel, … (Planning Poker)
│   │   ├── modals/           # EndSessionModal, RemoveParticipantModal, RoundResultModal, NewRoundModal
│   │   ├── providers.tsx     # Redux Provider
│   │   └── RealtimeBridge.tsx# socket → Redux bridge (Planning Poker state)
│   ├── lib/                  # cx, decks, games (catalog), gameConfig (client registry),
│   │                         # gameEngine (types), identity, socket, types
│   ├── store/                # Redux store + 5 slices (room, participants, voting, timer, ui)
│   └── styles/               # global SCSS, tokens, mixins, animations, accent presets
├── server/
│   ├── index.mjs             # Socket.io wiring, rate limiting, room expiry
│   ├── room.mjs              # pure Planning Poker room logic (unit-tested)
│   └── games/                # engine.mjs (generic game engine), registry.mjs,
│                             # teamHealth.mjs, livePoll.mjs, data/*.json (prompt banks)
├── scripts/e2e.mjs           # socket-level E2E (Planning Poker, 150 checks)
├── scripts/e2e-games.mjs     # socket-level E2E (engine games + hosted activities, 126 checks)
├── scripts/check-games.mjs   # catalog ↔ registry ↔ prompt-bank consistency gate
├── tests/                    # unit, components, e2e (Playwright), helpers
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

Open http://localhost:3000, pick a game, create a room, and open the share
link in a second tab (or another device on your network — see env vars
below).

> The realtime server **must be running** for rooms to work. `npm run dev`
> starts both processes together; if you run the Next app alone, the UI will
> show *Server offline* rather than crashing.

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
npm run test:realtime     # socket-level E2E — Planning Poker (needs the RT server running)
npm run test:e2e          # Playwright browser E2E (starts its own servers)
npm run test:e2e:headed   # Playwright headed, to watch it run
npm run test:e2e:ui       # Playwright UI mode
npm run test:all          # coverage + Playwright
```

Additional gates:

```bash
node scripts/check-games.mjs   # catalog ↔ registry ↔ prompt banks consistency
node scripts/e2e-games.mjs     # socket-level E2E for engine games + hosted activities
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
