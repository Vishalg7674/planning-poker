/**
 * Pure game logic for "Most Likely To" — the room votes on which teammate is
 * most likely to do the thing on the card.
 *
 * This is a self-contained module so the game can ship without touching the
 * planning-poker engine: same transport (code, participants, snapshots), its
 * own state machine and its own actions. Everything here is a plain function
 * over plain data — `server/index.mjs` wires it to Socket.io, and the unit
 * tests drive it directly (see tests/unit/server/mostLikelyTo.test.ts).
 *
 * State machine: WAITING → PLAYING (prompt shown, everyone picks a teammate)
 * → REVEALED (votes are public, the room crowns the winner) → PLAYING again
 * (host starts the next prompt). The host can also reveal as soon as every
 * participant has picked, exactly like planning poker.
 *
 * @typedef {'waiting' | 'playing' | 'revealed'} MltStatus
 * @typedef {{ id: string, name: string, role: 'facilitator' | 'voter', status: 'connected' | 'voted' | 'disconnected', hasVoted: boolean, skipped: boolean, joinedAt: number, hue: number }} MltParticipant
 * @typedef {{ roundId: number, prompt: string, counts: Array<{ participantId: string, count: number }>, winners: string[], topCount: number, totalPicks: number }} MltStats
 * @typedef {{ game: 'most-likely-to', code: string, roundId: number, hostId: string | null, teamName: string, roomTitle: string, createdAt: number, locked: boolean, participants: Map<string, MltParticipant>, status: MltStatus, prompt: string | null, promptOrder: string[], promptIndex: number, picks: Record<string, string>, stats: MltStats | null, emptySince: number | null }} MltGame
 * @typedef {{ ok: true } | { ok: false, error: string }} ActionResult
 * @typedef {{ game: 'most-likely-to', code: string, roundId: number, hostId: string | null, teamName: string, roomTitle: string, createdAt: number, locked: boolean, participants: Array<MltParticipant>, status: MltStatus, prompt: string | null, pickedIds: string[], everyonePicked: boolean, picks: Record<string, string>, stats: MltStats | null }} MltSnapshot
 */

import { addParticipant, genCode, hueFromString } from '../room.mjs';

/** The pool of prompts. The host advances through a shuffled copy each round. */
export const PROMPTS = [
  '…show up 5 minutes early to a meeting?',
  '…forget their laptop at home?',
  '…turn a 5-minute task into a 2-hour deep dive?',
  '…win an argument about something they know nothing about?',
  '…send a message to the wrong chat?',
  '…order takeout three nights in a row?',
  '…name-drop a framework they’ve never actually used?',
  '…volunteer to present to the client?',
  '…have the messiest desk in the office?',
  '…get stuck in an elevator with the CEO?',
  '…reply “LGTM” without reading the PR?',
  '…bring snacks for the whole team?',
  '…fall asleep during a long demo?',
  '…argue that a bug is actually a feature?',
  '…schedule a meeting to plan another meeting?',
  '…rename a variable and call it a refactor?',
  '…be the last one to leave the office?',
  '…break production on a Friday?',
  '…win the office karaoke night?',
  '…claim “it works on my machine”?',
];

/** Deterministic-ish shuffle (Fisher–Yates) so prompts differ per room. */
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create a Most Likely To game with the host already seated.
 * @param {{ hostName?: string, teamName?: string, roomTitle?: string, hasCode?: (code: string) => boolean }} [options]
 * @returns {MltGame}
 */
export function createGame({ hostName, teamName, roomTitle, hasCode = () => false } = {}) {
  const game = {
    game: 'most-likely-to',
    code: genCode(hasCode),
    roundId: 0, // incremented on every startPrompt — stable identity per round
    hostId: null, // set when the host's participant is created
    teamName: (teamName || '').slice(0, 40),
    roomTitle: (roomTitle || '').slice(0, 60),
    createdAt: Date.now(),
    locked: false,
    participants: new Map(), // id -> participant
    status: 'waiting', // 'waiting' | 'playing' | 'revealed'
    prompt: null, // the current prompt ("…show up early?")
    promptOrder: shuffle(PROMPTS), // prompts cycle in this order
    promptIndex: 0,
    picks: {}, // voterId -> targetId (this round only)
    stats: null,
    emptySince: null,
  };
  const host = addParticipant(game, { name: hostName || 'Host', role: 'facilitator' });
  game.hostId = host.id;
  return game;
}

/**
 * Start the next prompt (host-only). Legal from WAITING (first round) and
 * REVEALED (next round) — never while a round is live, which also makes the
 * action idempotent against double-clicks. A fresh prompt is picked from the
 * shuffled order and the previous round's picks are cleared.
 * @param {MltGame} game
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function startPrompt(game, actorId) {
  if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
  if (game.status === 'playing') return { ok: false, error: 'in_progress' };
  game.roundId = (game.roundId || 0) + 1;
  game.status = 'playing';
  game.picks = {};
  game.stats = null;
  game.prompt = game.promptOrder[game.promptIndex % game.promptOrder.length];
  game.promptIndex += 1;
  for (const p of game.participants.values()) {
    p.hasVoted = false;
    p.skipped = false;
    p.status = 'connected';
  }
  return { ok: true };
}

/**
 * Pick a teammate (one per round, permanent — no take-backs). You can never
 * pick yourself, and the target must be a real participant.
 * @param {MltGame} game
 * @param {string} actorId
 * @param {string} targetId
 * @returns {ActionResult}
 */
