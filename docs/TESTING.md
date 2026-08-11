# Testing Guide — Reveal

Reveal is tested at three levels. Each level is a separate suite with its own
runner, so you can run exactly the layer you are working on.

| Level                    | Runner     | What it covers                                      | Command             |
| ------------------------ | ---------- | --------------------------------------------------- | ------------------- |
| Unit + component tests   | Vitest     | Pure logic (lib, server room rules) and UI behavior | `npm test`          |
| Realtime protocol tests  | Node script| Server-authoritative rules over real sockets        | `npm run test:realtime` |
| Browser E2E              | Playwright | The whole app in a real browser, multi-user         | `npm run test:e2e`  |

```
Unit Tests        → every rule, reducer, and pure function in isolation
Component Tests   → user-visible behavior of critical UI (jsdom)
Realtime tests    → the socket contract, multi-client, against a live server
E2E Tests         → the real Next.js app + realtime server in Chrome
```

---

## 1. Testing strategy

- **Unit tests** target behavior, not implementation. They assert on the
  *rules* the product promises: vote lock, host permissions, timer expiry,
  reveal gating, statistics, deck handling, consensus levels, snapshot
  privacy, room lock.
- **Component tests** render components with React Testing Library in jsdom
  and assert on roles, text, and aria attributes — never on class names. SCSS
  modules are **not** processed by Vitest (`css: false`), so component tests
  are fast and independent of sass.
- **Realtime tests** (`scripts/e2e.mjs`) connect several real
  `socket.io-client` sockets to a running `server/index.mjs` and exercise the
  full protocol (146 checks) including privacy, the server-side vote lock,
  room lock/unlock, deck validation, accent/reveal-mode settings, and the
  full Would You Rather round loop.
- **E2E tests** (Playwright) drive the real Next.js app in Chrome with
  separate browser contexts per user. They verify what a user actually sees,
  not internal state.

Nothing in the test stack mocks the Socket.io server for unit/component
tests: components that talk to the socket use a stubbed socket module, while
the server's rules are covered directly against `server/room.mjs` and over
the wire by the realtime suite.

---

## 2. Vitest

### Configuration (`vitest.config.ts`)

| Setting           | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| Environment       | `jsdom`                                                      |
| Setup file        | `tests/setup.ts`                                             |
| Alias             | `@` → `src/` (matches the TypeScript `paths`)                |
| Test discovery    | `tests/unit/**/*.test.{ts,tsx}` and `tests/components/**/*.test.{ts,tsx}` |
| Coverage provider | `v8`, reporters `text` / `html` / `lcov`                     |
| Coverage scope    | `src/lib/**`, `src/store/**`, `src/components/**`, `server/room.mjs` |
| Coverage excludes | `src/components/modals/**`, `src/styles/**`                  |
| Mock lifecycle    | `restoreMocks: true`, `clearMocks: true`                     |

### Setup (`tests/setup.ts`)

- Imports `@testing-library/jest-dom/vitest` (matchers like `toBeInTheDocument`).
- Polyfills jsdom gaps the app uses: `matchMedia` (theme), `requestAnimationFrame`
  (DistributionChart), `navigator.clipboard` (copy invite link).
- Auto-runs Testing Library `cleanup()` after every test.

### Helpers

- `tests/helpers/store.tsx` — `makeStore(partialState)` builds a fresh store
  per test with each slice merged over its real initial state; `renderWithStore`
  renders a component inside a Redux `Provider`. This mirrors the wiring in
  `src/store/index.ts`.
- `tests/helpers/fixtures.ts` — `makeParticipant()` and `makeSnapshot()`
  builders for realistic, privacy-aware snapshots (with the extended
  settings shape and the new deck ids).
- `tests/helpers/types.ts` — test-side type helpers.

### Running

```bash
npm test                 # single run
npm run test:watch       # watch mode
npm run test:coverage    # single run + coverage report (html in coverage/)
```

### Coverage expectations

Coverage is a *guide*, not a gate. The project aims for strong coverage of:

- `src/store/slices/*` — every reducer/action path (all five slices, including
  the presentation flag in `uiSlice`).
- `server/room.mjs` — every server rule (vote lock, reveal gates, timer,
  stats, consensus, deck fallbacks, room lock).
- `src/components/room/*` — Deck, StartPanel, RevealBar, EndedPanel,
  ParticipantsPanel, ResultsPanel, PresentationView, JoinForm.
- `src/lib/*` — cx, decks, identity, theme, stats helpers.

Don't chase 100% in presentational components or modal chrome; prioritize
behavior that would hurt users if it regressed.

### Test files

