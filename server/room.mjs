/**
 * Pure room-state logic for Reveal's in-memory realtime server.
 *
 * Everything here is a plain function over plain data: no sockets, no
 * timers, no process I/O. `server/index.mjs` wires these helpers to
 * Socket.io; unit tests exercise them directly (see tests/unit/server).
 *
 * State machine: WAITING → VOTING → (ENDED | everyone-voted) → REVEALED.
 * The server owns every rule that matters — who may start, when a vote is
 * accepted, when a reveal is legal — so the client can never bypass a lock.
 *
 * @typedef {'waiting' | 'voting' | 'ended' | 'revealed'} RoomStatus
 * @typedef {'connected' | 'voted' | 'disconnected'} ParticipantStatus
 * @typedef {{ id: string, name: string, role: 'facilitator' | 'voter', status: ParticipantStatus, hasVoted: boolean, joinedAt: number, hue: number }} Participant
 * @typedef {{ count: number, mode: string, modeShare: number, unique: number, avg: number | null, median: number | null, spread: number | null, level: 'full' | 'strong' | 'some' | 'large', counts: Array<{ value: string, count: number }> }} RoomStats
 * @typedef {{ code: string, hostId: string | null, teamName: string, createdAt: number, settings: { deckId: string, timerSec: number | null }, participants: Map<string, Participant>, status: RoomStatus, votes: Record<string, string>, stats: RoomStats | null, timer: { durationSec: number, endsAt: number } | null, emptySince: number | null }} Room
 * @typedef {{ ok: true } | { ok: false, error: string, timerEnded?: boolean }} ActionResult
 */

export const ROOM_TTL_MS = 10 * 60 * 1000; // empty rooms live 10 more minutes, then vanish
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const CODE_LENGTH = 5;

export const KNOWN_DECKS = new Set(['standard', 'fibonacci', 'tshirt', 'powers2']);
export const KNOWN_TIMERS = new Set([10, 15, 30]); // seconds — Off is null
export const DEFAULT_DECK = 'fibonacci';

/**
 * Unique room code from the unambiguous alphabet; never collides with `hasCode`.
 * @param {(code: string) => boolean} [hasCode]
 * @returns {string}
 */
export function genCode(hasCode = () => false) {
  let code = '';
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (hasCode(code));
  return code;
}

/**
 * Create a room with the host already seated.
 * @param {{ hostName?: string, teamName?: string, deckId?: string, hasCode?: (code: string) => boolean }} [options]
 * @returns {Room}
 */
export function createRoom({ hostName, teamName, deckId, hasCode = () => false } = {}) {
  const code = genCode(hasCode);
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
  return room;
}

/**
 * Seat a participant (or return an existing one when `id` matches).
 * @param {Room} room
 * @param {{ name?: string, role?: 'facilitator' | 'voter', id?: string }} [options]
 * @returns {Participant}
 */
