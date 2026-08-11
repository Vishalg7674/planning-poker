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
 * @typedef {'fibonacci' | 'modifiedFibonacci' | 'sequential' | 'tshirt' | 'powersOfTwo'} DeckId
 * @typedef {'gold' | 'purple' | 'blue' | 'green'} Accent
 * @typedef {'normal' | 'staggered' | 'dramatic'} RevealMode
 * @typedef {'full' | 'strong' | 'moderate' | 'large'} ConsensusLevel
 * @typedef {{ id: string, name: string, role: 'facilitator' | 'voter', status: ParticipantStatus, hasVoted: boolean, joinedAt: number, hue: number }} Participant
 * @typedef {{ count: number, mode: string, modeShare: number, unique: number, numeric: boolean, avg: number | null, median: number | null, spread: number | null, highest: number | null, lowest: number | null, range: number | null, level: ConsensusLevel, counts: Array<{ value: string, count: number }> }} RoomStats
 * @typedef {{ code: string, roundId: number, hostId: string | null, teamName: string, roomTitle: string, createdAt: number, settings: { deckId: DeckId, timerSec: number | null, accent: Accent, revealMode: RevealMode }, locked: boolean, participants: Map<string, Participant>, status: RoomStatus, votes: Record<string, string>, stats: RoomStats | null, timer: { durationSec: number, endsAt: number } | null, emptySince: number | null }} Room
 * @typedef {{ ok: true } | { ok: false, error: string, timerEnded?: boolean }} ActionResult
 */

export const ROOM_TTL_MS = 10 * 60 * 1000; // empty rooms live 10 more minutes, then vanish
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const CODE_LENGTH = 5;

export const KNOWN_DECKS = new Set(['fibonacci', 'modifiedFibonacci', 'sequential', 'tshirt', 'powersOfTwo']);
export const NUMERIC_DECKS = new Set(['fibonacci', 'modifiedFibonacci', 'sequential', 'powersOfTwo']);

/** The exact card values per deck — mirror of src/lib/decks.ts. Votes are validated against this. */
export const DECK_VALUES = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21'],
  modifiedFibonacci: ['0', '½', '1', '2', '3', '5', '8', '13', '21'],
  sequential: ['1', '2', '3', '4', '5', '6', '7', '8'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL'],
  powersOfTwo: ['1', '2', '4', '8', '16', '32'],
};
export const KNOWN_TIMERS = new Set([10, 15, 30]); // seconds — Off is null
export const KNOWN_ACCENTS = new Set(['gold', 'purple', 'blue', 'green']);
export const KNOWN_REVEAL_MODES = new Set(['normal', 'staggered', 'dramatic']);
export const DEFAULT_DECK = 'fibonacci';
export const DEFAULT_ACCENT = 'gold';
export const DEFAULT_REVEAL_MODE = 'staggered';

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
 * Create a room with the host already seated. Room customization (team name,
 * room title, deck, accent, reveal mode) is fixed at creation.
 * @param {{ hostName?: string, teamName?: string, roomTitle?: string, deckId?: string, accent?: string, revealMode?: string, hasCode?: (code: string) => boolean }} [options]
 * @returns {Room}
 */