```
tests/
├── setup.ts                 # jest-dom + polyfills + auto-cleanup
├── helpers/                 # store.tsx, fixtures.ts, types.ts
├── unit/
│   ├── lib/                 # cx, decks, identity, theme
│   ├── server/room.test.ts  # the entire server state machine + rules
│   └── store/               # roomSlice, participantsSlice, votingSlice, timerSlice, uiSlice
├── components/              # Field, Button, DistributionChart, Deck, StartPanel,
│                            # RevealBar, EndedPanel, ParticipantsPanel,
│                            # ResultsPanel, PresentationView, JoinForm,
│                            # RoomQR, CreatePage, WyrRoom, WyrCreatePage
└── e2e/                     # Playwright specs (see below; excluded from Vitest)
```

---

## 3. Realtime protocol tests (`npm run test:realtime`)

`scripts/e2e.mjs` is a headless multi-client suite (146 checks) that connects
host, voter, observer, and screen sockets to a **live** `server/index.mjs`
and verifies the wire contract end to end:

- Room creation with customization: team name, room title, deck, accent and
  reveal mode validated against the allow-lists; unknown values fall back to
  defaults.
- Deck validation (5 decks, defaults to Fibonacci); timer validation (only
  Off/10/15/30; non-host rejected); reveal-mode validation.
- Voting closed before start; start flips `WAITING → VOTING`.
- **Vote lock**: first vote accepted, second rejected (`already_voted`).
- **Privacy**: `votedIds` visible pre-reveal, `votes` empty, `stats` null.
- Reveal gating: `not_all_voted` while someone is thinking; reveal from
  `VOTING` once everyone voted; reveal rejected for non-host.
- Timer expiry flips `VOTING → ENDED`; late votes rejected; reveal then allowed.
- **Room lock**: `room:lock` then a brand-new join is rejected
  (`room_locked`); the existing participant can still rejoin; `room:unlock`
  re-opens the door.
- Stats for non-numeric decks (T-Shirt: `numeric: false`, null numeric stats,
  mode + counts) and consensus levels (full / strong / moderate / large).
- `room:end` wipes memory; removed participants get `you:removed`; screen
  (`role: 'screen'`) sockets watch without seating and cannot vote.
- Disconnected non-voters don't deadlock `everyoneHasVoted`.
- **Would You Rather**: room created with `game: 'would-you-rather'` and a
  question deck (broadcast as `questionCount`, active `question` hidden
  while waiting); picks restricted to `'A'`/`'B'` (`bad_value` otherwise)
  with a per-question lock; the host reveals mid-question (host-paced);
  `wyr:next` is host-only, wipes the votes, advances the question, and
  returns `done: true` on the exhausted deck.

Run it against a server on a custom port:

```bash
SOCKET_PORT=3211 node server/index.mjs &   # one terminal
E2E_URL=http://localhost:3211 npm run test:realtime   # another
```

(The Playwright web server does not reuse this — it starts its own copy.)

---

## 4. Playwright E2E

### Configuration (`playwright.config.ts`)

| Setting          | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| `testDir`        | `tests/e2e`                                                  |
| Browser          | Chromium via the system Chrome (`channel: 'chrome'`) — no bundled download needed |
| `baseURL`        | `http://localhost:3100`                                      |
| Timeout          | 60 s per test, 10 s per expectation                          |
| Parallelism      | `fullyParallel: false`, `workers: 1` (countdown/reveal assertions stay deterministic) |
| Artifacts        | `trace: retain-on-failure`, screenshot on failure only       |
| Retries          | 2 on CI, 0 locally                                           |

`webServer` starts **two** processes before the suite and stops them after:

1. The realtime server on **:3211** (`SOCKET_PORT=3211`).
2. Next.js dev on **:3100**, pointed at that realtime server
   (`NEXT_PUBLIC_SOCKET_URL=http://localhost:3211`) and built into an
   isolated `NEXT_DIST_DIR=.next-e2e` so it never corrupts the `.next` cache
   of a concurrently running `npm run dev`.

Ports deliberately avoid the developer's default stack (Next :3000 +
realtime :3001).

### Multi-user modeling

Each user is a **separate browser context** (like a separate browser tab with
its own sessionStorage identity). `tests/e2e/helpers.ts` provides small
reusable steps:

```ts
const host = await newContext(browser);          // fresh identity
await createRoom(host, 'Vishal');                // host creates + sees invite screen
await joinRoom(participant, roomUrl, 'Rahul');   // participant joins by link
await startVoting(host);
await submitVote(participant, '8');
await revealVotes(host);
```

### Specs

