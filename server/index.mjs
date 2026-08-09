/**
 * Reveal — in-memory realtime server (no database, no disk writes, ever).
 *
 * The entire room state lives in a plain JS `Map` keyed by room code.
 * When the process restarts, every room is gone. Rooms are also deleted
 * when they sit empty for ROOM_TTL_MS or when the facilitator ends the session.
 *
 * One round per room: WAITING → VOTING → ENDED → REVEALED.
 *
 *  - WAITING   participants join; nobody can vote; the host can start.
 *  - VOTING    votes lock in the moment they land; the host can reveal as
 *              soon as EVERYONE has voted (or waits for the timer if one runs).
 *  - ENDED     the server-side timer reached zero; votes are closed; only the
 *              host can reveal. Vote values are still private.
 *  - REVEALED  everyone sees every vote + statistics. Round is closed for good.
 *
 * Protocol is intentionally simple: the server broadcasts a full `snapshot`
 * of the room after every mutation, and the client hydrates its Redux slices
 * from it. Vote *values* never leave the server until the room is REVEALED —
 * the snapshot only exposes who has voted (`votedIds`) beforehand.
 */

import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = Number(process.env.SOCKET_PORT || 3001);
const ORIGIN = process.env.SOCKET_ORIGIN || 'http://localhost:3000';
const ROOM_TTL_MS = 10 * 60 * 1000; // empty rooms live 10 more minutes, then vanish
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 5;

const KNOWN_DECKS = new Set(['standard', 'fibonacci', 'tshirt', 'powers2']);
const KNOWN_TIMERS = new Set([10, 15, 30]); // seconds — Off is null
const DEFAULT_DECK = 'fibonacci';

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

// ---------------------------------------------------------------------------
// Room lifecycle helpers
// ---------------------------------------------------------------------------

