/**
 * Live Poll — a hosted activity inside the shared room model.
 *
 * The host asks the room a question with a set of options; everyone votes
 * once (single choice, multiple choice, or yes/no); results stay hidden
 * until the host reveals. Reveal shows per-option counts, percentages, a
 * winner, and total participation.
 *
 * The module follows the exact contract of server/games/engine.mjs so the
 * socket layer, room management, and GameRoom component handle it like any
 * other shipped game — one room, same participants, same lifecycle:
 *   waiting → playing (vote) → revealed → [New Poll] → playing
 *
 * Privacy: with `hideResults` (default ON) the snapshot exposes only WHO has
 * voted (`votedIds`), never what. With `anonymous` (default ON) even the
 * reveal only shows aggregate counts — no per-participant votes.
 */
import { addParticipant, genCode, promoteHostIfNeeded } from '../room.mjs';

export const POLL_OPTIONS_MAX = 12;
export const POLL_TYPES = ['single', 'multiple', 'yesno'];
export const DEFAULT_OPTIONS = ['Yes', 'No', 'Maybe'];

const DEFAULT_CONFIG = {
  question: 'Should we deploy this Friday?',
  options: DEFAULT_OPTIONS,
  type: 'single',
  anonymous: true,
  hideResults: true,
};

/** Clamp + validate a host-supplied poll config; falls back to safe defaults. */
export function sanitizePollConfig(config) {
  const c = config && typeof config === 'object' ? config : {};
  const rawOptions = Array.isArray(c.options)
    ? c.options.map((x) => String(x ?? '').trim().slice(0, 60)).filter(Boolean)
    : [...DEFAULT_OPTIONS];
  const options = [...new Set(rawOptions)].slice(0, POLL_OPTIONS_MAX);
  let type = POLL_TYPES.includes(c.type) ? c.type : 'single';
  // A yes/no poll is a two-option single-choice; force the canonical labels
  // so the client can render the YES/NO treatment reliably.
  if (type === 'yesno') {
    type = 'single';
    const canonical = ['Yes', 'No'];
    return {
      question: (typeof c.question === 'string' ? c.question.trim() : '').slice(0, 160) || DEFAULT_CONFIG.question,
      options: canonical,
      type: 'yesno',
      anonymous: c.anonymous !== false,
      hideResults: c.hideResults !== false,
    };
  }
  return {
    question: (typeof c.question === 'string' ? c.question.trim() : '').slice(0, 160) || DEFAULT_CONFIG.question,
    options: options.length >= 2 ? options : [...DEFAULT_OPTIONS],
    type,
    anonymous: c.anonymous !== false,
    hideResults: c.hideResults !== false,
  };
}

/** Per-option counts (aggregate only — anonymity-safe). */
function countVotes(game) {
  const counts = game.config.options.map(() => 0);
  for (const value of Object.values(game.votes)) {
    if (Array.isArray(value)) {
      for (const s of value) counts[Number(s)] += 1;
    } else {
      counts[Number(value)] += 1;
    }
  }
  return counts;
}

function pollStats(game) {
  const counts = countVotes(game);
  const totalVotes = Object.keys(game.votes).length;
  const totalSelections = counts.reduce((a, b) => a + b, 0);
  const entries = counts.map((count, option) => ({
    option,
    count,
    percent: totalSelections ? Math.round((count / totalSelections) * 100) : 0,
  }));
  const sorted = [...entries].sort((a, b) => b.count - a.count || a.option - b.option);
  const topCount = sorted.length ? sorted[0].count : 0;
  const topOptions = sorted.filter((e) => e.count === topCount).map((e) => e.option);
  const winner = topOptions.length === 1 ? topOptions[0] : 'tie';
  game.history.push({ roundId: game.roundId, question: game.config.question, winner, topCount, totalVotes });
  return {
    roundId: game.roundId,
    question: game.config.question,
    counts: entries,
    totalVotes,
    totalSelections,
    winner,
    topCount,
    anonymous: game.config.anonymous,
  };
}

/** Live counts for open polls (hideResults = OFF) — aggregate only. */
function liveCounts(game) {
  const counts = countVotes(game);
  return { counts, total: Object.keys(game.votes).length };
}

