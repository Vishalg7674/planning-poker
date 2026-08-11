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
 * @typedef {'planning-poker' | 'would-you-rather' | 'most-likely-to'} GameId
 * @typedef {{ a: string, b: string }} WyrQuestion
 * @typedef {{ points: Record<string, number>, counts: Record<string, number>, winners: string[], predictors: string[] }} MltRoundResult
 * @typedef {{ id: string, name: string, role: 'facilitator' | 'voter', status: ParticipantStatus, hasVoted: boolean, joinedAt: number, hue: number }} Participant
 * @typedef {{ count: number, mode: string, modeShare: number, unique: number, numeric: boolean, avg: number | null, median: number | null, spread: number | null, highest: number | null, lowest: number | null, range: number | null, level: ConsensusLevel, counts: Array<{ value: string, count: number }> }} RoomStats
 * @typedef {{ code: string, hostId: string | null, teamName: string, roomTitle: string, createdAt: number, game: GameId, questions: WyrQuestion[], questionIndex: number, prompts: string[], promptIndex: number, mltScores: Record<string, number>, mltResult: MltRoundResult | null, sessionOver: boolean, settings: { deckId: DeckId, timerSec: number | null, accent: Accent, revealMode: RevealMode }, locked: boolean, participants: Map<string, Participant>, status: RoomStatus, votes: Record<string, string>, stats: RoomStats | null, timer: { durationSec: number, endsAt: number } | null, emptySince: number | null }} Room
 * @typedef {{ ok: true } | { ok: false, error: string, timerEnded?: boolean }} ActionResult
 */

export const ROOM_TTL_MS = 10 * 60 * 1000; // empty rooms live 10 more minutes, then vanish
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const CODE_LENGTH = 5;

export const KNOWN_GAMES = new Set(['planning-poker', 'would-you-rather', 'most-likely-to']);
export const MAX_WYR_QUESTIONS = 20;
export const MAX_MLT_PROMPTS = 12;

/** Fallback question bank when a WYR room is created without valid questions. */
export const DEFAULT_WYR_QUESTIONS = [
  { a: 'Have the ability to fly', b: 'Have the ability to be invisible' },
  { a: 'Always be 10 minutes early', b: 'Always be 10 minutes late' },
  { a: 'Work from home forever', b: 'Work in the office forever' },
  { a: 'Never write a status update again', b: 'Never read a status update again' },
  { a: 'Be immune to bugs', b: 'Be immune to meetings' },
];

/** Fallback prompt bank when an MLT room is created without valid prompts. */
export const DEFAULT_MLT_PROMPTS = [
  'Forget their laptop at home on the day of the big demo',
  'Reply-all to the entire company by accident',
  'Show up to the meeting 10 minutes late, every single time',
  'Name every file final_v2_FINAL(1).docx',
  'Say “it works on my machine” completely unironically',
  'Push straight to main on a Friday afternoon',
];

/** Default ranking points by placement — mirror of src/lib/scoring.ts. */
export const MLT_RANKING_POINTS = [100, 80, 60, 40, 20, 10];
/** Flat bonus every voter earns for predicting the round's crowned player(s). */
export const MLT_PREDICTOR_BONUS = 20;

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
 * Sanitize client-supplied WYR questions: keep `{a, b}` pairs with non-empty
 * trimmed text, clamp each option to 120 chars, cap the deck at 20. Falls
 * back to the built-in bank when nothing valid survives.
 * @param {unknown} raw
 * @returns {WyrQuestion[]}
 */
export function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return DEFAULT_WYR_QUESTIONS.map((q) => ({ ...q }));
  const clean = raw
    .filter((q) => q && typeof q === 'object' && typeof q.a === 'string' && typeof q.b === 'string')
    .map((q) => ({ a: q.a.trim().slice(0, 120), b: q.b.trim().slice(0, 120) }))
    .filter((q) => q.a && q.b);
  return clean.length ? clean.slice(0, MAX_WYR_QUESTIONS) : DEFAULT_WYR_QUESTIONS.map((q) => ({ ...q }));
}

