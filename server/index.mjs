/**
 * Reveal — in-memory realtime server (no database, no disk writes, ever).
 *
 * The pure room-state logic lives in `./room.mjs` (createRoom, startVoting,
 * castVote, reveal, ...). This file is the socket layer: it owns connections,
 * the room Map, snapshot broadcasts, the server-authoritative countdown, and
 * room expiry. When the process restarts, every room is gone.
 *
 * Multi-round rooms: WAITING → VOTING → ENDED → REVEALED, then back to
 * WAITING via room:newRound (host-only) — the same room, same code, same
 * participants, brand-new round.
 *
 *  - WAITING   participants join; nobody can vote; the host can start.
 *  - VOTING    votes lock in the moment they land; the host can reveal as
 *              soon as EVERYONE has voted (or waits for the timer if one runs).
 *  - ENDED     the server-side timer reached zero; votes are closed; only the
 *              host can reveal. Vote values are still private.
 *  - REVEALED  everyone sees every vote + statistics. The host can then start
 *              the next story with room:newRound (votes/results reset, the
 *              room itself is untouched).
 *
 * Protocol is intentionally simple: the server broadcasts a full `snapshot`
 * of the room after every mutation, and the client hydrates its Redux slices
 * from it. Vote *values* never leave the server until the room is REVEALED —
 * the snapshot only exposes who has voted (`votedIds`) beforehand.
 */

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  ROOM_TTL_MS,
  createRoom,
  addParticipant,
  buildSnapshot,
  startVoting,
  startNewRound,
  castVote,
  reveal,
  setTimerSec,
  setRevealMode,
  setLocked,
  removeParticipant,
  disconnectParticipant,
} from './room.mjs';

// Render / Railway inject a random PORT into the environment; SOCKET_PORT
// (local dev, playwright) wins when both are set.
const PORT = Number(process.env.SOCKET_PORT || process.env.PORT || 3001);
const ORIGIN = process.env.SOCKET_ORIGIN || 'http://localhost:3000';

/** @type {Map<string, import('./types').ServerRoom>} */
const rooms = new Map();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Reveal realtime server — rooms live in memory only.');
});

