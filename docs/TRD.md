# Technical Requirements Document — Reveal

## Technology stack

| Component          | Technology / version (per `package.json`)          |
| ------------------ | --------------------------------------------------- |
| Framework          | Next.js `^15.3.0` (App Router, React `^19.1.0`)    |
| Language           | TypeScript `^5.7.0` (strict), plus `server/*.mjs` (plain ESM JS) |
| State              | Redux Toolkit `^2.6.1`, react-redux `^9.2.0`        |
| Realtime           | socket.io `^4.8.1` (server), socket.io-client `^4.8.1` (client) |
| Forms              | react-hook-form `^7.55.0`, yup `^1.6.1`, `@hookform/resolvers` `^5.1.0` |
| Styling            | SCSS modules via `sass` `^1.85.0`                   |
| QR codes           | `qrcode.react` `^4.2.0` (local SVG generation — no external service) |
| Dev / build        | Node.js 22, npm 11, `concurrently` for `npm run dev` |
| Unit/component tests | Vitest (latest), jsdom, React Testing Library, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/coverage-v8` |
| E2E tests          | `@playwright/test` (Chromium via the system Chrome channel) |
| Linting            | ESLint 9 flat config + `eslint-config-next` (`core-web-vitals`, `typescript`) |

Path alias: `@/*` → `./src/*` (TypeScript `paths` + Vitest `resolve.alias`).

## Application architecture

Two processes:

1. **Next.js app** (`src/`) — pages, Redux, Socket.io client.
2. **Realtime server** (`server/index.mjs` + `server/room.mjs`) — in-memory
   room state over Socket.io.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the diagram and lifecycle.

## Frontend architecture

### Pages (App Router)

| Route                    | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `/`                      | Games-platform homepage: hero, featured Planning Poker, full game catalog, roadmap podium, how-it-works, CTA |
| `/games`                 | Full catalog page (reuses `GameCatalog`); optional `?cat=<category>` preselects a filter |
| `/games/[gameId]`        | Dynamic game page — `live` games `redirect()` to their real route; `coming-soon` games render the shared placeholder; unknown ids 404 |
| `/create`                | Planning Poker room creation form: name (required), team name, room title, deck picker, accent picker → navigates to `/r/<CODE>` |
| `/games/would-you-rather`| Would You Rather create page: name (required), team/title, question-deck picker (bank + custom), accent → navigates to `/r/<CODE>` |
| `/games/most-likely-to`  | Most Likely To create page: name (required), team/title, prompt picker (bank + custom), accent → navigates to `/r/<CODE>` |
| `/r/[roomCode]`          | The room: waiting → voting → ended → revealed, plus the participant side panel |
| `/r/[roomCode]/screen`   | Read-only projector view (joins the socket as `role: 'screen'`) |

### Components (`src/components`)

- Games (`src/components/games`): `GameCard` (one catalog card — the whole
  card is the link; LIVE / COMING SOON badges), `GameCatalog` (search input
  + category filter chips + per-category grids + empty state), `ComingSoonGame`
  (the shared placeholder body for unimplemented games).
- Primitives: `Button`, `Field`/`Input`/`Textarea`/`Select`, `Modal`, `Avatar`
  (auto initials), `Wordmark`, `ThemeToggle`, `ConnectionPill`, `Toasts`,
  `Celebration`, `DistributionChart`, `RoomQR` (local QR of the invite URL).
- Room (`src/components/room`): `Deck` (the voting cards; dense layout for
  large decks), `StartPanel` (waiting room: config summary, QR, copy/share
  invite, timer + reveal-mode pickers, lock/unlock, presentation toggle,
  start), `RevealBar` (live counter + reveal button), `EndedPanel`,
  `ResultsPanel` (reveal + smart stats + consensus + extremes),
  `PresentationView` (large-font presentation mode), `ParticipantsPanel`
  (presence + count + remove control), `TimerBadge`, `HostToolbar` (end
  session, presentation toggle), `JoinForm` (incl. locked-room error), hook
  `useShortcuts` (Space = reveal, 1–9 = vote).
- WYR (`src/components/wyr`): `WyrRoom` — the Would You Rather table rendered
  inside the shared room shell: waiting room (invite, lock, start), the
  physical A/B choice cards with a per-question lock, the host-paced
  reveal split (counts, percentages, voter chips), and the Next Question /
  End Session controls.
- MLT (`src/components/mlt`): `MltRoom` — the Most Likely To table: waiting
  room (invite, lock, start), secret teammate-nomination chips (never
  yourself, per-round lock), the host-paced reveal with crowned players and
  nomination tally, session totals via the shared `Leaderboard`, and the
  end-of-game `WinnerModal` driven by `useGameSession` (Play Again keeps
  session scores).
- Modals (`src/components/modals`): `EndSessionModal`, `RemoveParticipantModal`.
- `providers.tsx` — Redux `Provider` + theme sync; `RealtimeBridge.tsx` — the
  socket → Redux bridge.

### Hooks

- `useRoomShortcuts` — keyboard: Space reveals when the host may; in
  Planning Poker the number keys 1–9 vote by deck position, in Would You
  Rather the `A` / `B` keys pick a side. Ignored while typing or with a
  modal open.
- `useAppDispatch` / `useAppSelector` / `useAppStore` — typed Redux hooks.

### Redux

See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md). Five slices: `room`,
`participants`, `voting`, `timer`, `ui`.

### SCSS

- Token-driven: `src/styles/_variables.scss` (colors as CSS custom
  properties), `_mixins.scss`, `_animations.scss`, `globals.scss`.
- Accent presets are CSS custom-property sets applied via a `data-accent`
  attribute on the room root (gold / purple / blue / green) — one attribute
  re-skins the whole table.
- All component styles are CSS Modules (`*.module.scss`) with
  `@use 'styles/variables'` (via `sassOptions.includePaths: ['src']`).
- Dark/light theming via a `data-theme` attribute on `<html>`.
- Motion respects `prefers-reduced-motion`.

## Backend / realtime architecture

- `server/index.mjs` — `node:http` + Socket.io with CORS from
  `SOCKET_ORIGIN`; a `Map<code, Room>`; the 500 ms countdown sweep; the
  30 s room-expiry sweep; per-socket room/participant bookkeeping.
- `server/room.mjs` — the pure state machine and rules (unit-tested):
  `genCode`, `createRoom`, `addParticipant`, `hueFromString`,
  `calculateConsensus`, `computeStats`, `computeWyrStats`,
  `normalizeQuestions`, `everyoneHasVoted`, `buildSnapshot`,
  `startVoting`, `castVote`, `reveal`, `nextQuestion`, `setTimerSec`,
  `setRevealMode`, `setLocked`, `removeParticipant`,
  `disconnectParticipant`, `promoteHostIfNeeded`.
- Rooms are identified by a 5-character code from
  `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.

## State machine

Planning Poker (one round per room):

```
WAITING → VOTING → (ENDED) → REVEALED
```

Would You Rather (multiple question rounds on the same statuses):

```
WAITING → VOTING ⇄ REVEALED (wyr:next) → room:end
```

Most Likely To (multiple prompt rounds + session end):

```
WAITING → VOTING ⇄ REVEALED (mlt:next) → REVEALED (last) → mlt:finish
        → sessionOver → WinnerModal → mlt:playAgain (WAITING, scores kept)
```

- `vote:cast` in an MLT room accepts a **teammate's participant id** (never
  yourself — `self_vote`); the one-per-round nomination lock re-arms on
  `mlt:next`.
- Reveal is **host-paced** (like WYR): anyone still thinking appears as
  *didn't nominate*.
- `mlt:finish` marks the session over; `mlt:playAgain` resets rounds but
  keeps `mltScores` so multiple sessions crown an overall champion.

- `voting:start` puts question 0 on the table; the snapshot broadcasts the
  active `question` once `status !== 'waiting'`.
- `votes:reveal` is host-paced for WYR (no "everyone must vote" gate).
- `wyr:next` (host-only, after a reveal) wipes `votes` and `hasVoted`
  (the per-question lock re-arms), advances `questionIndex`, and returns
  `done: true` when the deck is exhausted.

See [ARCHITECTURE.md — Room lifecycle](ARCHITECTURE.md#room-lifecycle).

## Deck architecture

Decks are a **central configuration array** in `src/lib/decks.ts`, mirrored
by the server's `KNOWN_DECKS` allow-list. The voting UI only ever receives
the resolved `deckValues(settings)`; it never knows how decks are defined, so
a future custom deck is a one-line change.

| id                 | values                  | numeric |
| ------------------ | ----------------------- | ------- |
| `fibonacci`        | `1 2 3 5 8 13 21`       | yes     |
| `modifiedFibonacci`| `0 ½ 1 2 3 5 8 13 21`   | yes     |
| `sequential`       | `1 2 3 4 5 6 7 8`       | yes     |
| `tshirt`           | `XS S M L XL`           | no      |
| `powersOfTwo`      | `1 2 4 8 16 32`         | yes     |

The server's `computeStats` treats `½` as `0.5`; non-numeric decks get
`numeric: false` and null numeric stats.

## Game catalog

The catalog is **one centralized registry**, `src/lib/games.ts` — 110 games
across 9 categories (`CATEGORIES`), each game a plain data entry:

```ts
{
  id: string;           // kebab-case slug, also the /games/<id> route
  name: string;
  category: CategoryId; // icebreakers | speed | guessing | estimation | funny | developer | creative | word | competitive
  description: string;
  icon: string;         // emoji
  status: 'live' | 'coming-soon';
  route: string;        // live → real route (/create for planning-poker); coming-soon → /games/<id>
  players: string;      // display string, e.g. '3–20 players'
  duration: string;     // display string, e.g. '5 min'
}
```

- **Planning Poker** (→ `/create`), **Would You Rather** and **Most Likely
  To** (both → `/games/<id>`, their own create pages) are the three `live`
  games. A live game whose `route` is `/games/<id>` renders its own page
  instead of redirecting (the dynamic `[gameId]` route only redirects live
  games that live elsewhere).
- `GameCatalog` is the single rendering component (homepage + `/games`),
  with instant search (name + description + category) and category filter
  chips; both homepage and `/games?cat=<id>` preselects work.
- Shipping a new game = implement it, then flip `status: 'coming-soon'` to
  `'live'` and set `route` — the homepage, catalog and routes adapt with no
  further changes.
- Tests: `tests/unit/lib/games.test.ts` (registry integrity: 110 games, 9
  categories, unique ids/names, per-category counts), `GameCard`,
  `GameCatalog` (search / filter / empty state / View-all links), and the
  `homepage.spec.ts` Playwright suite.

## Shared game infrastructure

New competitive games are built incrementally — one at a time, in the order
of [`games.md`](../games.md) — on top of a small set of shared modules. The
games themselves keep game-specific rules and server logic; the shared layer
provides the *infrastructure* (scoring, leaderboard, celebration), never the
rules.

### Scoring contract (`src/lib/scoring.ts`)

Default ranking-based scoring (games may override the points table per
round):

| Place  | 1st | 2nd | 3rd | 4th | 5th | 6th+ |
| ------ | --- | --- | --- | --- | --- | ---- |
| Points | 100 | 80  | 60  | 40  | 20  | 10   |

- **Tie handling** — *standard competition ranking*: equal scores share the
  same rank and the next rank is skipped (scores `100/80/80/60` → ranks
  `1/2/2/4`). Tied players always receive identical points; no arbitrary
  rankings.
- `buildLeaderboard(players)` ranks by `totalScore` (secondary sort by name
  for determinism) and carries `roundScore` as the `delta` shown in the UI.
- `applyRound(players, roundPoints)` replaces `roundScore` with the newly
  awarded points and accumulates `totalScore`; it never mutates its inputs.
- `mergeLeaderboards(boards)` sums scores per player across boards — the
  foundation for a future **Game Night** multi-game session with one overall
  champion.
- Scores are **never trusted from the client**: the server validates answers
  and awards points; these helpers only derive display state.

### Shared data models (`src/lib/gameTypes.ts`)

```ts
GamePhase = 'lobby' | 'playing' | 'roundEnd' | 'gameEnd';
PlayerGameStatus = 'joined' | 'ready' | 'playing' | 'answered' | 'waiting'
                 | 'disconnected' | 'reconnected' | 'eliminated' | 'winner';

GamePlayer { playerId, name, hue, isHost, isConnected, status,
             roundScore, totalScore }
LeaderboardEntry { playerId, name, hue, rank, score, delta?, isMe? }
RoundResult { round, roundPoints: Record<playerId, points>, leaderboard }
```

### Reusable components (`src/components/games`)

- **`Leaderboard`** — ranked board with 🥇/🥈/🥉 medals (rank ≥ 4 shows the
  number), avatar initials, an animated total counter
  (`useAnimatedNumber`, reduced-motion aware) and "+N" round-delta chips.
  Empty state, `myId` highlight, `compact` podium variant.
- **`WinnerModal`** — end-of-game celebration: confetti (reuses
  `Celebration`, replays per open), a winner banner with animated score,
  the full medal podium, and Play Again / Back to Games actions.
- **`useGameSession`** (`src/lib/useGameSession.ts`) — the client-side
  game lifecycle hook: derives the ranked leaderboard from the server's
  `GamePlayer[]`, auto-opens the `WinnerModal` the moment the server marks
  the session `ended` (and re-arms for the next session after Play Again),
  and routes Play Again / dismissal. Server-authoritative — the hook only
  reacts to server state, never computes scores.

### Development process

1. Take the first `⬜` game from `games.md`; define objective, states,
   scoring and end condition.
2. Implement on the existing room architecture (server-authoritative
   rules, snapshot → Redux bridge, same `/r/<CODE>` rooms).
3. Wire scoring through `lib/scoring.ts`, the scoreboard through
   `Leaderboard`, the end state through `WinnerModal` driven by
   `useGameSession`.
4. Test (unit rules/scoring/ties, component UI, Playwright multiplayer),
   flip `status: 'live'` in `src/lib/games.ts`, mark ✅ in `games.md`,
   then **stop** — the next game starts only on explicit request.

## Data models

```ts
// Room (server, in-memory)
{
  code: string;
  hostId: string | null;
  teamName: string;                 // '' unless set at creation
  roomTitle: string;                // '' unless set at creation
  createdAt: number;
  game: 'planning-poker' | 'would-you-rather' | 'most-likely-to';
  questions: WyrQuestion[];         // WYR deck ({ a, b } pairs, ≤ 20); [] for poker
  questionIndex: number;            // active WYR question; -1 until the round starts
  prompts: string[];                // MLT deck (≤ 12); [] for other games
  promptIndex: number;              // active MLT prompt; -1 until the session starts
  mltScores: Record<string, number>;// MLT session totals (survive Play Again)
  mltResult: MltRoundResult | null; // { points, counts, winners, predictors } at reveal
  sessionOver: boolean;             // true after the MLT host finishes the final round
  settings: {
    deckId: DeckId;                 // one of the five above
    timerSec: number | null;        // 10 | 15 | 30 | null (Off)
    accent: Accent;                 // 'gold' | 'purple' | 'blue' | 'green'
    revealMode: RevealMode;         // 'normal' | 'staggered' | 'dramatic'
  };
  locked: boolean;                  // host-only; refuses brand-new joiners
  participants: Map<string, Participant>;
  status: 'waiting' | 'voting' | 'ended' | 'revealed';
  votes: Record<string, string>;    // participantId -> card value
  stats: Stats | null;              // computed at reveal
  timer: { durationSec: number; endsAt: number } | null;
  emptySince: number | null;
}

// Participant
{
  id: string;
  name: string;                     // ≤ 32 chars
  role: 'facilitator' | 'voter';
  status: 'connected' | 'voted' | 'disconnected';
  hasVoted: boolean;                // the server-side lock
  joinedAt: number;
  hue: number;                      // 0–359, derived from the name
}

// Stats (server-computed at reveal via computeStats + calculateConsensus)
{
  count: number;                    // votes submitted (non-voters excluded)
  mode: string; modeShare: number; unique: number;
  numeric: boolean;                 // false for T-Shirt
  avg: number | null; median: number | null;
  spread: number | null;            // highest - lowest (numeric only)
  highest: number | null; lowest: number | null; range: number | null;
  level: 'full' | 'strong' | 'moderate' | 'large';
  counts: Array<{ value: string; count: number }>;
}

// WyrQuestion
{
  a: string;                        // option A text
  b: string;                        // option B text
}

// Snapshot (server → client)
{
  code; hostId; teamName; roomTitle; createdAt;
  game: GameId;                     // 'planning-poker' | 'would-you-rather' | 'most-likely-to'
  question: WyrQuestion | null;     // active WYR prompt; null while waiting / for other games
  questionIndex: number;            // 0-based active WYR question
  questionCount: number;            // total questions in this WYR session
  prompt: string | null;            // active MLT prompt; null while waiting / for other games
  promptIndex: number;              // 0-based active MLT prompt
  promptCount: number;              // total prompts in this MLT session
  mltResult: MltRoundResult | null; // null unless the round is revealed
  mltScores: Record<string, number>;// MLT session totals
  sessionOver: boolean;             // MLT session finished → WinnerModal
  settings: { deckId; timerSec; accent; revealMode };
  locked: boolean;
  participants: Participant[];
  status: RoomPhase;
  votedIds: string[];
  everyoneHasVoted: boolean;
  votes: Record<string, string>;    // {} unless status === 'revealed'
  stats: Stats | null;              // null unless status === 'revealed'
  timer: TimerInfo | null;
}
```

All of these mirror the TypeScript types in `src/lib/types.ts`; the server's
JSDoc typedefs in `server/room.mjs` describe the same shapes.

## Consensus algorithm

`calculateConsensus(values)` is a pure, deterministic function in
`server/room.mjs` with these documented thresholds:

| Level     | Condition                                                     |
| --------- | ------------------------------------------------------------- |
| `full`    | exactly **one unique value** (every voter picked the same card) |
| `strong`  | the dominant value holds **≥ 70%** of the votes               |
| `moderate`| the dominant value holds **≥ 45%**, or there are **≤ 3 unique values** |
| `large`   | anything else — wide distribution, weak dominant value        |

The algorithm considers the number of unique values, the dominant-vote
percentage, and (for numeric decks) the numeric spread that feeds the
displayed range. It returns `null` for an empty vote set. The exact numbers
above are the contract — change them in `server/room.mjs` *and* in this
document together. The UI surfaces the verdict as 🎉 Full / 🟢 Strong / 🟡
Moderate / ⚡ Large, celebrates full consensus with confetti, and shows a
*"Worth discussing?"* prompt only for `large` on numeric decks.

## Socket events

| Event               | Direction        | Purpose                                   | Payload                       | Ack |
| ------------------- | ---------------- | ----------------------------------------- | ----------------------------- | --- |
| `room:create`       | Client → Server  | Create a room and seat the host           | `{ hostName?, teamName?, roomTitle?, deckId?, accent?, revealMode?, game?, questions? }` | `{ ok, code, participantId }` |
| `room:join`         | Client → Server  | Join as a participant or projector        | `{ code, name?, role?, id? }` | `{ ok, participantId, snapshot, screen? }` |
| `room:rejoin`       | Client → Server  | Reclaim a seat after refresh/reconnect    | `{ code, participantId, name }` | `{ ok, participantId, snapshot }` |
| `room:settings`     | Client → Server  | Host sets timer and/or reveal mode (waiting only) | `{ timerSec?, revealMode? }` | `{ ok } \| { ok: false, error }` |
| `room:lock`         | Client → Server  | Host locks the room (any phase)           | `{}`                           | `{ ok } \| { ok: false, error }` |
| `room:unlock`       | Client → Server  | Host unlocks the room                     | `{}`                           | `{ ok } \| { ok: false, error }` |
| `voting:start`      | Client → Server  | Host starts the round                     | `{}`                           | `{ ok } \| { ok: false, error }` |
| `vote:cast`         | Client → Server  | Submit a (final) vote                     | `{ value }` (deck card, or `'A'`/`'B'` for WYR) | `{ ok } \| { ok: false, error }` |
| `votes:reveal`      | Client → Server  | Host reveals the round                    | `{}`                           | `{ ok } \| { ok: false, error }` |
| `wyr:next`          | Client → Server  | Host advances to the next WYR question    | `{}`                           | `{ ok, done } \| { ok: false, error }` |
| `mlt:next`          | Client → Server  | Host advances to the next MLT prompt      | `{}`                           | `{ ok, done } \| { ok: false, error }` |
| `mlt:finish`        | Client → Server  | Host marks the MLT session over (WinnerModal) | `{}`                        | `{ ok } \| { ok: false, error }` |
| `mlt:playAgain`     | Client → Server  | Host restarts MLT rounds, keeping session scores | `{}`                   | `{ ok } \| { ok: false, error }` |
| `participant:remove`| Client → Server  | Host removes a participant                | `{ participantId }`            | `{ ok } \| { ok: false, error }` |
| `room:end`          | Client → Server  | Host tears the room down                  | `{}`                           | `{ ok } \| { ok: false, error }` |
| `snapshot`          | Server → Client  | Full room state after any mutation        | `Snapshot`                     | — |
| `room:ended`        | Server → Client  | The room was deleted                      | —                              | — |
| `you:removed`       | Server → Client  | This participant was removed              | —                              | — |

Full reference with failure cases: [API.md](API.md).

## Error handling

- Socket actions use acknowledgement callbacks: `{ ok: true }` or
  `{ ok: false, error: '<code>' }`.
- Error codes: `not_host`, `in_progress`, `not_found`,
  `unknown_participant`, `not_voting`, `already_voted`, `no_value`,
  `bad_value`, `revealed`, `not_all_voted`, `already_revealed`,
  `not_started`, `bad_timer`, `bad_reveal_mode`, `room_locked`,
  `name_taken` (a new joiner — or a returning seat — tried to take a name
  someone else at the table already uses), `cannot_remove`,
  `no_participant`, `not_this_game` (WYR/MLT-only action
  on a poker room), `not_revealed` (`wyr:next`/`mlt:next`/`mlt:finish`
  before the round was revealed), `self_vote` (MLT — you can't nominate
  yourself), `not_finished` (`mlt:playAgain` before the session is over).
- Client-side, `emitAck` rejects after 8 s if the server never answers
  ("Server did not respond"), and forms show inline errors; the room pages
  surface a "room is gone" screen when a room no longer exists.

## Validation

All host-only actions check `actorId === room.hostId`; the vote checks
status, timer expiry, `hasVoted`, and — since the deck is first-class — that
the value is actually allowed for the game: deck cards for Planning Poker
(`bad_value`, mirroring `src/lib/decks.ts`) or exactly `'A'` / `'B'` for
Would You Rather. `wyr:next` additionally requires a WYR room
(`not_this_game`) and a revealed/ended question (`not_revealed`).
`room:settings` additionally validates the timer against
`{10, 15, 30, null}` and the reveal mode against
`{normal, staggered, dramatic}`; `room:create` validates the deck, accent and
reveal mode against the allow-lists (falling back to defaults); `room:join`
rejects brand-new participants in a locked room (`room_locked`) and anyone
(including a returning seat) who tries to take a name already at the table
(`name_taken` — compared case-insensitively after trimming, so `ada` clashes
with `Ada`). See [ARCHITECTURE.md — Security & validation](ARCHITECTURE.md#security--validation).

## Reconnection

Socket.io auto-reconnects; `RealtimeBridge` re-joins via `room:rejoin` and
the server restores `status: 'voted'` for participants with a locked vote.
A participant's identity is a sessionStorage entry scoped to one tab.
Reconnects show a *Reconnected* toast; the vote lock is never bypassed.

## Performance

- Snapshots are small plain objects; broadcasts are per-room channels.
- The client derives the countdown locally from `endsAt` (one 500 ms tick per
  tab) instead of server push per second; timer ticks update only the timer
  badge, not the participant list.
- No chart library: the distribution bars are pure CSS.
- The QR code is a single lightweight SVG rendered locally via `qrcode.react`.

## Scalability considerations

Room state lives **in the memory of one server process**. This is a hard
constraint:

- A server restart loses every room (by design).
- Multiple server instances do **not** share rooms: a second instance would
  need a shared state layer (e.g. Redis adapter) and sticky/layered
  routing — deliberately out of scope today. See
  [DEPLOYMENT.md](DEPLOYMENT.md).

## Deployment architecture

Two processes behind one origin: the Next.js server (static/SSR) and the
Socket.io server, with `NEXT_PUBLIC_SOCKET_URL` pointing at the realtime
server's public URL. WebSocket support is required on the proxy/load
balancer. The QR code is generated in the browser, so no server-side image
endpoints are needed. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full
runbook.
