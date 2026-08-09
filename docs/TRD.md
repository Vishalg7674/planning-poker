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
| `/`                      | Marketing hero, "create a room" CTA, join-by-code   |
| `/create`                | Host name form → creates the room and navigates to `/r/<CODE>` |
| `/r/[roomCode]`          | The room: waiting → voting → ended → revealed, plus the participant side panel |
| `/r/[roomCode]/screen`   | Read-only projector view (joins the socket as `role: 'screen'`) |

### Components (`src/components`)

- Primitives: `Button`, `Field`/`Input`/`Textarea`/`Select`, `Modal`, `Avatar`,
  `Wordmark`, `ThemeToggle`, `ConnectionPill`, `Toasts`, `Celebration`,
  `DistributionChart`.
- Room (`src/components/room`): `Deck` (the voting cards), `StartPanel`
  (waiting room), `RevealBar` (live counter + reveal button), `EndedPanel`,
  `ResultsPanel` (reveal + stats), `ParticipantsPanel`, `TimerBadge`,
  `HostToolbar` (end session), `JoinForm`, hook `useShortcuts`
  (Space = reveal, 1–9 = vote).
- Modals (`src/components/modals`): `EndSessionModal`, `RemoveParticipantModal`.
- `providers.tsx` — Redux `Provider` + theme sync; `RealtimeBridge.tsx` — the
  socket → Redux bridge.

### Hooks

- `useRoomShortcuts` — keyboard: Space reveals when the host may, number keys
  vote by deck position while voting is live. Ignored while typing or with a
  modal open.
- `useAppDispatch` / `useAppSelector` / `useAppStore` — typed Redux hooks.

### Redux

See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md). Five slices: `room`,
`participants`, `voting`, `timer`, `ui`.

### SCSS

- Token-driven: `src/styles/_variables.scss` (colors as CSS custom
  properties), `_mixins.scss`, `_animations.scss`, `globals.scss`.
- All component styles are CSS Modules (`*.module.scss`) with
  `@use 'styles/variables'` (via `sassOptions.includePaths: ['src']`).
- Dark/light theming via a `data-theme` attribute on `<html>`.

## Backend / realtime architecture

- `server/index.mjs` — `node:http` + Socket.io with CORS from
  `SOCKET_ORIGIN`; a `Map<code, Room>`; the 500 ms countdown sweep; the
  30 s room-expiry sweep; per-socket room/participant bookkeeping.
- `server/room.mjs` — the pure state machine and rules (unit-tested):
  `createRoom`, `addParticipant`, `hueFromString`, `computeStats`,
  `everyoneHasVoted`, `buildSnapshot`, `startVoting`, `castVote`, `reveal`,
  `setTimerSec`, `removeParticipant`, `disconnectParticipant`,
  `promoteHostIfNeeded`, `genCode`.
- Rooms are identified by a 5-character code from
  `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.

## State machine

```
WAITING → VOTING → (ENDED) → REVEALED
```

See [ARCHITECTURE.md — Room lifecycle](ARCHITECTURE.md#room-lifecycle).

## Data models

```ts
// Room (server, in-memory)
{
  code: string;
  hostId: string | null;
  teamName: string;                 // '' unless set at creation
  createdAt: number;
  settings: { deckId: DeckId; timerSec: number | null }; // 10 | 15 | 30 | null (Off)
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

// Stats (server-computed)
{
  count: number;                    // votes submitted (non-voters excluded)
  mode: string; modeShare: number; unique: number;
  avg: number | null; median: number | null; spread: number | null;
  level: 'full' | 'strong' | 'some' | 'large';
  counts: Array<{ value: string; count: number }>;
}

// Snapshot (server → client)
{
  code; hostId; teamName; createdAt;
  settings: { deckId; timerSec };
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

## Socket events

| Event               | Direction        | Purpose                                   | Payload                       | Ack |
| ------------------- | ---------------- | ----------------------------------------- | ----------------------------- | --- |
| `room:create`       | Client → Server  | Create a room and seat the host           | `{ hostName?, teamName?, deckId? }` | `{ ok, code, participantId }` |
| `room:join`         | Client → Server  | Join as a participant or projector        | `{ code, name?, role?, id? }` | `{ ok, participantId, snapshot, screen? }` |
| `room:rejoin`       | Client → Server  | Reclaim a seat after refresh/reconnect    | `{ code, participantId, name }` | `{ ok, participantId, snapshot }` |
| `room:settings`     | Client → Server  | Host sets the timer (waiting room only)   | `{ timerSec: 10 \| 15 \| 30 \| null }` | `{ ok } \| { ok: false, error }` |
| `voting:start`      | Client → Server  | Host starts the round                     | `{}`                           | `{ ok } \| { ok: false, error }` |
| `vote:cast`         | Client → Server  | Submit a (final) vote                     | `{ value }`                    | `{ ok } \| { ok: false, error }` |
| `votes:reveal`      | Client → Server  | Host reveals the round                    | `{}`                           | `{ ok } \| { ok: false, error }` |
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
  `revealed`, `not_all_voted`, `already_revealed`, `not_started`,
  `bad_timer`, `cannot_remove`, `no_participant`.
- Client-side, `emitAck` rejects after 8 s if the server never answers
  ("Server did not respond"), and forms show inline errors; the room pages
  surface a "room is gone" screen when a room no longer exists.

## Validation

All host-only actions check `actorId === room.hostId`; the vote checks
status, timer expiry, and `hasVoted`; `room:settings` additionally validates
the timer against `{10, 15, 30, null}`. See
[ARCHITECTURE.md — Security & validation](ARCHITECTURE.md#security--validation).

## Reconnection

Socket.io auto-reconnects; `RealtimeBridge` re-joins via `room:rejoin` and
the server restores `status: 'voted'` for participants with a locked vote.
A participant's identity is a sessionStorage entry scoped to one tab.

## Performance

- Snapshots are small plain objects; broadcasts are per-room channels.
- The client derives the countdown locally from `endsAt` (one 500 ms tick per
  tab) instead of server push per second.
- No chart library: the distribution bars are pure CSS.

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
balancer. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full runbook.
