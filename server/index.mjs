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
 *
 * Ops surfaces (see docs/system-design.md §13 + optimization.md Phase 0):
 *   - Rate limiting   — in-memory fixed-window buckets (server/rateLimit.mjs):
 *                       room:create 5/min/IP, room:join 30/min/IP, vote
 *                       events 10/s/socket, max 20 sockets/IP. Disable with
 *                       RATE_LIMIT_DISABLED=1 (used by the test harnesses).
 *   - Metrics         — Prometheus text format on GET /metrics (prom-client):
 *                       rooms, sockets, snapshots/broadcast bytes, events,
 *                       rejected actions, rate-limited events.
 *   - Logging         — pino JSON (LOG_LEVEL to tune; connect/disconnect at
 *                       debug, lifecycle at info, abuse at warn).
 *   - Shutdown        — SIGTERM/SIGINT broadcast room:ended and drain sockets.
 */

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import pino from 'pino';
import client from 'prom-client';
import * as Sentry from '@sentry/node';
import {
  ROOM_TTL_MS,
  createRoom,
  addParticipant,
  buildSnapshot,
  startVoting,
  startNewRound,
  castVote,
  skipVote,
  reveal,
  setTimerSec,
  setRevealMode,
  setLocked,
  removeParticipant,
  disconnectParticipant,
} from './room.mjs';
import { GAME_MODULES, CAST_EVENTS } from './games/registry.mjs';
import { createWindowLimiter, makeSocketLimiter, clientIp } from './rateLimit.mjs';

/**
 * Every engine-backed game is a drop-in here: each module exports create,
 * startPrompt, cast (the vote action), reveal, committed, setLocked,
 * removeParticipant, disconnectParticipant and buildGameSnapshot, plus the
 * `castEvent` it listens on. The socket layer stays fully generic.
 */
const GAME_IDS = new Set(Object.keys(GAME_MODULES));

// Render / Railway inject a random PORT into the environment; SOCKET_PORT
// (local dev, playwright) wins when both are set.
const PORT = Number(process.env.SOCKET_PORT || process.env.PORT || 3001);
const ORIGIN = process.env.SOCKET_ORIGIN || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Logging (pino JSON) — LOG_LEVEL: debug | info | warn | error
// ---------------------------------------------------------------------------

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'reveal-rt' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Sentry error tracking — a no-op unless SENTRY_DSN is set (dev/tests/CI
// run without it). Same 10% trace sample rate as the Next.js server config.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

// ---------------------------------------------------------------------------
// Metrics (prom-client) — GET /metrics
// ---------------------------------------------------------------------------

// Standard Node/event-loop/process metrics (nodejs_eventloop_lag_seconds,
// process_resident_memory_bytes, …) are collected automatically.
client.collectDefaultMetrics();

const roomsGauge = new client.Gauge({ name: 'reveal_rooms_active', help: 'Rooms currently held in memory' });
const socketsGauge = new client.Gauge({ name: 'reveal_sockets_connected', help: 'Sockets currently connected' });
const snapshotsTotal = new client.Counter({ name: 'reveal_snapshots_broadcast_total', help: 'Snapshots broadcast to room channels' });
const broadcastBytes = new client.Counter({ name: 'reveal_broadcast_bytes_total', help: 'Approximate snapshot payload bytes broadcast' });
const eventsTotal = new client.Counter({ name: 'reveal_events_total', labelNames: ['event'], help: 'Socket events received' });
const rejectedActions = new client.Counter({ name: 'reveal_rejected_actions_total', labelNames: ['error'], help: 'Socket actions rejected with an error ack' });
const rateLimitedEvents = new client.Counter({ name: 'reveal_rate_limited_total', labelNames: ['event'], help: 'Socket events dropped by the rate limiter' });

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, see server/rateLimit.mjs)
// ---------------------------------------------------------------------------

const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === '1'; // test harnesses
const CREATE_LIMIT = Number(process.env.RATE_LIMIT_CREATE_PER_MIN || 5);
const JOIN_LIMIT = Number(process.env.RATE_LIMIT_JOIN_PER_MIN || 30);
const VOTE_LIMIT = Number(process.env.RATE_LIMIT_VOTE_PER_SEC || 10);
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP || 20);

