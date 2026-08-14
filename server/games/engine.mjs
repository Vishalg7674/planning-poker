/**
 * Generic game engine — one implementation, every game.
 *
 * Most of the catalog shares the same skeleton: the host starts a prompt
 * (WAITING → PLAYING), everyone casts one locked vote, the host reveals
 * (PLAYING → REVEALED), then the host starts the next prompt. Only the prompt
 * shape and the reveal math differ. This module encodes that skeleton once
 * and parameterizes the differences with a config:
 *
 *   - kind 'options'   — pick one of N options. Prompt: { text, options }.
 *                        Vote: option index (string). Reveal: per-option
 *                        counts + the winning option (or a tie).
 *   - kind 'teammate'  — pick a teammate. Prompt: string. Vote: target
 *                        participant id. Reveal: per-teammate counts + the
 *                        winner(s) tied at the top.
 *   - kind 'quiz'      — a question with options and one correct answer.
 *                        Prompt: { text, options, answer }. The answer stays
 *                        secret until reveal. Reveal: per-option counts, who
 *                        got it right, and the correct answer.
 *   - kind 'estimate'  — guess a number; closest wins. Prompt:
 *                        { text, answer, unit }. The answer stays secret.
 *                        Reveal: every guess + the closest player(s).
 *   - kind 'free'      — a short free-text answer, then (optionally) the
 *                        room votes on the best one. Two phases per round:
 *                        submit (everyone types an answer) then, when the
 *                        config says `vote: true`, vote (everyone picks the
 *                        answer they liked most). Prompts may carry a correct
 *                        `answer` — then the reveal flags who got it right
 *                        instead of running a vote.
 *
 * Everything here is a plain function over plain data, exactly like
 * server/room.mjs — server/index.mjs wires the module to Socket.io and the
 * unit tests drive it directly.
 *
 * @typedef {'options' | 'teammate' | 'quiz' | 'estimate' | 'free'} GameKind
 * @typedef {'waiting' | 'playing' | 'revealed'} GameStatus
 * @typedef {{ id: string, name: string, role: 'facilitator' | 'voter', status: 'connected' | 'voted' | 'disconnected', hasVoted: boolean, skipped: boolean, joinedAt: number, hue: number }} GameParticipant
 */

import { addParticipant, genCode } from '../room.mjs';

export const GAME_KINDS = ['options', 'teammate', 'quiz', 'estimate', 'free'];

export const FREE_ANSWER_MAX = 240; // longest free-text answer a player can submit

/** Deterministic-ish shuffle (Fisher–Yates) so prompts differ per room. */
export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create a game module from a config. The returned object is the drop-in
 * contract server/index.mjs expects (create, startPrompt, cast, reveal,
 * committed, setLocked, removeParticipant, disconnectParticipant,
 * buildGameSnapshot) plus the shared room-management helpers.
 *
 * @param {{ id: string, kind: GameKind, prompts: unknown[], castEvent: string, voteEvent?: string, vote?: boolean }} config
 */