export function castPick(game, actorId, targetId) {
  const p = game.participants.get(actorId);
  if (!p) return { ok: false, error: 'not_found' };
  if (game.status !== 'playing') return { ok: false, error: 'not_playing' };
  if (p.hasVoted) return { ok: false, error: 'already_voted' };
  const target = game.participants.get(targetId);
  if (!target) return { ok: false, error: 'no_participant' };
  if (targetId === actorId) return { ok: false, error: 'cannot_pick_self' };
  game.picks[actorId] = targetId;
  p.hasVoted = true;
  p.status = 'voted';
  return { ok: true };
}

/**
 * "Everyone has picked" = every participant still at the table has cast a
 * pick. Disconnected participants never deadlock the reveal.
 * @param {MltGame} game
 * @returns {boolean}
 */
export function everyonePicked(game) {
  const eligible = [...game.participants.values()].filter((p) => p.status !== 'disconnected');
  return eligible.length > 0 && eligible.every((p) => game.picks[p.id] !== undefined);
}

/**
 * Reveal the round (host-only). Legal once every participant has picked. The
 * picks become public and stats are computed: per-teammate counts, plus the
 * winner(s) — everyone tied at the top is crowned.
 * @param {MltGame} game
 * @param {string} actorId
 * @returns {ActionResult}
 */
export function reveal(game, actorId) {
  if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
  if (game.status === 'revealed') return { ok: false, error: 'already_revealed' };
  if (game.status === 'waiting') return { ok: false, error: 'not_started' };
  if (!everyonePicked(game)) return { ok: false, error: 'not_all_voted' };
  const counts = {};
  for (const targetId of Object.values(game.picks)) counts[targetId] = (counts[targetId] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const topCount = entries.length ? entries[0][1] : 0;
  const winners = entries.filter(([, c]) => c === topCount).map(([id]) => id);
  game.status = 'revealed';
  game.stats = {
    roundId: game.roundId,
    prompt: game.prompt,
    counts: entries.map(([participantId, count]) => ({ participantId, count })),
    winners,
    topCount,
    totalPicks: Object.keys(game.picks).length,
  };
  return { ok: true };
}

/**
 * Build the privacy-aware snapshot. `picks` (voter → target) only leave the
 * server once the round is revealed — before that only WHO has picked is
 * public (`pickedIds`), never who they picked.
 * @param {MltGame} game
 * @returns {MltSnapshot}
 */
export function buildGameSnapshot(game) {
  const participants = [...game.participants.values()].map((p) => ({ ...p }));
  return {
    game: 'most-likely-to',
    code: game.code,
    roundId: game.roundId,
    hostId: game.hostId,
    teamName: game.teamName,
    roomTitle: game.roomTitle,
    createdAt: game.createdAt,
    locked: game.locked,
    participants,
    status: game.status,
    prompt: game.prompt,
    pickedIds: Object.keys(game.picks),
    everyonePicked: everyonePicked(game),
    picks: game.status === 'revealed' ? { ...game.picks } : {},
    stats: game.status === 'revealed' ? game.stats : null,
  };
}

/**
 * Lock or unlock the game room (host-only, any phase).
 * @param {MltGame} game
 * @param {string} actorId
 * @param {boolean} locked
 * @returns {ActionResult}
 */
export function setLocked(game, actorId, locked) {
  if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
  game.locked = !!locked;
  return { ok: true };
}

/**
 * Host removes a participant (never the host themself) and their pick.
 * @param {MltGame} game
 * @param {string} actorId
 * @param {string} targetId
 * @returns {{ ok: true, removedId: string } | { ok: false, error: string }}
 */
export function removeParticipant(game, actorId, targetId) {
  if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
  if (!targetId || targetId === game.hostId) return { ok: false, error: 'cannot_remove' };
  const target = game.participants.get(targetId);
  if (!target) return { ok: false, error: 'no_participant' };
  game.participants.delete(targetId);
  delete game.picks[targetId];
  return { ok: true, removedId: targetId };
}

/**
 * A socket left — mark the participant disconnected and adjust bookkeeping.
 * @param {MltGame} game
 * @param {string} participantId
 * @returns {void}
 */
export function disconnectParticipant(game, participantId) {
  const p = game.participants.get(participantId);
  if (p) p.status = 'disconnected';
  const anyConnected = [...game.participants.values()].some((x) => x.status !== 'disconnected');
  if (!anyConnected) game.emptySince = Date.now();
  else game.emptySince = null;
  promoteHostIfNeeded(game);
}

/**
 * Promote the longest-connected participant when the host vanishes.
 * @param {MltGame} game
 * @returns {void}
 */
export function promoteHostIfNeeded(game) {
  if (game.hostId && game.participants.has(game.hostId) && game.participants.get(game.hostId).status !== 'disconnected') return;
  const candidates = [...game.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0];
  game.hostId = next ? next.id : null;
}

export { hueFromString };