const createLimiter = createWindowLimiter(CREATE_LIMIT, 60_000); // per IP
const joinLimiter = createWindowLimiter(JOIN_LIMIT, 60_000); // per IP
const voteLimiter = makeSocketLimiter(VOTE_LIMIT, 1000); // per socket
/** Events that cast a vote — the only ones a socket can spam meaningfully. */
const VOTE_EVENTS = new Set(['vote:cast', 'vote:skip', 'game:pick', 'game:choose', 'game:answer', 'game:guess', 'game:submit', 'game:healthSubmit', 'game:pollVote']);
/** Live socket count per IP (connection cap). */
const connectionsPerIp = new Map(); // ip -> count

/** @type {Map<string, import('./types').ServerRoom>} */
const rooms = new Map();

const httpServer = createServer((req, res) => {
  // GET /metrics — Prometheus text format for scrapers.
  if (req.url === '/metrics') {
    client.register
      .metrics()
      .then((text) => {
        res.writeHead(200, { 'Content-Type': client.register.contentType });
        res.end(text);
      })
      .catch((e) => {
        logger.error({ err: e }, 'metrics scrape failed');
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('metrics unavailable');
      });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Reveal realtime server — rooms live in memory only.');
});

const io = new Server(httpServer, {
  cors: { origin: ORIGIN.split(','), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 64 * 1024,
});

// Connection-level guard: cap concurrent sockets per IP, and count them so
// disconnect can decrement. Rejected sockets get a connect_error.
io.use((socket, next) => {
  const ip = clientIp(socket);
  const count = (connectionsPerIp.get(ip) || 0) + 1;
  if (!RATE_LIMIT_DISABLED && count > MAX_SOCKETS_PER_IP) {
    logger.warn({ ip, count, socketId: socket.id }, 'connection cap exceeded');
    return next(new Error('too_many_connections'));
  }
  connectionsPerIp.set(ip, count);
  socket.on('disconnect', () => {
    const c = (connectionsPerIp.get(ip) || 1) - 1;
    if (c <= 0) connectionsPerIp.delete(ip);
    else connectionsPerIp.set(ip, c);
  });
  logger.debug({ socketId: socket.id, ip }, 'socket connected');
  next();
});

function emitSnapshot(room) {
  const snapshot = snapshotFor(room);
  snapshotsTotal.inc();
  broadcastBytes.inc(Buffer.byteLength(JSON.stringify(snapshot)));
  io.to(room.code).emit('snapshot', snapshot);
}

/** Build the room's snapshot using the right game's serializer. */
function snapshotFor(room) {
  const mod = GAME_MODULES[room.game];
  return mod ? mod.buildGameSnapshot(room) : buildSnapshot(room);
}

/** Ack + record rejections for the error-rate metric. `res` is {ok, ...}. */
function ackRes(ack, res) {
  if (res && res.ok !== true) rejectedActions.inc({ error: res.error || 'unknown' });
  ack?.(res);
  return res;
}

// ---------------------------------------------------------------------------
// Server-authoritative timer: when the countdown hits zero, VOTING → ENDED.
// ---------------------------------------------------------------------------

const timerSweep = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    // Planning poker only — the games have no countdown.
    if (!GAME_IDS.has(room.game) && room.status === 'voting' && room.timer && room.timer.endsAt <= now) {
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

  // Per-packet guard: count every event for metrics, then apply the buckets.
  // Dropped packets still get a `rate_limited` ack so clients see a message
  // instead of a silent hang.
  socket.use(([event, , ack], next) => {
    eventsTotal.inc({ event });
    if (RATE_LIMIT_DISABLED) return next();
    let limited = false;
    if (event === 'room:create') limited = !createLimiter.allow(clientIp(socket));
    else if (event === 'room:join') limited = !joinLimiter.allow(clientIp(socket));
    else if (VOTE_EVENTS.has(event)) limited = !voteLimiter.allow(socket);
    if (limited) {
      rateLimitedEvents.inc({ event });
      logger.warn({ event, ip: clientIp(socket), socketId: socket.id }, 'rate limited');
      if (typeof ack === 'function') ack({ ok: false, error: 'rate_limited' });
      return; // drop the packet — the handler never runs
    }
    try {
      next();
    } catch (e) {
      // Central safety net: a throwing handler must never take down the
      // process (room state stays memory-only and every room would vanish).
      Sentry.captureException(e);
      logger.error({ event, err: e, socketId: socket.id }, 'socket handler threw');
    }
  });

  socket.on('room:create', (payload, ack) => {
    try {
      const gameMod = GAME_MODULES[payload?.game];
      const room = gameMod
        ? gameMod.create({
            hostName: payload?.hostName,
            teamName: payload?.teamName,
            roomTitle: payload?.roomTitle,
            // Team Health / Live Poll: the host's configuration rides along
            // at creation (categories, question, options, privacy toggles).
            config: payload?.config,
            hasCode: (code) => rooms.has(code),
          })
        : createRoom({
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
      logger.info({ code: room.code, game: room.game || 'planning-poker' }, 'room created');
      ackRes(ack, { ok: true, code: room.code, participantId: room.hostId });
      emitSnapshot(room);
    } catch (e) {
      Sentry.captureException(e);
      logger.error({ err: e }, 'room:create failed');
      ackRes(ack, { ok: false, error: e.message || 'Could not create room' });
    }
  });

  socket.on('room:join', (payload, ack) => {
    const { code, name, role, id } = payload || {};
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ackRes(ack, { ok: false, error: 'not_found' });

    // Projector / big-screen sockets watch the room without taking a seat.
    // They receive every snapshot but never appear in the participant list.
    if (role === 'screen') {
      // A projector must not keep an abandoned room alive — expiry is driven
      // purely by the participants, so we deliberately skip emptySince here.
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.participantId = null;
      ackRes(ack, { ok: true, participantId: null, screen: true, snapshot: snapshotFor(room) });
      emitSnapshot(room);
      return;
    }

    // Locked rooms refuse brand-new participants; existing ones (rejoin with
    // their id) and projector screens are still welcome.
    if (room.locked && !(id && room.participants.has(id))) {
      return ackRes(ack, { ok: false, error: 'room_locked' });
    }

    let participant;
    if (id && room.participants.has(id)) {
      // Rejoin from the same tab — keep the "voted" status if a vote is locked.
      participant = room.participants.get(id);
      participant.name = (name || participant.name).slice(0, 32);
      participant.role = participant.role === 'facilitator' ? 'facilitator' : 'voter';
      const committed = gameModuleFor(room)?.committed?.(room, participant.id) ?? room.votes?.[participant.id];
      participant.status = committed ? 'voted' : 'connected';
    } else {
      participant = addParticipant(room, { name, role: 'voter', id });
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participant.id;
    room.emptySince = null;
    ackRes(ack, { ok: true, participantId: participant.id, snapshot: snapshotFor(room) });
    emitSnapshot(room);
  });

  socket.on('room:rejoin', (payload, ack) => {
    const { code, participantId, name } = payload || {};
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ackRes(ack, { ok: false, error: 'not_found' });
    // Locked rooms still admit their own participants — only strangers are refused (see room:join).
    const participant = room.participants.get(participantId);
    if (!participant) return ackRes(ack, { ok: false, error: 'unknown_participant' });
    participant.name = (name || participant.name).slice(0, 32);
    const committed = gameModuleFor(room)?.committed?.(room, participant.id) ?? room.votes?.[participant.id];
    participant.status = committed ? 'voted' : 'connected';
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participantId;
    room.emptySince = null;
    ackRes(ack, { ok: true, participantId, snapshot: snapshotFor(room) });
    emitSnapshot(room);
  });

  /** Verify the socket is inside a room and it's the facilitator for host-only actions. */
  const roomFor = (socket) => {
    const room = rooms.get(socket.data.roomCode);
    return room && socket.data.participantId && room.participants.has(socket.data.participantId) ? room : null;
  };

  /** The game module backing a room, if it's a shipped game. */
  const gameModuleFor = (room) => GAME_MODULES[room.game];

  // -------------------------------------------------------------------------
  // Start — only the host, and only while the room is still WAITING.
  // The timer is whatever the host picked in the waiting room (Off = null).
  // An optional story payload ({ id, title, description }) rides along and is
  // broadcast to every client with the next snapshot.
  // -------------------------------------------------------------------------
  socket.on('voting:start', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = startVoting(room, socket.data.participantId, payload?.story);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // New round — host-only, from REVEALED or ENDED. Resets the round payload
  // (votes, results, reveal, story) back to WAITING while the room itself —
  // code, host, participants, settings — is preserved. Server-side guards
  // make it idempotent: a second call while WAITING/VOTING is rejected.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Shipped games (Most Likely To, Would You Rather) — same transport as
  // planning poker, their own events: startPrompt (host, from WAITING or
  // REVEALED), the per-game cast action, and reveal (host, once everyone has
  // voted).
  // -------------------------------------------------------------------------
  socket.on('game:startPrompt', (_payload, ack) => {
    const room = roomFor(socket);
    const mod = room && gameModuleFor(room);
    if (!mod) return ackRes(ack, { ok: false, error: 'not_found' });
    const res = mod.startPrompt(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // Cast a vote — one generic handler per game cast event (pick/choose/
  // answer/guess/submit). The room's module declares which events it listens
  // on (a `free` game accepts both its submit event and its vote event), so a
  // client can never vote on the wrong game's channel.
  for (const castEvent of CAST_EVENTS) {
    socket.on(castEvent, (payload, ack) => {
      const room = roomFor(socket);
      const mod = room && gameModuleFor(room);
      if (!mod || !mod.castEvents?.includes(castEvent)) return ackRes(ack, { ok: false, error: 'not_found' });
      const res = mod.cast(room, socket.data.participantId, payload?.value);
      if (!res.ok) return ackRes(ack, res);
      ackRes(ack, { ok: true });
      emitSnapshot(room);
    });
  }

  socket.on('game:reveal', (_payload, ack) => {
    const room = roomFor(socket);
    const mod = room && gameModuleFor(room);
    if (!mod) return ackRes(ack, { ok: false, error: 'not_found' });
    const res = mod.reveal(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // `free` games: the host opens the vote phase once the submissions have
  // been revealed (host-only, from REVEALED submit-phase).
  socket.on('game:startVote', (_payload, ack) => {
    const room = roomFor(socket);
    const mod = room && gameModuleFor(room);
    if (!mod || mod.kind !== 'free') return ackRes(ack, { ok: false, error: 'not_found' });
    const res = mod.startVote(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('room:newRound', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = startNewRound(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // One room → many activities: the host swaps the room's activity (Planning
  // Poker, Team Health, Live Poll, any shipped game) in place. The room code,
  // URL, participants and host are preserved untouched — only the activity
  // state resets. Every client is told to follow via `room:activityChanged`.
  // -------------------------------------------------------------------------
  socket.on('room:switchGame', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    if (room.hostId !== socket.data.participantId) return ackRes(ack, { ok: false, error: 'not_host' });
    const target = String(payload?.game || '');
    // Already on that activity — makes the action idempotent against double-clicks.
    if (target === room.game || (target === 'planning-poker' && !room.game)) {
      return ackRes(ack, { ok: false, error: 'in_progress' });
    }
    if (target !== 'planning-poker' && !GAME_MODULES[target]) {
      return ackRes(ack, { ok: false, error: 'not_found' });
    }
    // Preserve the room's identity; rebuild only the activity state.
    const { code, hostId, teamName, roomTitle, createdAt, locked, participants, emptySince } = room;
    const fresh =
      target === 'planning-poker'
        ? createRoom({ hostName: 'Host' })
        : GAME_MODULES[target].create({ hostName: 'Host', config: payload?.config });
    fresh.code = code;
    fresh.hostId = hostId;
    fresh.teamName = teamName;
    fresh.roomTitle = roomTitle;
    fresh.createdAt = createdAt;
    fresh.locked = locked;
    fresh.participants = participants;
    fresh.emptySince = emptySince;
    fresh.roundId = 0;
    rooms.set(code, fresh);
    logger.info({ code, from: room.game || 'planning-poker', to: target }, 'activity switched');
    io.to(code).emit('room:activityChanged', { game: target, code });
    ackRes(ack, { ok: true });
    emitSnapshot(fresh);
  });

  // -------------------------------------------------------------------------
  // Vote — only while VOTING, and only once. The server owns the lock; a
  // second attempt from the same participant is rejected, period.
  // -------------------------------------------------------------------------
  socket.on('vote:cast', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_found' });
    const res = castVote(room, socket.data.participantId, payload?.value);
    if (res.timerEnded) emitSnapshot(room); // the server-side timer just expired
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Skip — host-only, while VOTING, once. The host does not have to vote:
  // skipping marks them as done so the reveal unlocks when everyone else has
  // voted. Mirrors vote:cast's guards (and its timer-expiry behavior).
  // -------------------------------------------------------------------------
  socket.on('vote:skip', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_found' });
    const res = skipVote(room, socket.data.participantId);
    if (res.timerEnded) emitSnapshot(room); // the server-side timer just expired
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Reveal — only the host. Allowed once the timer ended the round, OR as
  // soon as every participant has voted (even while voting is still live).
  // Actual values stay private until this fires.
  // -------------------------------------------------------------------------
  socket.on('votes:reveal', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = reveal(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // -------------------------------------------------------------------------
  // Host table settings & management
  // -------------------------------------------------------------------------
  // Timer + reveal-mode pick (waiting room only). Timer: Off or 10/15/30s.
  socket.on('room:settings', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    if (payload?.timerSec !== undefined) {
      const res = setTimerSec(room, socket.data.participantId, payload.timerSec);
      if (!res.ok) return ackRes(ack, res);
    }
    if (payload?.revealMode !== undefined) {
      const res = setRevealMode(room, socket.data.participantId, payload.revealMode);
      if (!res.ok) return ackRes(ack, res);
    }
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  // Host-only: lock / unlock the room against new joiners (any phase).
  socket.on('room:lock', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const mod = gameModuleFor(room);
    const res = mod ? mod.setLocked(room, socket.data.participantId, true) : setLocked(room, socket.data.participantId, true);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('room:unlock', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const mod = gameModuleFor(room);
    const res = mod ? mod.setLocked(room, socket.data.participantId, false) : setLocked(room, socket.data.participantId, false);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('participant:remove', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const mod = gameModuleFor(room);
    const res = mod
      ? mod.removeParticipant(room, socket.data.participantId, payload?.participantId)
      : removeParticipant(room, socket.data.participantId, payload?.participantId);
    if (!res.ok) return ackRes(ack, res);
    // Tell that exact socket it's gone, if it's still connected.
    for (const s of io.sockets.sockets.values()) {
      if (s.data.participantId === res.removedId && s.data.roomCode === room.code) {
        s.emit('you:removed');
        s.leave(room.code);
      }
    }
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('room:end', (_p, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    if (room.hostId !== socket.data.participantId) return ackRes(ack, { ok: false, error: 'not_host' });
    logger.info({ code: room.code }, 'room ended');
    io.to(room.code).emit('room:ended');
    for (const s of io.sockets.sockets.values()) if (s.data.roomCode === room.code) s.leave(room.code);
    rooms.delete(room.code);
    ackRes(ack, { ok: true });
  });

  socket.on('disconnect', () => {
    const { roomCode, participantId } = socket.data;
    logger.debug({ socketId: socket.id, ip: clientIp(socket), roomCode, participantId }, 'socket disconnected');
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    const mod = gameModuleFor(room);
    if (mod) mod.disconnectParticipant(room, participantId);
    else disconnectParticipant(room, participantId);
    emitSnapshot(room);
  });
});

// ---------------------------------------------------------------------------
// Room expiry: empty rooms vanish after ROOM_TTL_MS. The rate-limit buckets
// are pruned on the same sweep so stale IPs never accumulate.
// ---------------------------------------------------------------------------

const expirySweep = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const empty = [...room.participants.values()].every((p) => p.status === 'disconnected');
    if (empty && room.emptySince && now - room.emptySince > ROOM_TTL_MS) {
      logger.info({ code }, 'room expired');
      rooms.delete(code);
    }
  }
  createLimiter.prune(now);
  joinLimiter.prune(now);
}, 30_000);

// ---------------------------------------------------------------------------
// Metrics sweep — gauges that can't be updated at event time
// ---------------------------------------------------------------------------

const metricsSweep = setInterval(() => {
  roomsGauge.set(rooms.size);
  socketsGauge.set(io.engine.clientsCount);
}, 5000);

// ---------------------------------------------------------------------------
// Graceful shutdown — tell every room the server is going away, drain, exit.
// ---------------------------------------------------------------------------

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down — rooms are memory-only and will be lost');
  clearInterval(timerSweep);
  clearInterval(expirySweep);
  clearInterval(metricsSweep);
  for (const room of rooms.values()) io.to(room.code).emit('room:ended');
  io.close(() => {
    try {
      httpServer.close();
    } catch {
      // already closed by io.close() in some versions — fine either way
    }
    logger.info('shutdown complete');
    process.exit(0);
  });
  // Hard stop if sockets refuse to drain (keeps the event loop free).
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Process-level error capture — never crash silently.
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  logger.fatal({ err }, 'uncaught exception — shutting down gracefully');
  shutdown('uncaughtException');
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, origin: ORIGIN }, 'realtime server listening (rooms are ephemeral by design)');
});
