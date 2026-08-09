# Realtime API reference

Reveal has no HTTP API — the "API" is the Socket.io protocol between the
browser and `server/index.mjs`. Every client-initiated event uses an
**acknowledgement callback**; the server responds with `{ ok: true }` or
`{ ok: false, error: '<code>' }`. After any successful mutation the server
broadcasts a full `snapshot` to the room.

## Connection

- URL: `NEXT_PUBLIC_SOCKET_URL` (default `http://localhost:3001`).
- Transports: WebSocket first, polling fallback.
- CORS: origins from `SOCKET_ORIGIN` (comma-separated).

---

## Client → Server events

### `room:create`

Create a room and seat the creator as host. All configuration is fixed at
creation.

| Field       | Type     | Notes                                                       |
| ----------- | -------- | ----------------------------------------------------------- |
| `hostName`  | string?  | Host display name (falls back to `"Host"`)                  |
| `teamName`  | string?  | Optional, ≤ 40 chars                                        |
| `roomTitle` | string?  | Optional, ≤ 60 chars                                        |
| `deckId`    | string?  | `fibonacci` \| `modifiedFibonacci` \| `sequential` \| `tshirt` \| `powersOfTwo`; unknown → `fibonacci` |
| `accent`    | string?  | `gold` \| `purple` \| `blue` \| `green`; unknown → `gold`    |
| `revealMode`| string?  | `normal` \| `staggered` \| `dramatic`; unknown → `staggered`|

- **Response**: `{ ok: true, code, participantId }`
- **Failure**: `{ ok: false, error }` (e.g. server error)
- **Authorization**: none (anyone can create a room)

### `room:join`

Join an existing room as a participant — or as a read-only projector.

| Field | Type    | Notes                                                      |
| ----- | ------- | ---------------------------------------------------------- |
| `code`| string  | Room code (case-insensitive, uppercased server-side)       |
| `name`| string? | Display name (participant only)                            |
| `role`| string? | `'screen'` joins as a projector: no seat, receives snapshots, cannot vote |
| `id`  | string? | Existing participant id (rejoin the same seat)             |

- **Response**: `{ ok: true, participantId, snapshot, screen?: true }`
- **Failure**:
  - `not_found` — room doesn't exist
  - `room_locked` — the host locked the room and this is a **brand-new**
    participant (no matching `id`); existing participants and projector
    screens are still admitted
- **Authorization**: none

### `room:rejoin`

Reclaim a seat after a refresh or reconnect. Locked rooms still admit their
own participants — only strangers are refused (see `room:join`).

| Field          | Type   | Notes                          |
| -------------- | ------ | ------------------------------ |
| `code`         | string | Room code                      |
| `participantId`| string | The id stored in sessionStorage|
| `name`         | string?| Updated display name           |

- **Response**: `{ ok: true, participantId, snapshot }`
- **Failure**:
  - `not_found` — room expired; the client shows the "room is gone" screen
  - `unknown_participant` — stale identity; the client drops it and shows the
    join form

### `room:settings`

Host sets the voting timer and/or the reveal animation mode. Waiting room
only.

| Field        | Type | Notes                                                |
| ------------ | ---- | ---------------------------------------------------- |
| `timerSec`   | `10` \| `15` \| `30` \| `null` | `null` = Off |
| `revealMode` | `normal` \| `staggered` \| `dramatic` | optional; omitted fields are left unchanged |

- **Response**: `{ ok: true }`
- **Failure**: `not_host` · `in_progress` (round already started) ·
  `bad_timer` (anything outside Off/10/15/30) · `bad_reveal_mode` (unknown
  mode)
- **Authorization**: host only

### `room:lock` / `room:unlock`

Host locks or unlocks the room against new joiners. Allowed in any phase.

- **Payload**: `{}`
- **Response**: `{ ok: true }`
- **Failure**: `not_host`
- **Authorization**: host only
- **Effect**: `room.locked` flips; while locked, brand-new `room:join` calls
  are rejected (`room_locked`), existing participants can still rejoin.

### `voting:start`

Start the round. WAITING only.

- **Payload**: `{}` (the timer comes from `room.settings`, not the payload)
- **Response**: `{ ok: true }`
- **Failure**: `not_host` · `in_progress`
- **Authorization**: host only
- **Effect**: `WAITING → VOTING`; timer armed from settings; snapshot to all.

### `vote:cast`

Submit a vote. **Final and permanent.**

| Field   | Type   | Notes                     |
| ------- | ------ | ------------------------- |
| `value` | string | Any deck value (e.g. `"8"`, `"½"`, `"M"`, `"?"`) |

- **Response**: `{ ok: true }`
- **Failure**:
  - `not_found` — no room or no participant seat
  - `not_voting` — round not live (before start, or after the timer expired;
    a late vote also flips the room to `ended`)
  - `already_voted` — this participant already has a locked vote
  - `no_value` — empty value
  - `bad_value` — the value is not on the room's deck (the server validates
    against the same card list as the client)
  - `revealed` — round is over
- **Authorization**: any seated participant, exactly once

### `votes:reveal`

Reveal the round. Host only.

- **Payload**: `{}`
- **Response**: `{ ok: true }`
- **Failure**: `not_host` · `not_started` (still WAITING) ·
  `not_all_voted` (VOTING and someone is still thinking) ·
  `already_revealed`
- **Authorization**: host only
- **Effect**: `VOTING|ENDED → REVEALED`; snapshot now includes `votes` and
  `stats` (with the consensus verdict).

### `participant:remove`

Host removes a participant.

| Field          | Type   | Notes               |
| -------------- | ------ | ------------------- |
| `participantId`| string | Never the host themself |

- **Response**: `{ ok: true }`
- **Failure**: `not_host` · `cannot_remove` · `no_participant`
- **Authorization**: host only
- **Effect**: participant deleted; their socket gets `you:removed`.

### `room:end`

Host tears down the room.

- **Payload**: `{}`
- **Response**: `{ ok: true }`
- **Failure**: `not_host`
- **Authorization**: host only
- **Effect**: everyone gets `room:ended`; the room is deleted from memory.

---

## Server → Client events

### `snapshot`

Emitted after every mutation. The full privacy-aware room state.

```jsonc
{
  "code": "ABCDE",
  "hostId": "…",
  "teamName": "Frontend Team",
  "roomTitle": "Sprint 24 Planning",
  "createdAt": 1720000000000,
  "settings": {
    "deckId": "modifiedFibonacci",
    "timerSec": 15,
    "accent": "purple",
    "revealMode": "staggered"
  },
  "locked": false,
  "participants": [ { "id": "…", "name": "Ada", "role": "facilitator", "status": "connected", "hasVoted": false, "joinedAt": 1720000000000, "hue": 120 } ],
  "status": "voting",
  "votedIds": [ "…" ],
  "everyoneHasVoted": false,
  "votes": {},          // populated ONLY when status === "revealed"
  "stats": null,        // populated ONLY when status === "revealed"
  "timer": null         // or { "durationSec": 15, "endsAt": 1720000001000 }
}
```

The client's Redux slices hydrate themselves from this single event; the
accent is applied as a `data-accent` attribute on the room root.

### `room:ended`

The host ended the session; the room no longer exists. The client resets its
Redux state and shows the "room is gone" screen.

### `you:removed`

The host removed this participant. The client clears its identity and shows
the removal notice.