export function createGameModule({ id, kind, prompts, castEvent, voteEvent, vote = false }) {
  if (!GAME_KINDS.includes(kind)) throw new Error(`engine: unknown kind "${kind}" for game "${id}"`);
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error(`engine: game "${id}" needs a non-empty prompt bank`);
  }
  if (kind === 'free' && !Array.isArray(castEvent) && !castEvent) {
    throw new Error(`engine: game "${id}" (free) needs a cast event`);
  }

  const mod = {
    game: id,
    kind,
    castEvent,
    /** For `free` games: the event the client uses during the vote phase. */
    voteEvent: voteEvent || null,
    /** For `free` games: whether the room votes on the best answer after revealing. */
    vote: !!vote,
    /** All events this module accepts as a cast (submit + optional vote). */
    castEvents: voteEvent ? [castEvent, voteEvent] : [castEvent],
    PROMPTS: prompts,

    /**
     * Create a game with the host already seated. Named `create` to match the
     * shared game-module contract used by server/index.mjs.
     * @param {{ hostName?: string, teamName?: string, roomTitle?: string, hasCode?: (code: string) => boolean }} [options]
     */
    create({ hostName, teamName, roomTitle, hasCode = () => false } = {}) {
      const game = {
        game: id,
        kind,
        code: genCode(hasCode),
        roundId: 0, // incremented on every startPrompt — stable identity per round
        hostId: null, // set when the host's participant is created
        teamName: (teamName || '').slice(0, 40),
        roomTitle: (roomTitle || '').slice(0, 60),
        createdAt: Date.now(),
        locked: false,
        participants: new Map(), // id -> participant
        status: 'waiting', // 'waiting' | 'playing' | 'revealed'
        prompt: null, // the current prompt (kind-specific shape)
        promptOrder: shuffle(prompts), // prompts cycle in this order
        promptIndex: 0,
        votes: {}, // voterId -> value (this round only)
        stats: null,
        emptySince: null,
        // `free` kind only:
        phase: 'submit', // 'submit' (everyone answers) | 'vote' (pick the best)
        submissions: {}, // participantId -> text (submit phase) — private until reveal
      };
      const host = addParticipant(game, { name: hostName || 'Host', role: 'facilitator' });
      game.hostId = host.id;
      return game;
    },

    /**
     * Start the next prompt (host-only). Legal from WAITING (first round) and
     * REVEALED (next round) — never while a round is live, which also makes
     * the action idempotent against double-clicks.
     * @param {ReturnType<ReturnType<typeof createGameModule>['create']>} game
     * @param {string} actorId
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    startPrompt(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'playing') return { ok: false, error: 'in_progress' };
      game.roundId = (game.roundId || 0) + 1;
      game.status = 'playing';
      game.votes = {};
      game.submissions = {};
      game.phase = 'submit';
      game.stats = null;
      game.prompt = game.promptOrder[game.promptIndex % game.promptOrder.length];
      game.promptIndex += 1;
      for (const p of game.participants.values()) {
        p.hasVoted = false;
        p.skipped = false;
        p.status = 'connected';
      }
      return { ok: true };
    },

    /**
     * Begin the vote phase of a `free` round (host-only, once submissions
     * were revealed, only when the game is vote-enabled and at least two
     * people submitted). Everyone then picks the answer they liked most;
     * `game:reveal` crowns the winner(s) just like teammate picks.
     * @param {*} game
     * @param {string} actorId
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    startVote(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status !== 'revealed' || game.phase !== 'submit') return { ok: false, error: 'in_progress' };
      if (!mod.vote) return { ok: false, error: 'bad_value' };
      if (Object.keys(game.submissions).length < 2) return { ok: false, error: 'not_all_voted' };
      game.phase = 'vote';
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
     * Cast a vote (one per round, permanent — no take-backs). The value shape
     * is kind-specific and validated here so the client can never invent one.
     * @param {*} game
     * @param {string} actorId
     * @param {unknown} value
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    cast(game, actorId, value) {
      const p = game.participants.get(actorId);
      if (!p) return { ok: false, error: 'not_found' };
      if (game.status !== 'playing') return { ok: false, error: 'not_playing' };
      if (p.hasVoted) return { ok: false, error: 'already_voted' };

      const err = validateValue(kind, game, actorId, value);
      if (err) return { ok: false, error: err };

      const v = normalizeValue(kind, value);
      // `free` submits go into `submissions`; the vote phase (and every other
      // kind) goes into `votes`.
      if (kind === 'free' && game.phase === 'submit') game.submissions[actorId] = v;
      else game.votes[actorId] = v;
      p.hasVoted = true;
      p.status = 'voted';
      return { ok: true };
    },

    /**
     * "Everyone has voted" = every participant still at the table has cast a
     * vote. Disconnected participants never deadlock the reveal. For `free`
     * rounds it means everyone submitted (submit phase) or everyone voted
     * (vote phase).
     * @param {*} game
     * @returns {boolean}
     */
    everyoneVoted(game) {
      const eligible = [...game.participants.values()].filter((p) => p.status !== 'disconnected');
      if (eligible.length === 0) return false;
      return eligible.every((p) => {
        if (kind === 'free' && game.phase === 'submit') return game.submissions[p.id] !== undefined;
        return game.votes[p.id] !== undefined;
      });
    },

    /**
     * Reveal the round (host-only). Legal once every participant has voted.
     * The votes become public and the kind-specific stats are computed.
     * @param {*} game
     * @param {string} actorId
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    reveal(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'revealed') return { ok: false, error: 'already_revealed' };
      if (game.status === 'waiting') return { ok: false, error: 'not_started' };
      if (!mod.everyoneVoted(game)) return { ok: false, error: 'not_all_voted' };
      game.status = 'revealed';
      game.stats = computeStats(kind, game);
      return { ok: true };
    },

    /**
     * For `free` rounds the host reveals the submissions (reveal), and for
     * vote-enabled games may then open the vote (startVote). Reaching the
     * next prompt always resets to the submit phase.
     */
    nextPhase(game, actorId) {
      if (kind !== 'free') return { ok: false, error: 'not_found' };
      if (game.status === 'revealed' && game.phase === 'submit') return mod.startVote(game, actorId);
      return { ok: false, error: 'in_progress' };
    },

    /**
     * Build the privacy-aware snapshot. `votes` only leave the server once the
     * round is revealed — before that only WHO has voted is public
     * (`votedIds`), never what they voted. Quiz/estimate answers are stripped
     * from the prompt until reveal.
     * @param {*} game
     * @returns {object}
     */
    buildGameSnapshot(game) {
      const participants = [...game.participants.values()].map((p) => ({ ...p }));
      const revealed = game.status === 'revealed';
      const base = {
        game: id,
        kind,
        code: game.code,
        roundId: game.roundId,
        hostId: game.hostId,
        teamName: game.teamName,
        roomTitle: game.roomTitle,
        createdAt: game.createdAt,
        locked: game.locked,
        participants,
        status: game.status,
        prompt: revealed ? game.prompt : publicPrompt(kind, game.prompt),
        everyoneVoted: mod.everyoneVoted(game),
        stats: revealed ? game.stats : null,
      };
      if (kind === 'free') {
        const voting = game.phase === 'vote';
        // Vote-phase values are private until the final reveal; submit-phase
        // texts are private until the submissions reveal. Once the
        // submissions have been revealed they stay public through the vote
        // phase — the room needs them to see what it's voting on.
        const publicVotes = revealed && voting ? { ...game.votes } : {};
        const submissionsPublic = revealed || voting;
        return {
          ...base,
          phase: game.phase,
          votedIds: voting ? Object.keys(game.votes) : Object.keys(game.submissions),
          votes: publicVotes,
          submissions: submissionsPublic ? { ...game.submissions } : {},
        };
      }
      return {
        ...base,
        votedIds: Object.keys(game.votes),
        votes: revealed ? { ...game.votes } : {},
      };
    },

    /** Has this participant committed a vote this round? (rejoin status) */
    committed(game, participantId) {
      if (kind === 'free' && game.phase === 'submit') return game.submissions?.[participantId];
      return game.votes?.[participantId];
    },

    /**
     * Lock or unlock the game room (host-only, any phase).
     * @param {*} game
     * @param {string} actorId
     * @param {boolean} locked
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    setLocked(game, actorId, locked) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      game.locked = !!locked;
      return { ok: true };
    },

    /**
     * Host removes a participant (never the host themself) and their vote.
     * @param {*} game
     * @param {string} actorId
     * @param {string} targetId
     * @returns {{ ok: true, removedId: string } | { ok: false, error: string }}
     */
    removeParticipant(game, actorId, targetId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (!targetId || targetId === game.hostId) return { ok: false, error: 'cannot_remove' };
      const target = game.participants.get(targetId);
      if (!target) return { ok: false, error: 'no_participant' };
      game.participants.delete(targetId);
      delete game.votes[targetId];
      delete game.submissions[targetId];
      return { ok: true, removedId: targetId };
    },

    /**
     * A socket left — mark the participant disconnected and adjust bookkeeping.
     * @param {*} game
     * @param {string} participantId
     * @returns {void}
     */
    disconnectParticipant(game, participantId) {
      const p = game.participants.get(participantId);
      if (p) p.status = 'disconnected';
      const anyConnected = [...game.participants.values()].some((x) => x.status !== 'disconnected');
      if (!anyConnected) game.emptySince = Date.now();
      else game.emptySince = null;
      promoteHostIfNeeded(game);
    },

    /**
     * Promote the longest-connected participant when the host vanishes.
     * @param {*} game
     * @returns {void}
     */
    promoteHostIfNeeded,
  };
  return mod;
}