| Spec                          | Verifies                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ |
| `create-room.spec.ts`         | Create → invite screen: room code, copy-invite, host listed               |
| `join-room.spec.ts`           | Second context joins by URL; both sides see each other                    |
| `lobby-customization.spec.ts` | Host sets team name / room title / deck / accent; everyone sees the configuration |
| `decks.spec.ts`               | Each of the five decks renders its cards correctly                        |
| `presence.spec.ts`            | Joined / Thinking / Voted / Disconnected presence updates live for everyone |
| `room-lock.spec.ts`           | Locked room rejects a new joiner; existing members stay; unlock lets joiners in |
| `qr-invite.spec.ts`           | QR + copy-invite render and encode the actual room URL                    |
| `voting-flow.spec.ts`         | Full journey: start → vote → reveal → results + stats                     |
| `vote-lock.spec.ts`           | Vote 8 → second pick 13 fails → still 8 (UI *and* server)                |
| `vote-privacy.spec.ts`        | Host sees "Voted" but never the value before reveal                       |
| `everyone-voted.spec.ts`      | `1 / 2 voted` → reveal disabled → `2 / 2 voted` → reveal enabled          |
| `timer.spec.ts`               | 10s / 15s / 30s: countdown runs, expiry stops voting, reveal unlocks      |
| `results.spec.ts`             | Revealed values, "Didn't vote", average/median/mode/highest/lowest/range/distribution |
| `presentation.spec.ts`        | Host enters presentation mode, drives the round from the big view, reveals |
| `permissions.spec.ts`         | Participants never see host controls; host-only start/reveal              |
| `would-you-rather.spec.ts`    | Full WYR flow: create from a question deck → join → pick A/B (locked) → host sees who picked → reveal split → next question (votes reset) → end session; non-voters; no host controls for participants |
| `homepage.spec.ts`            | (updated) two LIVE badges — Planning Poker + Would You Rather; WYR card leads to its create page |

### Running

```bash
npm run test:e2e            # headless (starts its own servers)
npm run test:e2e:headed     # watch it run in Chrome
npm run test:e2e:ui         # Playwright UI mode (debug / step through)
npx playwright test tests/e2e/timer.spec.ts   # one spec
```

### Debugging failures

- `trace: retain-on-failure` writes a trace per failing test under
  `test-results/` — open it with `npx playwright show-trace <path>`.
- Screenshots and an error-context snapshot land in `test-results/` on failure.
- With `workers: 1` and sequential flows, flakiness is usually a selector
  matching too broadly — prefer `getByRole(..., { exact: true })` and
  `getByText(..., { exact: true })` (e.g. `Vote 8` also matches `Vote 89`,
  and a stat label like "Highest" can match both the stats row and the
  highlight tag).

---

## 5. Critical scenarios (the rules that must never break)

1. **Vote lock** — one vote per participant, forever. Server rejects the
   second `vote:cast`; the UI shows the locked card and disables the rest.
2. **Vote privacy** — before reveal, `snapshot.votes` and `snapshot.stats`
   are empty; only `votedIds` reveals *who* voted.
3. **Host permissions** — only the host can start, reveal, remove, lock,
   unlock, end, or change settings. Every one of these is checked server-side.
4. **Reveal gating** — timer off: all present participants must have voted;
   timer on: also allowed after the timer ends the round. Never before.
5. **Timer** — Off / 10 / 15 / 30 only; the server owns `endsAt` and flips
   `VOTING → ENDED`; late votes are rejected.
6. **Decks** — all five decks render; unknown deck ids fall back to
   Fibonacci; `½` parses as `0.5`; T-Shirt rounds never show a numeric
   average.
7. **Consensus** — full / strong / moderate / large thresholds are
   deterministic and unit-tested.
8. **Room lock** — a locked room refuses brand-new joiners (`room_locked`)
   while existing members keep their seats and votes; unlock re-opens it.9. **Statistics** — computed from submitted votes only; non-voters excluded
    from math but shown as "Didn't vote".
10. **Disconnected non-voters** — never deadlock the room (`everyoneHasVoted`
    counts only present participants).
11. **WYR per-question lock** — a participant picks once per question
    (`already_voted` on a second pick); `wyr:next` wipes the votes so the
    lock re-arms for the next question; the host reveals at their own pace;
    picks stay private until the reveal.

---

## 6. CI recommendations

A minimal CI pipeline runs, in order:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test                 # unit + component (fast, jsdom)
npm run test:coverage    # and gate on a coverage floor if you like
npm run test:realtime    # needs a server on :3001 or set E2E_URL
npm run test:e2e         # Playwright; set CI=1 to enable retries
npm run build
```

Notes for CI:

- Playwright uses the system Chrome via `channel: 'chrome'`. On a bare CI
  runner either pre-install Chrome or switch the project to the bundled
  Chromium: `npx playwright install --with-deps chromium` and drop the
  `channel` from `playwright.config.ts`.
- Run the three suites in separate jobs if the runner is shared — the
  Playwright suite already isolates its own ports (:3100 / :3211).
- `workers: 1` keeps the countdown assertions deterministic on slow runners.