function genCode() {
  let code = '';
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom({ hostName, teamName, deckId }) {
  const code = genCode();
  const room = {
    code,
    hostId: null, // set when the host's participant is created
    teamName: teamName || '',
    createdAt: Date.now(),
    settings: {
      deckId: KNOWN_DECKS.has(deckId) ? deckId : DEFAULT_DECK,
      timerSec: null, // null = timer OFF; only 10 / 15 / 30 are allowed
    },
    participants: new Map(), // id -> participant
    status: 'waiting', // 'waiting' | 'voting' | 'ended' | 'revealed'
    votes: {}, // participantId -> value (this round only)
    stats: null,
    timer: null, // {durationSec, endsAt}
    emptySince: null,
  };
  const host = addParticipant(room, { name: hostName || 'Host', role: 'facilitator' });
  room.hostId = host.id;
  rooms.set(code, room);
  return room;
}

function addParticipant(room, { name, role = 'voter', id }) {
  const pid = id || `${room.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  room.participants.set(pid, {
    id: pid,
    name: (name || 'Guest').slice(0, 32),
    role,
    status: 'connected', // 'connected' | 'voted' | 'disconnected'
    hasVoted: false,
    joinedAt: Date.now(),
    hue: hueFromString(name || 'Guest'),
  });
  return room.participants.get(pid);
}

function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/** Compute result stats from vote values (ignores non-voters). */
function computeStats(values) {
  if (!values.length) return null;
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  const sorted = [...nums].sort((a, b) => a - b);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true }));
  const mode = entries[0][0];
  const modeShare = entries[0][1] / values.length;
  const unique = entries.length;
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const median = nums.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : null;
  const spread = nums.length ? sorted[sorted.length - 1] - sorted[0] : null;
  const level = unique === 1 ? 'full' : modeShare >= 0.7 ? 'strong' : modeShare >= 0.45 ? 'some' : 'large';
  return {
    count: values.length,
    mode,
    modeShare: Math.round(modeShare * 1000) / 1000,
    unique,
    avg: avg == null ? null : Math.round(avg * 100) / 100,
    median: median == null ? null : Math.round(median * 100) / 100,
    spread: spread == null ? null : Math.round(spread * 100) / 100,
    level,
    counts: entries.map(([value, count]) => ({ value, count })),
  };
}

/**
 * "Everyone has voted" = every participant who is still at the table (not
 * disconnected) has cast a vote. A participant who closed their tab without
 * voting must not deadlock the room — the host can reveal past them.
 */
function everyoneHasVoted(room) {
  const eligible = [...room.participants.values()].filter((p) => p.status !== 'disconnected');
  return eligible.length > 0 && eligible.every((p) => room.votes[p.id] !== undefined);
}

/** Build the privacy-aware snapshot sent to clients. */
function buildSnapshot(room) {
  const participants = [...room.participants.values()].map((p) => ({ ...p }));
  const votedIds = Object.keys(room.votes);
  return {
    code: room.code,
    hostId: room.hostId,
    teamName: room.teamName,
    createdAt: room.createdAt,
    settings: { ...room.settings },
    participants,
    status: room.status,
    votedIds,
    everyoneHasVoted: everyoneHasVoted(room),
    // Values only leave the server once the round is revealed.
    votes: room.status === 'revealed' ? { ...room.votes } : {},
    stats: room.status === 'revealed' ? room.stats : null,
    timer: room.timer ? { ...room.timer } : null,
  };
}

function emitSnapshot(room) {
  io.to(room.code).emit('snapshot', buildSnapshot(room));
}

/** Promote the longest-connected participant when the host vanishes. */
function promoteHostIfNeeded(room) {
  if (room.hostId && room.participants.has(room.hostId) && room.participants.get(room.hostId).status !== 'disconnected') return;
  const candidates = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0];
  if (next) {
    room.hostId = next.id;
  } else {
    room.hostId = null;
  }
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
      const room = createRoom(payload || {});
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
  const assertHost = (socket) => {
    const room = roomFor(socket);
    return room && room.hostId === socket.data.participantId ? room : null;
  };

  // -------------------------------------------------------------------------
  // Start — only the host, and only while the room is still WAITING.
  // The timer is whatever the host picked in the waiting room (Off = null).
  // -------------------------------------------------------------------------
  socket.on('voting:start', (_payload, ack) => {
    const room = assertHost(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    if (room.status !== 'waiting') return ack?.({ ok: false, error: 'in_progress' });
    room.status = 'voting';
    room.votes = {};
    room.stats = null;
    for (const p of room.participants.values()) {
      p.hasVoted = false;
      p.status = 'connected';
    }
    const sec = room.settings.timerSec;
    room.timer = sec ? { durationSec: sec, endsAt: Date.now() + sec * 1000 } : null;
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
    const p = room.participants.get(socket.data.participantId);
    if (!p) return ack?.({ ok: false, error: 'not_found' });
    if (room.status === 'revealed') return ack?.({ ok: false, error: 'revealed' });
    if (room.status !== 'voting') return ack?.({ ok: false, error: 'not_voting' });
    // The server owns the timer: a vote that lands after it hit zero is closed.
    if (room.timer && room.timer.endsAt <= Date.now()) {
      room.status = 'ended';
      emitSnapshot(room);
      return ack?.({ ok: false, error: 'not_voting' });
    }
    if (p.hasVoted) return ack?.({ ok: false, error: 'already_voted' });
    const value = String(payload?.value ?? '');
    if (!value) return ack?.({ ok: false, error: 'no_value' });
    room.votes[p.id] = value;
    p.hasVoted = true;
    p.status = 'voted';
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Reveal — only the host. Allowed once the timer ended the round, OR as
  // soon as every participant has voted (even while voting is still live).
  // Actual values stay private until this fires.
  // -------------------------------------------------------------------------
  socket.on('votes:reveal', (_payload, ack) => {
    const room = assertHost(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    if (room.status === 'revealed') return ack?.({ ok: false, error: 'already_revealed' });
    if (room.status === 'waiting') return ack?.({ ok: false, error: 'not_started' });
    if (room.status !== 'ended' && !(room.status === 'voting' && everyoneHasVoted(room))) {
      return ack?.({ ok: false, error: 'not_all_voted' });
    }
    room.status = 'revealed';
    room.stats = computeStats(Object.values(room.votes));
    room.timer = null;
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Host table settings & management
  // -------------------------------------------------------------------------
  // Timer pick (waiting room only): Off (null) or one of 10 / 15 / 30 seconds.
  socket.on('room:settings', (payload, ack) => {
    const room = assertHost(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    if (room.status !== 'waiting') return ack?.({ ok: false, error: 'in_progress' });
    const raw = payload?.timerSec;
    const timerSec = raw == null ? null : Number(raw);
    if (timerSec !== null && !KNOWN_TIMERS.has(timerSec)) return ack?.({ ok: false, error: 'bad_timer' });
    room.settings.timerSec = timerSec;
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  socket.on('participant:remove', (payload, ack) => {
    const room = assertHost(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
    const targetId = payload?.participantId;
    if (!targetId || targetId === room.hostId) return ack?.({ ok: false, error: 'cannot_remove' });
    const target = room.participants.get(targetId);
    if (!target) return ack?.({ ok: false, error: 'no_participant' });
    room.participants.delete(targetId);
    delete room.votes[targetId];
    // Tell that exact socket it's gone, if it's still connected.
    for (const s of io.sockets.sockets.values()) {
      if (s.data.participantId === targetId && s.data.roomCode === room.code) {
        s.emit('you:removed');
        s.leave(room.code);
      }
    }
    ack?.({ ok: true });
    emitSnapshot(room);
  });

  socket.on('room:end', (_p, ack) => {
    const room = assertHost(socket);
    if (!room) return ack?.({ ok: false, error: 'not_host' });
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
    const p = room.participants.get(participantId);
    if (p) p.status = 'disconnected';
    const anyConnected = [...room.participants.values()].some((x) => x.status !== 'disconnected');
    if (!anyConnected) room.emptySince = Date.now();
    else room.emptySince = null;
    promoteHostIfNeeded(room);
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