export function createRoom({ hostName, teamName, roomTitle, deckId, accent, revealMode, hasCode = () => false } = {}) {
  const code = genCode(hasCode);
  const room = {
    code,
    roundId: 0, // incremented on every startVoting — a stable identity per round
    hostId: null, // set when the host's participant is created
    teamName: (teamName || '').slice(0, 40),
    roomTitle: (roomTitle || '').slice(0, 60),
    createdAt: Date.now(),
    settings: {
      deckId: KNOWN_DECKS.has(deckId) ? deckId : DEFAULT_DECK,
      timerSec: null, // null = timer OFF; only 10 / 15 / 30 are allowed
      accent: KNOWN_ACCENTS.has(accent) ? accent : DEFAULT_ACCENT,
      revealMode: KNOWN_REVEAL_MODES.has(revealMode) ? revealMode : DEFAULT_REVEAL_MODE,
    },
    locked: false,
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
 * Deterministic consensus verdict for a round's submitted votes.
 *
 * Thresholds (documented in docs/TRD.md — change them here and in the docs):
 *   - full:      exactly one unique value (every voter picked the same card)
 *   - strong:    the dominant value holds ≥ 70% of the votes
 *   - moderate:  the dominant value holds ≥ 45%, or there are ≤ 3 unique values
 *   - large:     wide distribution with a weak dominant value (else)
 *
 * The algorithm considers the number of unique values, the dominant-vote
 * percentage, and (for numeric decks) the numeric spread, which feeds the
 * displayed range and the "worth discussing?" suggestion.
 * @param {string[]} values
 * @returns {ConsensusLevel | null} — null when there are no votes
 */
export function calculateConsensus(values) {
  if (!values.length) return null;
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const unique = entries.length;
  if (unique === 1) return 'full';
  const dominantShare = entries[0][1] / values.length;
  if (dominantShare >= 0.7) return 'strong';
  if (dominantShare >= 0.45 || unique <= 3) return 'moderate';
  return 'large';
}

/**
 * Compute result stats from vote values (ignores non-voters). Numeric decks
 * get average/median/highest/lowest/range; T-Shirt gets mode + distribution
 * only (numeric stats are null and the UI hides them).
 * @param {string[]} values
 * @param {string} deckId
 * @returns {RoomStats | null}
 */
export function computeStats(values, deckId = DEFAULT_DECK) {
  if (!values.length) return null;
  const numeric = NUMERIC_DECKS.has(deckId);
  // '½' (modified Fibonacci) is 0.5; every other card parses via Number.
  const toNum = (v) => (v === '½' ? 0.5 : Number(v));
  const nums = numeric ? values.map(toNum).filter((n) => Number.isFinite(n)) : [];
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
  const highest = nums.length ? sorted[sorted.length - 1] : null;
  const lowest = nums.length ? sorted[0] : null;
  const spread = nums.length ? highest - lowest : null;
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    count: values.length,
    mode,
    modeShare: Math.round(modeShare * 1000) / 1000,
    unique,
    numeric,
    avg: round(avg),
    median: round(median),
    spread: round(spread),
    highest: round(highest),
    lowest: round(lowest),
    range: round(spread),
    level: calculateConsensus(values),
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
    roundId: room.roundId,
    hostId: room.hostId,
    teamName: room.teamName,
    roomTitle: room.roomTitle,
    createdAt: room.createdAt,
    settings: { ...room.settings },
    locked: room.locked,
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
  room.roundId = (room.roundId || 0) + 1;
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
  if (p.hasVoted) return { ok: false, error: 'already_voted' };
  const v = String(value ?? '');
  if (!v) return { ok: false, error: 'no_value' };
  // The server validates the value against the room's deck — a client can
  // never invent a card that isn't on the table (mirror of src/lib/decks.ts).
  if (!(DECK_VALUES[room.settings.deckId] || []).includes(v)) return { ok: false, error: 'bad_value' };
  // The server owns the timer: a vote that lands after it hit zero is closed.
  if (room.timer && room.timer.endsAt <= Date.now()) {
    room.status = 'ended';
    return { ok: false, error: 'not_voting', timerEnded: true };
  }
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
  room.stats = computeStats(Object.values(room.votes), room.settings.deckId);
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
 * Reveal-animation pick (waiting room only): normal / staggered / dramatic.
 * @param {Room} room
 * @param {string} actorId
 * @param {unknown} revealMode
 * @returns {ActionResult}
 */
export function setRevealMode(room, actorId, revealMode) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'waiting') return { ok: false, error: 'in_progress' };
  if (!KNOWN_REVEAL_MODES.has(revealMode)) return { ok: false, error: 'bad_reveal_mode' };
  room.settings.revealMode = revealMode;
  return { ok: true };
}

/**
 * Lock or unlock the room (host-only, any phase). While locked, brand-new
 * participants are refused at join time; existing ones stay and can rejoin.
 * @param {Room} room
 * @param {string} actorId
 * @param {boolean} locked
 * @returns {ActionResult}
 */
export function setLocked(room, actorId, locked) {
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  room.locked = !!locked;
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
