# Testing Guide — Reveal

Reveal is tested with **Vitest** (unit + component tests, jsdom). There is no
browser E2E suite — all behavior is covered at the unit and component level.

| Level                  | Runner | What it covers                                | Command    |
| ---------------------- | ------ | --------------------------------------------- | ---------- |
| Unit + component tests | Vitest | Pure logic (lib, server room rules) and UI behavior | `npm test` |

```
Unit Tests        → every rule, reducer, and pure function in isolation
Component Tests   → user-visible behavior of critical UI (jsdom)
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

Components that talk to the socket use a stubbed socket module
(`vi.mock('@/lib/socket')`), while the server's rules are covered directly
against the pure `server/room.mjs` functions.

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
- Polyfills jsdom gaps the app uses: `requestAnimationFrame`
  (DistributionChart), `navigator.clipboard` (copy invite link).
- Auto-runs Testing Library `cleanup()` after every test.

### Helpers

- `tests/helpers/store.tsx` — `makeStore(partialState)` builds a fresh store
  per test with each slice merged over its real initial state; `renderWithStore`
  renders a component inside a Redux `Provider`. This mirrors the wiring in
  `src/store/index.ts`.
- `tests/helpers/fixtures.ts` — `makeParticipant()` and `makeSnapshot()`
  builders for realistic, privacy-aware snapshots.
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
- `src/lib/*` — cx, decks, identity, socket, errors, roomActions.

Don't chase 100% in presentational components or modal chrome; prioritize
behavior that would hurt users if it regressed.

### Test files

```
tests/
├── setup.ts                 # jest-dom + polyfills + auto-cleanup
├── helpers/                 # store.tsx, fixtures.ts, types.ts
├── unit/
│   ├── lib/                 # cx, decks, identity, roomActions, errors, socket helpers
│   ├── server/room.test.ts  # the entire server state machine + rules
│   └── store/               # roomSlice, participantsSlice, votingSlice, timerSlice, uiSlice
└── components/              # Field, Button, DistributionChart, Deck, StartPanel,
                             # RevealBar, EndedPanel, ParticipantsPanel,
                             # ResultsPanel, PresentationView, JoinForm,
                             # RoomQR, CreatePage, HomePage
```

---

## 3. Critical scenarios (the rules that must never break)

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
   while existing members keep their seats and votes; unlock re-opens it.
9. **Statistics** — computed from submitted votes only; non-voters excluded
   from math but shown as "Didn't vote".
10. **Disconnected non-voters** — never deadlock the room (`everyoneHasVoted`
    counts only present participants).

---

## 4. CI recommendations

A minimal CI pipeline runs, in order:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test                 # unit + component (fast, jsdom)
npm run build
```