export function addParticipant(room, { name, role = 'voter', id } = {}) {
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

/**
 * Deterministic hue from a name so avatars are stable per participant.
 * @param {string} str
 * @returns {number}
 */
export function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

/**
 * Compute result stats from vote values (ignores non-voters).
 * @param {string[]} values
 * @returns {RoomStats | null}
 */
export function computeStats(values) {
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
 * @param {Room} room
 * @returns {boolean}
 */
export function everyoneHasVoted(room) {
  const eligible = [...room.participants.values()].filter((p) => p.status !== 'disconnected');
  return eligible.length > 0 && eligible.every((p) => room.votes[p.id] !== undefined);
}

/**
 * Build the privacy-aware snapshot sent to clients.
 * @param {Room} room
 * @returns {import('../src/lib/types').Snapshot}
 */
export function buildSnapshot(room) {
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

/**
 * Start the round. Only the host, only from WAITING. The timer is whatever
 * the host picked in the waiting room (Off = null).
 * @param {Room} room
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function startVoting(room, actorId) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'waiting') return { ok: false, error: 'in_progress' };
  room.status = 'voting';
  room.votes = {};
  room.stats = null;
  for (const p of room.participants.values()) {
    p.hasVoted = false;
    p.status = 'connected';
  }
  const sec = room.settings.timerSec;
  room.timer = sec ? { durationSec: sec, endsAt: Date.now() + sec * 1000 } : null;
  return { ok: true };
}

/**
 * Cast a vote. The server owns the lock: a second attempt from the same
 * participant is rejected, period. Votes landing after the timer hit zero
 * flip the room to ENDED and are rejected.
 * @param {Room} room
 * @param {string} participantId
 * @param {unknown} value
 * @returns {ActionResult}
 */
export function castVote(room, participantId, value) {
  const p = room.participants.get(participantId);
  if (!p) return { ok: false, error: 'not_found' };
  if (room.status === 'revealed') return { ok: false, error: 'revealed' };
  if (room.status !== 'voting') return { ok: false, error: 'not_voting' };
  // The server owns the timer: a vote that lands after it hit zero is closed.
  if (room.timer && room.timer.endsAt <= Date.now()) {
    room.status = 'ended';
    return { ok: false, error: 'not_voting', timerEnded: true };
  }
  if (p.hasVoted) return { ok: false, error: 'already_voted' };
  const v = String(value ?? '');
  if (!v) return { ok: false, error: 'no_value' };
  room.votes[p.id] = v;
  p.hasVoted = true;
  p.status = 'voted';
  return { ok: true };
}

/**
 * Reveal the round. Only the host. Allowed once the timer ended the round,
 * OR as soon as every participant has voted (even while voting is still
 * live). Actual values stay private until this fires.
 * @param {Room} room
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function reveal(room, actorId) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status === 'revealed') return { ok: false, error: 'already_revealed' };
  if (room.status === 'waiting') return { ok: false, error: 'not_started' };
  if (room.status !== 'ended' && !(room.status === 'voting' && everyoneHasVoted(room))) {
    return { ok: false, error: 'not_all_voted' };
  }
  room.status = 'revealed';
  room.stats = computeStats(Object.values(room.votes));
  room.timer = null;
  return { ok: true };
}

/**
 * Timer pick (waiting room only): Off (null) or one of 10 / 15 / 30 seconds.
 * @param {Room} room
 * @param {string} actorId
 * @param {unknown} timerSec
 * @returns {ActionResult}
 */
export function setTimerSec(room, actorId, timerSec) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'waiting') return { ok: false, error: 'in_progress' };
  const t = timerSec == null ? null : Number(timerSec);
  if (t !== null && !KNOWN_TIMERS.has(t)) return { ok: false, error: 'bad_timer' };
  room.settings.timerSec = t;
  return { ok: true };
}

/**
 * Host removes a participant (never the host themself).
 * @param {Room} room
 * @param {string} actorId
 * @param {string} targetId
 * @returns {{ ok: true, removedId: string } | { ok: false, error: string }}
 */
export function removeParticipant(room, actorId, targetId) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (!targetId || targetId === room.hostId) return { ok: false, error: 'cannot_remove' };
  const target = room.participants.get(targetId);
  if (!target) return { ok: false, error: 'no_participant' };
  room.participants.delete(targetId);
  delete room.votes[targetId];
  return { ok: true, removedId: targetId };
}

/**
 * A socket left — mark the participant disconnected and adjust room bookkeeping.
 * @param {Room} room
 * @param {string} participantId
 * @returns {void}
 */
export function disconnectParticipant(room, participantId) {
  const p = room.participants.get(participantId);
  if (p) p.status = 'disconnected';
  const anyConnected = [...room.participants.values()].some((x) => x.status !== 'disconnected');
  if (!anyConnected) room.emptySince = Date.now();
  else room.emptySince = null;
  promoteHostIfNeeded(room);
}

/**
 * Promote the longest-connected participant when the host vanishes.
 * @param {Room} room
 * @returns {void}
 */
export function promoteHostIfNeeded(room) {
  if (room.hostId && room.participants.has(room.hostId) && room.participants.get(room.hostId).status !== 'disconnected') return;
  const candidates = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0];
  if (next) {
    room.hostId = next.id;
  } else {
    room.hostId = null;
  }
}
