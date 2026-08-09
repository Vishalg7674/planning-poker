# Realtime architecture

Reveal is realtime end to end: the **Socket.io server** (in-memory) is the
authority, and every client holds a Redux projection of the latest
`snapshot`. This document walks through the connection lifecycle, each event,
and why the rules live on the server.

## Connection lifecycle

1. The app loads `RealtimeBridge`, which calls `getSocket()` — a singleton
   Socket.io client (`src/lib/socket.ts`).
2. The client connects with WebSocket transport (polling as a fallback) and
   reconnection enabled (`reconnectionDelay` 600 ms → max 4000 ms).
3. On `connect`, `RealtimeBridge` dispatches `connectionChanged('connected')`
   and, if the URL is a room and a sessionStorage identity exists, emits
   `room:rejoin` to reclaim the seat.
4. While connected, every server event is turned into a Redux action:
   `snapshot` → `snapshotReceived`, `room:ended` → `roomEnded`,
   `you:removed` → `youRemoved`, plus local `timerUp` when the countdown
   finishes.
5. On `disconnect` (after having been connected) the UI shows
   *Reconnecting*; the socket keeps trying. A room that still exists is
   reclaimed automatically on reconnect.

## Room creation & customization

- **Host** — `room:create { hostName, teamName?, roomTitle?, deckId?,
  accent?, revealMode? }` creates the room, seats the host as `facilitator`,
  sets `room.hostId`, and joins the socket to the room channel. The
  configuration is validated against the server allow-lists and fixed at
  creation (the timer and reveal mode remain tweakable in the waiting room).
- Every client in the room sees the configuration in the waiting room's
  config summary and as the accent applied to the room root — but only the
  host can change anything.

## Room join

- **Participant** — `room:join { code, name }` (normalised to uppercase) adds
  a `voter` and joins the channel. The ack carries the participant id and the
  current snapshot so the client can hydrate immediately.
- **Locked rooms** — if the host locked the room, `room:join` refuses
  **brand-new** participants with `room_locked`; existing participants
  (passing their `id`) and projector screens are still admitted.
- **Rejoin** — `room:rejoin { code, participantId, name }` keeps the existing
  participant object (so a locked vote survives a refresh). A stale identity
  (`unknown_participant`) is dropped client-side so the join form appears.
- **Projector** — `room:join { code, role: 'screen' }` joins the channel
  without taking a seat: it receives every snapshot but never appears in the
  participant list and can never vote. It also does not keep the room alive.

## Room state broadcast

After **every** mutation the server emits `snapshot` to everyone in the room
channel — a complete, privacy-aware room state. Clients replace their Redux
state from it, so there are no incremental patch events to drift apart.

## Start voting

`voting:start` (host only, `WAITING` only):

- `status` → `voting`, votes cleared, every participant reset to
  `hasVoted: false`, `status: 'connected'`.
- If the host picked a timer in the waiting room, `room.timer =
  { durationSec, endsAt: now + durationSec * 1000 }`; otherwise `null` (Off).
- The 500 ms server sweep checks `endsAt`; when it passes, `status` → `ended`
  and a snapshot announces it.

## Vote submission

`vote:cast { value }` (see the exact checks in `server/room.mjs`):

1. participant exists in the room, else `not_found`;
2. status is not `revealed`, else `revealed`;
3. status is `voting`, else `not_voting` — this also covers "before start"
   and "after the timer ended";
4. if a vote lands after `endsAt` the server immediately flips the room to
   `ended` and rejects with `not_voting`;
5. `hasVoted` is false, else `already_voted`;
6. a non-empty value, else `no_value`.

## Vote lock

The lock is **server state**, not UI: `room.votes[p.id] = value;
p.hasVoted = true; p.status = 'voted'`. There is no client-side path to
unlock, no revote event, no reset. The browser only renders the lock
optimistically (`voting.myVote`) and rolls it back if the ack says no.
Disconnecting and reconnecting does **not** bypass the lock — the server
restores `status: 'voted'` for a participant who already cast.

## Participant status

While voting, snapshots contain `votedIds` and each participant's `status`
(`connected` = *Thinking*, `voted` = *Voted*). Actual values stay server-side
until the reveal — see [ARCHITECTURE.md](ARCHITECTURE.md#privacy).

## Timer synchronization

- The **server** decides when voting ends (sweep every 500 ms).
- Every client receives the same `timer.endsAt`; the `RealtimeBridge` interval
  ticks `timerSlice.remaining = ceil((endsAt - now) / 1000)` and fires
  `timerUp` exactly once per countdown (guarded by a `durationSec:endsAt`
  key). All browsers display the same countdown and hit zero together.

## Voting completion

Two ways a round becomes revealable:

- **Everyone voted** — `everyoneHasVoted` becomes true (counts only connected
  participants, so a disconnected non-voter can't deadlock). The host gets the
  gold Reveal button immediately, even mid-voting.
- **Timer expired** — the sweep moves the room to `ended`; the host's Reveal
  button appears on the `EndedPanel` (or the presentation view).

## Reveal

`votes:reveal` (host only):

- rejected if not host, already revealed, still `WAITING`, or
  (`VOTING` **and** not everyone voted);
- accepted from `ENDED`, or from `VOTING` once everyone voted;
- on success: `status` → `revealed`, `stats = computeStats(values, deckId)`
  (which includes the `calculateConsensus` verdict), `timer = null`, and the
  snapshot finally includes `votes` and `stats`.

Every client flips its cards from the same snapshot (`ResultsPanel` renders
the values with a mode-aware staggered flip animation; full consensus
triggers the celebration).

## Host controls

Host-only actions that broadcast a snapshot: `voting:start`, `votes:reveal`,
`room:settings` (timer + reveal mode), `room:lock`, `room:unlock`,
`participant:remove`, `room:end`. All check `actorId === room.hostId`
server-side; the UI merely hides the buttons for non-hosts.

## Disconnect

When a socket disconnects, the server marks that participant
`status: 'disconnected'` and broadcasts a snapshot. If the host leaves, host
status remains but a promotion helper is available for the case where the
host participant is gone entirely. When the last connected participant leaves,
`emptySince` is set; the 10-minute expiry sweep then deletes the room.

## Reconnect

See [Architecture — Reconnection](ARCHITECTURE.md#reconnection). In short:
the client reconnects automatically and re-joins via `room:rejoin`, keeping
the same participant id and any locked vote; a subtle *Reconnected* toast
announces the restore.

## Server authority

Every rule that matters is enforced in `server/room.mjs`, which the socket
handlers call and the unit tests target directly:

- only the host may start, reveal, change the timer/reveal mode, lock/unlock,
  remove participants, or end the room;
- a participant votes exactly once, and only while voting is live;
- values stay private until the reveal;
- the timer, not the browser clock, ends the round;
- a locked room refuses strangers but keeps its own people.

The client's job is presentation: it optimistically shows the lock, ticks the
shared countdown, and renders snapshots. If a client misbehaves, the server
rejects it — that is why the [socket E2E suite](../scripts/e2e.mjs) asserts
rejections (`already_voted`, `not_host`, `not_all_voted`, `room_locked`, …)
straight from the ack payloads.
