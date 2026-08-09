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

Create a room and seat the creator as host.

| Field     | Type     | Notes                          |
| --------- | -------- | ------------------------------ |
| `hostName`| string?  | Host display name              |
| `teamName`| string?  | Optional, unused by the current UI |
| `deckId`  | string?  | Optional; unknown values fall back to `fibonacci` |

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
- **Failure**: `{ ok: false, error: 'not_found' }` — room doesn't exist
- **Authorization**: none

### `room:rejoin`

Reclaim a seat after a refresh or reconnect.

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

Host sets the voting timer. Waiting room only.

| Field     | Type | Notes                                   |
| --------- | ---- | --------------------------------------- |
| `timerSec`| `10` \| `15` \| `30` \| `null` | `null` = Off |

- **Response**: `{ ok: true }`
- **Failure**: `not_host` · `in_progress` (round already started) ·
  `bad_timer` (anything outside Off/10/15/30)
- **Authorization**: host only

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
| `value` | string | Any deck value (e.g. `"8"`, `"?"`) |

- **Response**: `{ ok: true }`
- **Failure**:
  - `not_found` — no room or no participant seat
  - `not_voting` — round not live (before start, or after the timer expired;
    a late vote also flips the room to `ended`)
  - `already_voted` — this participant already has a locked vote
  - `no_value` — empty value
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
  `stats`.

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
  "teamName": "",
  "createdAt": 1720000000000,
  "settings": { "deckId": "fibonacci", "timerSec": null },
  "participants": [ { "id": "…", "name": "Ada", "role": "facilitator", "status": "connected", "hasVoted": false, "joinedAt": 1720000000000, "hue": 120 } ],
  "status": "voting",
  "votedIds": [ "…" ],
  "everyoneHasVoted": false,
  "votes": {},          // populated ONLY when status === "revealed"
  "stats": null,        // populated ONLY when status === "revealed"
  "timer": null         // or { "durationSec": 10, "endsAt": 1720000001000 }
}
```

### `room:ended`

The host ended the session; the room no longer exists. The client resets its
Redux state and shows the "room is gone" screen.

### `you:removed`

The host removed this participant. The client clears its identity and shows
the removal notice.