// ---------------------------------------------------------------------------
// Kind-specific value validation / normalization / stats / prompt privacy
// ---------------------------------------------------------------------------

/** Validate a raw vote value; returns an error code or null. */
function validateValue(kind, game, actorId, value) {
  const v = String(value ?? '');
  if (kind === 'teammate') {
    const target = game.participants.get(v);
    if (!target) return 'no_participant';
    if (v === actorId) return 'cannot_pick_self';
    return null;
  }
  if (kind === 'options' || kind === 'quiz') {
    const prompt = game.prompt;
    if (!prompt || !Array.isArray(prompt.options)) return 'bad_value';
    if (!/^\d+$/.test(v)) return 'bad_value';
    if (Number(v) < 0 || Number(v) >= prompt.options.length) return 'bad_value';
    return null;
  }
  if (kind === 'estimate') {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return 'bad_estimate';
    return null;
  }
  if (kind === 'free') {
    if (game.phase === 'vote') {
      // Vote phase: pick a submission owner. Can't vote for yourself.
      if (!game.submissions[v]) return 'no_participant';
      if (v === actorId) return 'cannot_pick_self';
      return null;
    }
    // Submit phase: non-empty free text, clamped server-side.
    if (!v.trim()) return 'no_value';
    if (v.trim().length > FREE_ANSWER_MAX) return 'too_long';
    return null;
  }
  return 'bad_value';
}

