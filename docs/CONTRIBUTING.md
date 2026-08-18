# Contributing to Reveal

Thanks for helping with Reveal — a deliberately small planning poker app
(no database, no accounts, one room per session with many stories). Keep
changes aligned with that scope: **if it smells like Scrum tooling, it
doesn't belong here.**

---

## 1. Local setup

Requirements: **Node.js 22+** and npm.

```bash
npm install

# one command — Next.js on :3000 + realtime server on :3001
npm run dev
```

Open http://localhost:3000, create a room, and open the share link in a
second tab to see the realtime flow.

### Running pieces separately

```bash
npm run dev:next   # Next.js only
npm run dev:rt     # realtime server only
```

### Environment

Copy `.env.example` → `.env.local` if you need non-default ports or a LAN
URL for testing on a phone/tablet. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 2. Repository layout (the parts that matter)

```
src/
├── app/                  # routes: /, /create, /r/[roomCode], /r/[roomCode]/screen
├── components/           # UI; room/ holds the voting flow components
│   ├── room/             # Deck, StartPanel, RevealBar, EndedPanel, ResultsPanel,
│   │                     # PresentationView, ParticipantsPanel, TimerBadge, JoinForm
│   ├── modals/           # EndSessionModal, RemoveParticipantModal
│   └── RoomQR.tsx        # local QR of the invite URL (qrcode.react, no external service)
├── lib/                  # cx, decks (central deck config), identity, socket, errors, types
├── store/                # Redux store + 5 slices; actions.ts bridges sockets → redux
└── styles/               # SCSS tokens/mixins/animations (CSS Modules), accent presets
server/
├── index.mjs             # Socket.io wiring, timers, room expiry (no business rules)
└── room.mjs              # PURE room-state logic — the server rules, unit-tested

tests/                    # Vitest (unit + components)
docs/                     # architecture, PRD, API, testing, deployment, …
```

**The golden rule of this codebase:** all rules that matter live in
`server/room.mjs` and are enforced there. The client is a thin, optimistic
view. New server behavior goes into `room.mjs` (pure functions, JSDoc-typed),
and `index.mjs` only wires sockets to them.

---

## 3. Coding conventions

- **TypeScript (strict)** in `src/`. Server code is plain ESM (`*.mjs`) with
  JSDoc typedefs — keep that style; the typecheck (`tsc --noEmit`) validates
  both.
- **SCSS Modules** (`*.module.scss`) for all styling, token-driven via
  `src/styles/_variables.scss`. No inline styles, no CSS-in-JS.
- **Decks are configuration, not code.** Add or change a deck in
  `src/lib/decks.ts` *and* the server's `KNOWN_DECKS`/`NUMERIC_DECKS`
  allow-lists in `server/room.mjs`. Never hard-code deck logic in a
  component.
- **Redux Toolkit** for state — one slice per concern (`room`, `participants`,
  `voting`, `timer`, `ui`). Prefer selectors over deriving in components.
- The **only** socket consumer is `src/components/RealtimeBridge.tsx`; it
  turns `snapshot` broadcasts into Redux actions. Don't add a second bridge.
- Keep the state machine minimal: `WAITING → VOTING → (ENDED) → REVEALED →
  WAITING` (`room:newRound`). Multiple rounds per room are supported; within
  a round there is no revote and no vote editing.
- Name socket events and errors with the existing vocabulary
  (`room:*`, `voting:*`, `vote:*`, `votes:*`, ack `{ ok, error }` codes).
- If you change a **consensus threshold** or a **statistics rule**, update
  `server/room.mjs`, `docs/TRD.md` (the algorithm is documented there), and
  the unit tests together.

---

## 4. Branching & commits

- Branch per change: `fix/timer-sync`, `feat/copy-link`, etc. Keep branches
  short-lived.
- Commit messages: short imperative summary, optionally a body explaining
  *why*. Conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`,
  `refactor:`) are welcome but not required.
- One logical change per commit. No stray formatting churn.

---

## 5. Testing requirements

Every change ships with or updates tests:

```bash
npm run lint            # ESLint 9 flat config (eslint-config-next)
npx tsc --noEmit        # typecheck
npm test                # Vitest — unit + component (jsdom)
npm run test:coverage   # Vitest + coverage report
npm run build           # final gate: lint + typecheck + production build
```

### Rules of thumb

- **Server rule changed?** Extend `tests/unit/server/room.test.ts`.
- **Deck or statistics changed?** Extend `tests/unit/lib/decks.test.ts` and
  the stats/consensus tests in `tests/unit/server/room.test.ts`.
- **Reducer/action changed?** Extend the slice's test in `tests/unit/store/`.
- **Component behavior changed?** Extend the matching test in
  `tests/components/` (React Testing Library + user-event).
- **User-facing flow changed?** Extend the matching component test in
  `tests/components/` — prefer exact roles/text (`getByRole(..., { exact:
  true })`) to avoid substring traps.
- **Client-only UI change?** Vitest + jsdom is enough for cosmetic tweaks.

Never leave a failing test, and don't weaken an assertion to make it pass.

---

## 6. Pull requests

- Describe **what** changed and **why**, and how you validated it (list the
  commands you ran).
- Keep PRs small and focused; a PR that touches both server rules and
  unrelated UI is two PRs.
- Reference any doc that needs a refresh: if behavior changed, update the
  affected `docs/*.md` in the same PR (docs must always match the code).
- The checklist before requesting review:
  - [ ] `npm run lint` clean
  - [ ] `npx tsc --noEmit` clean
  - [ ] `npm test` green
  - [ ] `npm run build` green

---

## 7. Review expectations

Reviewers check the *rules*, not the prose:

1. Is the new behavior enforced in `server/room.mjs` (not just the UI)?
2. Does the snapshot keep vote values private until `REVEALED`?
3. Are host-only actions guarded by `actorId === room.hostId`?
4. Is the room-lock gate applied at join time, not only in the UI?
5. Do deck/stats/consensus changes stay configuration- and data-driven?
6. Does the change respect the multi-round / no-revote-within-a-round
   product scope (host-only `room:newRound`, server-validated)?
7. Are tests asserting behavior, and do they fail if the rule regresses?

---

## 8. Troubleshooting

| Symptom                              | Fix                                             |
| ------------------------------------ | ----------------------------------------------- |
| Typecheck fails after editing `*.mjs`| Keep JSDoc typedefs in `server/room.mjs` accurate; the checks flow from them |
| A deck change doesn't render         | Update `src/lib/decks.ts` AND `server/room.mjs` `KNOWN_DECKS`/`NUMERIC_DECKS` together |
| `.next` corruption after a route move| Stop dev servers, `rm -rf .next`, restart (`next dev` rebuilds) |