/** Live Poll module — drop-in for the shared game contract. */
export function createLivePollModule() {
  const mod = {
    game: 'live-poll',
    kind: 'poll',
    castEvent: 'game:pollVote',
    castEvents: ['game:pollVote'],
    vote: false,

    /**
     * Create a room with the host seated and the configured question.
     * @param {{ hostName?: string, teamName?: string, roomTitle?: string, config?: unknown, hasCode?: (code: string) => boolean }} [options]
     */
    create({ hostName, teamName, roomTitle, hasCode = () => false, config } = {}) {
      const game = {
        game: 'live-poll',
        kind: 'poll',
        code: genCode(hasCode),
        roundId: 0, // incremented on every startPrompt — stable identity per poll
        hostId: null, // set when the host's participant is created
        teamName: (teamName || '').slice(0, 40),
        roomTitle: (roomTitle || '').slice(0, 60),
        createdAt: Date.now(),
        locked: false,
        participants: new Map(), // id -> participant
        status: 'waiting', // 'waiting' | 'playing' | 'revealed'
        config: sanitizePollConfig(config),
        votes: {}, // participantId -> option index (string) | array of indices — private until reveal
        history: [], // { roundId, question, winner, topCount, totalVotes }
        stats: null,
        emptySince: null,
      };
      const host = addParticipant(game, { name: hostName || 'Host', role: 'facilitator' });
      game.hostId = host.id;
      return game;
    },

    /**
     * Start (or restart) the poll — host-only. Legal from WAITING (first
     * run) and REVEALED (New Poll); idempotent against double-clicks.
     */
    startPrompt(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'playing') return { ok: false, error: 'in_progress' };
      game.roundId = (game.roundId || 0) + 1;
      game.status = 'playing';
      game.votes = {};
      game.stats = null;
      for (const p of game.participants.values()) {
        p.hasVoted = false;
        p.skipped = false;
        p.status = 'connected';
      }
      return { ok: true };
    },

    /**
     * Cast a vote — one per participant, permanent. Single/yesno take one
     * option index; multiple takes a non-empty array of indices. Everything
     * is validated against the room's own options so the client can never
     * invent an option.
     */
    cast(game, actorId, value) {
      const p = game.participants.get(actorId);
      if (!p) return { ok: false, error: 'not_found' };
      if (game.status !== 'playing') return { ok: false, error: 'not_playing' };
      if (p.hasVoted) return { ok: false, error: 'already_voted' };
      const { options, type } = game.config;
      if (type === 'multiple') {
        if (!Array.isArray(value) || value.length === 0) return { ok: false, error: 'no_value' };
        const clean = [];
        for (const raw of value) {
          const s = String(raw);
          if (!/^\d+$/.test(s)) return { ok: false, error: 'bad_value' };
          const idx = Number(s);
          if (idx < 0 || idx >= options.length) return { ok: false, error: 'bad_value' };
          if (!clean.includes(s)) clean.push(s);
        }
        game.votes[actorId] = clean;
      } else {
        const s = String(value ?? '');
        if (!/^\d+$/.test(s)) return { ok: false, error: 'bad_value' };
        const idx = Number(s);
        if (idx < 0 || idx >= options.length) return { ok: false, error: 'bad_value' };
        game.votes[actorId] = s;
      }
      p.hasVoted = true;
      p.status = 'voted';
      return { ok: true };
    },

    /** Everyone still at the table has voted. */
    everyoneVoted(game) {
      const eligible = [...game.participants.values()].filter((p) => p.status !== 'disconnected');
      if (eligible.length === 0) return false;
      return eligible.every((p) => game.votes[p.id] !== undefined);
    },

    /** Reveal (host-only) once everyone has voted — computes the stats. */
    reveal(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'revealed') return { ok: false, error: 'already_revealed' };
      if (game.status === 'waiting') return { ok: false, error: 'not_started' };
      if (!mod.everyoneVoted(game)) return { ok: false, error: 'not_all_voted' };
      game.status = 'revealed';
      game.stats = pollStats(game);
      return { ok: true };
    },

    /**
     * Privacy-aware snapshot. Pre-reveal: only votedIds (plus optional live
     * aggregate counts when hideResults is OFF). Post-reveal: aggregate stats
     * always; per-participant votes only when not anonymous.
     */
    buildGameSnapshot(game) {
      const revealed = game.status === 'revealed';
      return {
        game: 'live-poll',
        kind: 'poll',
        code: game.code,
        roundId: game.roundId,
        hostId: game.hostId,
        teamName: game.teamName,
        roomTitle: game.roomTitle,
        createdAt: game.createdAt,
        locked: game.locked,
        participants: [...game.participants.values()].map((p) => ({ ...p })),
        status: game.status,
        config: { ...game.config },
        votedIds: Object.keys(game.votes),
        everyoneVoted: mod.everyoneVoted(game),
        stats: revealed ? game.stats : null,
        history: [...game.history],
        votes: revealed && !game.config.anonymous ? { ...game.votes } : {},
        liveCounts: !revealed && !game.config.hideResults ? liveCounts(game) : null,
      };
    },

    /** Has this participant voted? (rejoin status) */
    committed(game, participantId) {
      return game.votes?.[participantId] !== undefined;
    },

    setLocked(game, actorId, locked) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      game.locked = !!locked;
      return { ok: true };
    },

    removeParticipant(game, actorId, targetId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (!targetId || targetId === game.hostId) return { ok: false, error: 'cannot_remove' };
      const target = game.participants.get(targetId);
      if (!target) return { ok: false, error: 'no_participant' };
      game.participants.delete(targetId);
      delete game.votes[targetId];
      return { ok: true, removedId: targetId };
    },

    disconnectParticipant(game, participantId) {
      const p = game.participants.get(participantId);
      if (p) p.status = 'disconnected';
      const anyConnected = [...game.participants.values()].some((x) => x.status !== 'disconnected');
      if (!anyConnected) game.emptySince = Date.now();
      else game.emptySince = null;
      promoteHostIfNeeded(game);
    },

    promoteHostIfNeeded,
  };
  return mod;
}