const io = new Server(httpServer, {
  cors: { origin: ORIGIN.split(','), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 64 * 1024,
});

function emitSnapshot(room) {
  io.to(room.code).emit('snapshot', buildSnapshot(room));
}

// ---------------------------------------------------------------------------
// Server-authoritative timer: when the countdown hits zero, VOTING → ENDED.
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'voting' && room.timer && room.timer.endsAt <= now) {
      room.status = 'ended';
      emitSnapshot(room);
    }
  }
}, 500);

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.participantId = null;

  socket.on('room:create', (payload, ack) => {
    try {
      const room = createRoom({
        hostName: payload?.hostName,
        teamName: payload?.teamName,
        roomTitle: payload?.roomTitle,
        deckId: payload?.deckId,
        accent: payload?.accent,
        revealMode: payload?.revealMode,
        hasCode: (code) => rooms.has(code),
      });
      rooms.set(room.code, room);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.participantId = room.hostId;
      ack?.({ ok: true, code: room.code, participantId: room.hostId });
      emitSnapshot(room);
    } catch (e) {
      ack?.({ ok: false, error: e.message || 'Could not create room' });
    }
  });

  socket.on('room:join', (payload, ack) => {
    const { code, name, role, id } = payload || {};
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: 'not_found' });

    // Projector / big-screen sockets watch the room without taking a seat.
    // They receive every snapshot but never appear in the participant list.
    if (role === 'screen') {
      // A projector must not keep an abandoned room alive — expiry is driven
      // purely by the participants, so we deliberately skip emptySince here.
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.participantId = null;
      ack?.({ ok: true, participantId: null, screen: true, snapshot: buildSnapshot(room) });
      emitSnapshot(room);
      return;
    }

    // Locked rooms refuse brand-new participants; existing ones (rejoin with
    // their id) and projector screens are still welcome.
    if (room.locked && !(id && room.participants.has(id))) {
      return ack?.({ ok: false, error: 'room_locked' });
    }

    let participant;
    if (id && room.participants.has(id)) {
      // Rejoin from the same tab — keep the "voted" status if a vote is locked.
      participant = room.participants.get(id);
      participant.name = (name || participant.name).slice(0, 32);
      participant.role = participant.role === 'facilitator' ? 'facilitator' : 'voter';
      participant.status = room.votes[participant.id] ? 'voted' : 'connected';
    } else {
      participant = addParticipant(room, { name, role: 'voter', id });
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participant.id;
    room.emptySince = null;
    ack?.({ ok: true, participantId: participant.id, snapshot: buildSnapshot(room) });
    emitSnapshot(room);
  });

  socket.on('room:rejoin', (payload, ack) => {
    const { code, participantId, name } = payload || {};
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: 'not_found' });
    // Locked rooms still admit their own participants — only strangers are refused (see room:join).
    const participant = room.participants.get(participantId);
    if (!participant) return ack?.({ ok: false, error: 'unknown_participant' });
    participant.name = (name || participant.name).slice(0, 32);
    participant.status = room.votes[participant.id] ? 'voted' : 'connected';
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participantId;
    room.emptySince = null;
    ack?.({ ok: true, participantId, snapshot: buildSnapshot(room) });
    emitSnapshot(room);
  });

  /** Verify the socket is inside a room and it's the facilitator for host-only actions. */
  const roomFor = (socket) => {
    const room = rooms.get(socket.data.roomCode);
    return room && socket.data.participantId && room.participants.has(socket.data.participantId) ? room : null;
  };

  // -------------------------------------------------------------------------
  // Start — only the host, and only while the room is still WAITING.
  // The timer is whatever the host picked in the waiting room (Off = null).
  // An optional story payload ({ id, title, description }) rides along and is
  // broadcast to every client with the next snapshot.
  // -------------------------------------------------------------------------
  socket.on('voting:start', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = startVoting(room, socket.data.participantId, payload?.story);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // New round — host-only, from REVEALED or ENDED. Resets the round payload
  // (votes, results, reveal, story) back to WAITING while the room itself —
  // code, host, participants, settings — is preserved. Server-side guards
  // make it idempotent: a second call while WAITING/VOTING is rejected.
  // -------------------------------------------------------------------------
  socket.on('room:newRound', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = startNewRound(room, socket.data.participantId);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Vote — only while VOTING, and only once. The server owns the lock; a
  // second attempt from the same participant is rejected, period.
  // -------------------------------------------------------------------------
  socket.on('vote:cast', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_found' });
    const res = castVote(room, socket.data.participantId, payload?.value);
    if (res.timerEnded) emitSnapshot(room); // the server-side timer just expired
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Reveal — only the host. Allowed once the timer ended the round, OR as
  // soon as every participant has voted (even while voting is still live).
  // Actual values stay private until this fires.
  // -------------------------------------------------------------------------
  socket.on('votes:reveal', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = reveal(room, socket.data.participantId);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Host table settings & management
  // -------------------------------------------------------------------------
  // Timer + reveal-mode pick (waiting room only). Timer: Off or 10/15/30s.
  socket.on('room:settings', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    if (payload?.timerSec !== undefined) {
      const res = setTimerSec(room, socket.data.participantId, payload.timerSec);
      if (!res.ok) return ack?.(res);
    }
    if (payload?.revealMode !== undefined) {
      const res = setRevealMode(room, socket.data.participantId, payload.revealMode);
      if (!res.ok) return ack?.(res);
    }
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // Host-only: lock / unlock the room against new joiners (any phase).
  socket.on('room:lock', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = setLocked(room, socket.data.participantId, true);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  socket.on('room:unlock', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = setLocked(room, socket.data.participantId, false);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  socket.on('participant:remove', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const res = removeParticipant(room, socket.data.participantId, payload?.participantId);
    if (!res.ok) return ack?.(res);
    // Tell that exact socket it's gone, if it's still connected.
    for (const s of io.sockets.sockets.values()) {
      if (s.data.participantId === res.removedId && s.data.roomCode === room.code) {
        s.emit('you:removed');
        s.leave(room.code);
      }
    }
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  socket.on('room:end', (_p, ack) => {
    const room = roomFor(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    if (room.hostId !== socket.data.participantId) return ack?.({ ok: false, error: 'not_host' });
    io.to(room.code).emit('room:ended');
    for (const s of io.sockets.sockets.values()) if (s.data.roomCode === room.code) s.leave(room.code);
    rooms.delete(room.code);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const { roomCode, participantId } = socket.data;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    disconnectParticipant(room, participantId);
    emitSnapshot(room);
  });
});

// ---------------------------------------------------------------------------
// Room expiry: empty rooms vanish after ROOM_TTL_MS
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = [...room.participants.values()].every((p) => p.status === 'disconnected');
    if (empty && room.emptySince && now - room.emptySince > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}, 30_000);

httpServer.listen(PORT, () => {
  console.log(`[reveal-rt] in-memory realtime server listening on :${PORT} (rooms are ephemeral by design)`);
});