/** Normalize a validated value to its stored form. */
function normalizeValue(kind, value) {
  if (kind === 'free') return String(value ?? '').trim();
  return String(value ?? '');
}

/** Strip the secret parts of a prompt for pre-reveal snapshots. */
function publicPrompt(kind, prompt) {
  if (!prompt) return null;
  // quiz / estimate / free all carry a secret `answer` (or `answerText`) that
  // must not leave the server before the reveal.
  if (kind === 'quiz' || kind === 'estimate' || kind === 'free') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the secret fields are deliberately stripped
    const { answer: _answer, answerText: _answerText, ...rest } = prompt;
    return rest;
  }
  return prompt;
}

/** Compute the kind-specific reveal stats. */
function computeStats(kind, game) {
  const values = Object.values(game.votes);
  if (kind === 'teammate') return teammateStats(game);
  if (kind === 'options') return optionsStats(game, values);
  if (kind === 'quiz') return quizStats(game, values);
  if (kind === 'free') return freeStats(game);
  return estimateStats(game, values);
}

function teammateStats(game) {
  const counts = {};
  for (const targetId of Object.values(game.votes)) counts[targetId] = (counts[targetId] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const topCount = entries.length ? entries[0][1] : 0;
  const winners = entries.filter(([, c]) => c === topCount).map(([id]) => id);
  return {
    roundId: game.roundId,
    prompt: game.prompt,
    counts: entries.map(([participantId, count]) => ({ participantId, count })),
    winners,
    topCount,
    totalVotes: Object.keys(game.votes).length,
  };
}

function optionsStats(game, values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const topCount = sorted.length ? sorted[0][1] : 0;
  const topOptions = sorted.filter(([, c]) => c === topCount).map(([idx]) => idx);
  const winner = topOptions.length === 1 ? Number(topOptions[0]) : 'tie';
  return {
    roundId: game.roundId,
    prompt: game.prompt,
    counts: entries.map(([option, count]) => ({ option: Number(option), count })),
    totalVotes: values.length,
    winner,
    topCount,
  };
}

function quizStats(game, values) {
  const prompt = game.prompt;
  const correctIndex = Number(prompt.answer);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
  const correctIds = Object.entries(game.votes).filter(([, v]) => Number(v) === correctIndex).map(([id]) => id);
  return {
    roundId: game.roundId,
    prompt,
    correctIndex,
    correctText: prompt.options[correctIndex],
    counts: entries.map(([option, count]) => ({ option: Number(option), count })),
    correctIds,
    wrongIds: Object.keys(game.votes).filter((id) => !correctIds.includes(id)),
    totalVotes: values.length,
  };
}

function estimateStats(game, values) {
  const prompt = game.prompt;
  const answer = Number(prompt.answer);
  const distance = (v) => Math.abs(Number(v) - answer);
  const sorted = Object.entries(game.votes).sort((a, b) => distance(a[1]) - distance(b[1]));
  const closest = sorted.length ? distance(sorted[0][1]) : null;
  const winnerIds = sorted.filter(([, v]) => distance(v) === closest).map(([id]) => id);
  return {
    roundId: game.roundId,
    prompt,
    answer,
    unit: prompt.unit || '',
    guesses: sorted.map(([participantId, value]) => ({ participantId, value, distance: Math.round(distance(value) * 1000) / 1000 })),
    winnerIds,
    closest,
    totalVotes: values.length,
  };
}

/**
 * `free` kind stats — depends on the phase the reveal happened in:
 *  - submit phase: every answer, with optional correct/wrong flags when the
 *    prompt carried a secret `answer` (or fuzzy `answerText`).
 *  - vote phase: counts per submission, crown the winner(s) like teammate.
 */
function freeStats(game) {
  const prompt = game.prompt || {};
  if (game.phase === 'vote') {
    const counts = {};
    for (const targetId of Object.values(game.votes)) counts[targetId] = (counts[targetId] || 0) + 1;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const topCount = entries.length ? entries[0][1] : 0;
    const winners = entries.filter(([, c]) => c === topCount).map(([id]) => id);
    return {
      roundId: game.roundId,
      phase: 'vote',
      prompt: game.prompt,
      submissions: { ...game.submissions },
      counts: entries.map(([participantId, count]) => ({ participantId, count })),
      winners,
      topCount,
      totalVotes: Object.keys(game.votes).length,
    };
  }
  // Submit-phase reveal: every answer, plus correctness when applicable.
  const submissions = Object.entries(game.submissions).map(([participantId, text]) => {
    const entry = { participantId, text };
    const answer = prompt.answer;
    if (answer !== undefined) {
      entry.correct = fuzzyMatches(String(text), String(answer));
      entry.answer = String(answer);
    } else if (prompt.answerText !== undefined) {
      const correct = String(prompt.answerText).toLowerCase();
      const mine = String(text).toLowerCase();
      entry.correct = correct === mine || correct.includes(mine) || mine.includes(correct);
      entry.answer = String(prompt.answerText);
    }
    return entry;
  });
  const correctIds = submissions.filter((s) => s.correct).map((s) => s.participantId);
  return {
    roundId: game.roundId,
    phase: 'submit',
    prompt: game.prompt,
    submissions,
    correctIds,
    wrongIds: Object.keys(game.submissions).filter((id) => !correctIds.includes(id)),
    totalSubmissions: submissions.length,
  };
}

/** Loose equality for answer checks: trim, lowercase, drop trailing punctuation. */
function fuzzyMatches(a, b) {
  const clean = (s) => s.trim().toLowerCase().replace(/[.!?,;:'"]+$/g, '');
  return clean(a) === clean(b);
}

/** Host-promotion helper shared by every module. */
export function promoteHostIfNeeded(game) {
  if (game.hostId && game.participants.has(game.hostId) && game.participants.get(game.hostId).status !== 'disconnected') return;
  const candidates = [...game.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0];
  game.hostId = next ? next.id : null;
}

export { hueFromString } from '../room.mjs';