/**
 * Sanitize client-supplied MLT prompts: keep non-empty trimmed strings, clamp
 * each prompt to 160 chars, cap the deck at MAX_MLT_PROMPTS. Falls back to
 * the built-in bank when nothing valid survives.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizePrompts(raw) {
  if (!Array.isArray(raw)) return DEFAULT_MLT_PROMPTS.map((p) => p);
  const clean = raw
    .filter((p) => typeof p === 'string')
    .map((p) => p.trim().slice(0, 160))
    .filter((p) => p.length > 0);
  return clean.length ? clean.slice(0, MAX_MLT_PROMPTS) : DEFAULT_MLT_PROMPTS.map((p) => p);
}

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
 * room title, deck, accent, reveal mode) is fixed at creation. Would You
 * Rather rooms additionally carry their question deck (`game` + `questions`).
 * @param {{ hostName?: string, teamName?: string, roomTitle?: string, deckId?: string, accent?: string, revealMode?: string, game?: string, questions?: unknown, prompts?: unknown, hasCode?: (code: string) => boolean }} [options]
 * @returns {Room}
 */
export function createRoom({ hostName, teamName, roomTitle, deckId, accent, revealMode, game, questions, prompts, hasCode = () => false } = {}) {
  const code = genCode(hasCode);
  const isWyr = game === 'would-you-rather';
  const isMlt = game === 'most-likely-to';
  const room = {
    code,
    hostId: null, // set when the host's participant is created
    teamName: (teamName || '').slice(0, 40),
    roomTitle: (roomTitle || '').slice(0, 60),
    createdAt: Date.now(),
    game: KNOWN_GAMES.has(game) ? game : 'planning-poker',
    questions: isWyr ? normalizeQuestions(questions) : [],
    questionIndex: -1, // set to 0 when the round starts (WYR only)
    prompts: isMlt ? normalizePrompts(prompts) : [],
    promptIndex: -1, // set to 0 when the session starts (MLT only)
    mltScores: {}, // playerId -> session total (survives Play Again)
    mltResult: null, // computed at reveal (MLT only)
    sessionOver: false, // true once the host finishes the final round (MLT only)
    settings: {
      deckId: KNOWN_DECKS.has(deckId) ? deckId : DEFAULT_DECK,
      timerSec: null, // null = timer OFF; only 10 / 15 / 30 are allowed
      accent: KNOWN_ACCENTS.has(accent) ? accent : DEFAULT_ACCENT,
      revealMode: KNOWN_REVEAL_MODES.has(revealMode) ? revealMode : DEFAULT_REVEAL_MODE,
    },
    locked: false,
    participants: new Map(), // id -> participant
    status: 'waiting', // 'waiting' | 'voting' | 'ended' | 'revealed'
    votes: {}, // participantId -> value (this round / question only)
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
 * Whether a participant name is already taken in the room (case-insensitive,
 * whitespace-trimmed). Names must be unique per room so nobody can impersonate
 * or double-book a seat; the host's own name counts too. Rejoins with an
 * existing participant id skip this via `excludeId`.
 * @param {Room} room
 * @param {string} name
 * @param {string} [excludeId] — a participant to ignore (their own seat)
 * @returns {boolean}
 */
export function isNameTaken(room, name, excludeId) {
  const target = (name || '').trim().toLowerCase();
  if (!target) return false;
  for (const p of room.participants.values()) {
    if (p.id === excludeId) continue;
    if ((p.name || '').trim().toLowerCase() === target) return true;
  }
  return false;
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
/**
 * Compute the A/B split for a Would You Rather question. Same shape as
 * `computeStats` but never numeric: only the distribution, mode and a
 * consensus level (full when the whole room picked the same side).
 * @param {string[]} values — 'A' | 'B' picks
 * @returns {RoomStats | null} — null when there are no votes
 */
export function computeWyrStats(values) {
  if (!values.length) return null;
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return {
    count: values.length,
    mode: entries[0][0],
    modeShare: Math.round((entries[0][1] / values.length) * 1000) / 1000,
    unique: entries.length,
    numeric: false,
    avg: null,
    median: null,
    spread: null,
    highest: null,
    lowest: null,
    range: null,
    level: calculateConsensus(values),
    counts: entries.map(([value, count]) => ({ value, count })),
  };
}

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

/** Standard-competition ranking — mirror of src/lib/scoring.ts calculateRanks. */
function rankScores(scored) {
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
  let prevScore = null;
  let prevRank = 1;
  return sorted.map((entry, index) => {
    if (entry.score === prevScore) return { ...entry, rank: prevRank };
    prevScore = entry.score;
    prevRank = index + 1;
    return { ...entry, rank: prevRank };
  });
}

/**
 * Most Likely To round result — the server computes this at reveal:
 *
 *   - **Crown points**: teammates ranked by nominations received earn the
 *     shared ranking table (100/80/60/40/20/10, 6th+ floors at 10). Ties share
 *     points with the next rank skipped (standard competition); teammates with
 *     zero nominations earn 0.
 *   - **Predictor bonus**: every voter who nominated a crowned (top-voted)
 *     player earns MLT_PREDICTOR_BONUS on top.
 *
 * @param {Room} room
 * @returns {MltRoundResult}
 */
export function computeMltResult(room) {
  const counts = {};
  for (const targetId of Object.values(room.votes)) counts[targetId] = (counts[targetId] || 0) + 1;
  const points = {};
  if (Object.keys(counts).length) {
    const ranked = rankScores(Object.entries(counts).map(([playerId, score]) => ({ playerId, score })));
    for (const r of ranked) {
      points[r.playerId] = MLT_RANKING_POINTS[r.rank - 1] ?? MLT_RANKING_POINTS[MLT_RANKING_POINTS.length - 1];
    }
  }
  const topCount = Object.keys(counts).length ? Math.max(...Object.values(counts)) : 0;
  const winners = Object.entries(counts)
    .filter(([, c]) => c === topCount)
    .map(([id]) => id)
    .sort();
  const predictors = Object.entries(room.votes)
    .filter(([, target]) => winners.includes(target))
    .map(([voter]) => voter)
    .sort();
  for (const voter of predictors) points[voter] = (points[voter] || 0) + MLT_PREDICTOR_BONUS;
  return { points, counts, winners, predictors };
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
  // The active question is public (it's on the table); the vote *values* are
  // not. WYR rooms expose the current question once the round has started.
  const question = room.status === 'waiting' ? null : (room.questions[room.questionIndex] ?? null);
  return {
    code: room.code,
    hostId: room.hostId,
    teamName: room.teamName,
    roomTitle: room.roomTitle,
    createdAt: room.createdAt,
    game: room.game,
    question,
    questionIndex: room.questionIndex >= 0 ? room.questionIndex : 0,
    questionCount: room.questions.length,
    // The active prompt is public once the session starts (MLT rooms).
    prompt: room.status === 'waiting' ? null : (room.prompts[room.promptIndex] ?? null),
    promptIndex: room.promptIndex >= 0 ? room.promptIndex : 0,
    promptCount: room.prompts.length,
    // MLT session data — votes travel in the shared `votes` map (revealed only).
    mltResult: room.status === 'revealed' ? room.mltResult : null,
    mltScores: { ...room.mltScores },
    sessionOver: !!room.sessionOver,
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
  room.status = 'voting';
  room.votes = {};
  room.stats = null;
  room.mltResult = null;
  if (room.game === 'would-you-rather') room.questionIndex = 0; // first question is live
  if (room.game === 'most-likely-to') room.promptIndex = 0; // first prompt is live
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
  // The server validates the value against what this game allows — a client
  // can never invent a card that isn't on the table. Planning Poker votes
  // against the room deck (mirror of src/lib/decks.ts); Would You Rather
  // accepts exactly 'A' | 'B'; Most Likely To accepts a real teammate (not
  // yourself).
  if (room.game === 'most-likely-to') {
    const target = room.participants.get(v);
    if (!target) return { ok: false, error: 'bad_value' };
    if (target.id === participantId) return { ok: false, error: 'self_vote' };
  } else {
    const allowed = room.game === 'would-you-rather' ? ['A', 'B'] : DECK_VALUES[room.settings.deckId] || [];
    if (!allowed.includes(v)) return { ok: false, error: 'bad_value' };
  }
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
  // Planning Poker: only after the timer ended the round, or once every
  // present participant has voted. Would You Rather / Most Likely To: the
  // host sets the pace and may reveal at any time while the round is live.
  const everyoneVoted = room.status === 'voting' && everyoneHasVoted(room);
  const wyrCanReveal = room.game === 'would-you-rather' && (room.status === 'voting' || room.status === 'ended');
  const mltCanReveal = room.game === 'most-likely-to' && (room.status === 'voting' || room.status === 'ended');
  if (room.status !== 'ended' && !everyoneVoted && !wyrCanReveal && !mltCanReveal) {
    return { ok: false, error: 'not_all_voted' };
  }
  room.status = 'revealed';
  if (room.game === 'most-likely-to') {
    // Crown the most-nominated teammate(s), award totals, ship the result.
    room.mltResult = computeMltResult(room);
    for (const [playerId, gained] of Object.entries(room.mltResult.points)) {
      room.mltScores[playerId] = (room.mltScores[playerId] || 0) + gained;
    }
    room.stats = null;
  } else {
    const values = Object.values(room.votes);
    room.stats = room.game === 'would-you-rather' ? computeWyrStats(values) : computeStats(values, room.settings.deckId);
    room.mltResult = null;
  }
  room.timer = null;
  return { ok: true };
}

/**
 * Advance to the next Would You Rather question (host-only, after a reveal).
 * The previous question's votes are wiped — the one-vote-per-question lock
 * resets — and the room returns to VOTING with the next question live.
 * @param {Room} room
 * @param {string} actorId
 * @returns {{ ok: true, done: boolean } | { ok: false, error: string }}
 */
export function nextQuestion(room, actorId) {
  if (room.game !== 'would-you-rather') return { ok: false, error: 'not_this_game' };
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'revealed' && room.status !== 'ended') return { ok: false, error: 'not_revealed' };
  if (room.questionIndex + 1 >= room.questions.length) return { ok: true, done: true };
  room.questionIndex += 1;
  room.votes = {};
  room.stats = null;
  room.status = 'voting';
  for (const p of room.participants.values()) {
    p.hasVoted = false;
    p.status = 'connected';
  }
  const sec = room.settings.timerSec;
  room.timer = sec ? { durationSec: sec, endsAt: Date.now() + sec * 1000 } : null;
  return { ok: true, done: false };
}

/**
 * Advance to the next Most Likely To prompt (host-only, after a reveal). The
 * previous round's nominations are wiped — the one-vote-per-round lock
 * resets — and the room returns to VOTING with the next prompt live.
 * @param {Room} room
 * @param {string} actorId
 * @returns {{ ok: true, done: boolean } | { ok: false, error: string }}
 */
export function nextPrompt(room, actorId) {
  if (room.game !== 'most-likely-to') return { ok: false, error: 'not_this_game' };
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'revealed' && room.status !== 'ended') return { ok: false, error: 'not_revealed' };
  if (room.promptIndex + 1 >= room.prompts.length) return { ok: true, done: true };
  room.promptIndex += 1;
  room.votes = {};
  room.stats = null;
  room.mltResult = null;
  room.status = 'voting';
  for (const p of room.participants.values()) {
    p.hasVoted = false;
    p.status = 'connected';
  }
  room.timer = null;
  return { ok: true, done: false };
}

/**
 * Finish the session (host-only, after the final round's reveal): the server
 * marks `sessionOver` so every client opens the WinnerModal. The room stays
 * alive — Play Again can start a fresh session on the same scores.
 * @param {Room} room
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function finishMlt(room, actorId) {
  if (room.game !== 'most-likely-to') return { ok: false, error: 'not_this_game' };
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (room.status !== 'revealed') return { ok: false, error: 'not_revealed' };
  room.sessionOver = true;
  return { ok: true };
}

/**
 * Play Again (host-only, once the session is over): rounds, nominations and
 * the current prompt reset — the session leaderboard (`mltScores`) is kept so
 * teams can play several sessions and crown an overall champion. The room
 * returns to WAITING; the host starts the next session.
 * @param {Room} room
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function playAgainMlt(room, actorId) {
  if (room.game !== 'most-likely-to') return { ok: false, error: 'not_this_game' };
  if (actorId !== room.hostId) return { ok: false, error: 'not_host' };
  if (!room.sessionOver) return { ok: false, error: 'not_finished' };
  room.promptIndex = -1;
  room.votes = {};
  room.stats = null;
  room.mltResult = null;
  room.sessionOver = false;
  room.status = 'waiting';
  room.timer = null;
  for (const p of room.participants.values()) {
    p.hasVoted = false;
    p.status = 'connected';
  }
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
