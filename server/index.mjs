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
 * Ops surfaces:
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
import { createWindowLimiter, makeSocketLimiter, clientIp } from './rateLimit.mjs';

// Render / Railway inject a random PORT into the environment; SOCKET_PORT
// (local dev) wins when both are set.
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
const VOTE_EVENTS = new Set(['vote:cast', 'vote:skip']);
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
  const snapshot = buildSnapshot(room);
  snapshotsTotal.inc();
  broadcastBytes.inc(Buffer.byteLength(JSON.stringify(snapshot)));
  io.to(room.code).emit('snapshot', snapshot);
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

  // Per-packet guard: count every event for metrics, then apply the buckets.
  // Dropped packets still get a `rate_limited` ack so clients see a message
  // instead of a silent hang. The whole body is guarded: a throwing limiter
  // must reject that one packet — never take down the process (room state
  // lives only in memory, so a crash would end every session).
  socket.use(([event, , ack], next) => {
    try {
      eventsTotal.inc({ event });
      if (RATE_LIMIT_DISABLED) return next();
      let limited = false;
      if (event === 'room:create') limited = !createLimiter.allow(clientIp(socket));
      else if (event === 'room:join') limited = !joinLimiter.allow(clientIp(socket));
      else if (VOTE_EVENTS.has(event)) limited = !voteLimiter(socket); // makeSocketLimiter returns a callable, not an object
      if (limited) {
        rateLimitedEvents.inc({ event });
        logger.warn({ event, ip: clientIp(socket), socketId: socket.id }, 'rate limited');
        if (typeof ack === 'function') ack({ ok: false, error: 'rate_limited' });
        return; // drop the packet — the handler never runs
      }
      next();
    } catch (e) {
      Sentry.captureException(e);
      logger.error({ event, err: e, socketId: socket.id }, 'socket middleware threw');
      if (typeof ack === 'function') ack({ ok: false, error: 'internal_error' });
    }
  });

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
      logger.info({ code: room.code }, 'room created');
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
      ackRes(ack, { ok: true, participantId: null, screen: true, snapshot: buildSnapshot(room) });
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
      participant.status = room.votes?.[participant.id] !== undefined ? 'voted' : 'connected';
    } else {
      participant = addParticipant(room, { name, role: 'voter', id });
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participant.id;
    room.emptySince = null;
    ackRes(ack, { ok: true, participantId: participant.id, snapshot: buildSnapshot(room) });
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
    participant.status = room.votes?.[participant.id] !== undefined ? 'voted' : 'connected';
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.participantId = participantId;
    room.emptySince = null;
    ackRes(ack, { ok: true, participantId, snapshot: buildSnapshot(room) });
    emitSnapshot(room);
  });

  /** Verify the socket is inside a room and it's a seated participant. */
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
  socket.on('room:newRound', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = startNewRound(room, socket.data.participantId);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
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
  socket.on('room:lock', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = setLocked(room, socket.data.participantId, true);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('room:unlock', (_payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = setLocked(room, socket.data.participantId, false);
    if (!res.ok) return ackRes(ack, res);
    ackRes(ack, { ok: true });
    emitSnapshot(room);
  });

  socket.on('participant:remove', (payload, ack) => {
    const room = roomFor(socket);
    if (!room) return ackRes(ack, { ok: false, error: 'not_host' });
    const res = removeParticipant(room, socket.data.participantId, payload?.participantId);
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
    disconnectParticipant(room, participantId);
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
function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown requested');
  logger.info('closing connections and releasing the port');
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
    logger.info('shutdown complete — port released');
    process.exit(exitCode);
  });
  // Hard stop if sockets refuse to drain (keeps the event loop free).
  setTimeout(() => process.exit(exitCode), 5000).unref();
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
  // A fatal error must not be hidden: rooms are told they ended, then the
  // process exits non-zero so process managers / CI see the failure.
  logger.fatal({ err }, 'uncaught exception — shutting down');
  shutdown('uncaughtException', 1);
});

// ---------------------------------------------------------------------------
// Startup errors — a port conflict must fail fast with a clear, actionable
// message (no raw stack trace in the terminal), while any other startup error
// keeps its full detail in the pino logs. Without this listener the EADDRINUSE
// error event would escalate into the uncaughtException handler, which treats
// it as a graceful shutdown and exits 0 — silently masking the failure.
// ---------------------------------------------------------------------------

httpServer.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error('\n[rt] Realtime server could not start.');
    console.error(`[rt] Port ${PORT} is already in use.`);
    console.error('[rt] Possible causes:');
    console.error('  - Another realtime server is already running (npm run rt, a second npm run dev, or a leftover process)');
    console.error('  - A previous development process did not shut down cleanly (Ctrl+C in some IDE terminals can orphan the child on Windows)');
    console.error('  - The development scripts started the realtime server twice');
    console.error(`[rt] Stop the process holding port ${PORT}, then run again. On Windows:`);
    console.error('      netstat -ano | findstr :3001');
    console.error('      taskkill /PID <pid> /F');
    console.error('[rt] Or run on another port:  SOCKET_PORT=3002 npm run dev');
    process.exit(1);
  }
  logger.error({ err }, 'realtime http server error');
  process.exit(1);
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, origin: ORIGIN }, 'realtime server listening (rooms are ephemeral by design)');
});
