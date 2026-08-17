/**
 * Team Health Check — a hosted activity inside the shared room model.
 *
 * The Scrum Master / facilitator defines a set of categories (Communication,
 * Collaboration, Delivery, …) and a rating scale (default 1–5). Every
 * participant rates every category; the ratings stay private until the host
 * reveals the round. Reveal shows per-category averages + an overall score
 * with a health verdict (🟢 Healthy / 🟡 Needs Attention / 🔴 Critical).
 *
 * The module follows the exact contract of server/games/engine.mjs so the
 * socket layer, room management, and GameRoom component handle it like any
 * other shipped game — one room, same participants, same lifecycle:
 *   waiting → playing (rate) → revealed → [New Health Check] → playing
 *
 * State is private until reveal: the snapshot only exposes WHO has submitted
 * (`votedIds`), never the ratings. Anonymous mode (default ON) additionally
 * suppresses the per-participant breakdown at reveal — the room only ever
 * sees aggregate averages.
 */
import { addParticipant, genCode, promoteHostIfNeeded } from '../room.mjs';

export const HEALTH_SCALES = [5, 10];
export const HEALTH_CATEGORY_MAX = 20;
export const DEFAULT_CATEGORIES = ['Communication', 'Collaboration', 'Code Quality', 'Delivery', 'Morale', 'Requirements'];

const DEFAULT_CONFIG = {
  title: 'Team Health Check',
  categories: DEFAULT_CATEGORIES,
  scale: 5,
  anonymous: true,
};

/** Clamp + validate a host-supplied config; falls back to safe defaults. */
export function sanitizeHealthConfig(config) {
  const c = config && typeof config === 'object' ? config : {};
  const rawCats = Array.isArray(c.categories)
    ? c.categories.map((x) => String(x ?? '').trim().slice(0, 40)).filter(Boolean)
    : [...DEFAULT_CATEGORIES];
  const categories = [...new Set(rawCats)].slice(0, HEALTH_CATEGORY_MAX);
  return {
    title: (typeof c.title === 'string' ? c.title.trim() : '').slice(0, 80) || DEFAULT_CONFIG.title,
    categories: categories.length ? categories : [...DEFAULT_CONFIG.categories],
    scale: c.scale === 10 ? 10 : 5,
    anonymous: c.anonymous !== false,
  };
}

/** Health verdict for an average on the 1–scale range. */
export function healthStatus(overall, scale = 5) {
  const ratio = overall / scale;
  if (ratio >= 0.8) return 'healthy'; // 4.0–5.0 on a 5-scale, 8.0–10.0 on a 10-scale
  if (ratio >= 0.6) return 'attention'; // 3.0–3.9 / 6.0–7.9
  return 'critical'; // < 3.0 / < 6.0
}

/** Round one decimal — 3.74 → 3.7, 3.75 → 3.8. */
const round1 = (n) => Math.round(n * 10) / 10;

function healthStats(game) {
  const { categories, scale, anonymous, title } = game.config;
  const entries = Object.entries(game.responses); // [participantId, { ratings }]
  const submitted = entries.length;
  const catStats = categories.map((name) => {
    const values = entries.map(([, r]) => r.ratings[name]).filter((v) => v !== undefined);
    const count = values.length;
    const average = count ? round1(values.reduce((a, b) => a + b, 0) / count) : 0;
    return { name, average, count, status: healthStatus(average, scale) };
  });
  // Overall = average of the category averages (not per-rating), per spec.
  const overall = catStats.length ? round1(catStats.reduce((sum, c) => sum + c.average, 0) / catStats.length) : 0;
  const previous = game.history[game.history.length - 1]?.overall ?? null;
  const trend = previous != null && previous !== 0 ? Math.round(((overall - previous) / previous) * 100) : null;
  const breakdown = anonymous
    ? []
    : entries.map(([participantId, r]) => ({ participantId, ratings: { ...r.ratings } }));
  game.history.push({ roundId: game.roundId, title, overall, submitted });
  return {
    roundId: game.roundId,
    title,
    scale,
    categories: catStats,
    overall,
    overallStatus: healthStatus(overall, scale),
    submitted,
    anonymous,
    breakdown,
    trend,
    previous,
  };
}

/** Team Health Check module — drop-in for the shared game contract. */
export function createTeamHealthModule() {
  const mod = {
    game: 'team-health',
    kind: 'health',
    castEvent: 'game:healthSubmit',
    castEvents: ['game:healthSubmit'],
    vote: false,

    /**
     * Create a room with the host seated and the configured check. `config`
     * holds the host's title / categories / scale / anonymity.
     * @param {{ hostName?: string, teamName?: string, roomTitle?: string, config?: unknown, hasCode?: (code: string) => boolean }} [options]
     */
    create({ hostName, teamName, roomTitle, hasCode = () => false, config } = {}) {
      const game = {
        game: 'team-health',
        kind: 'health',
        code: genCode(hasCode),
        roundId: 0, // incremented on every startPrompt — stable identity per check
        hostId: null, // set when the host's participant is created
        teamName: (teamName || '').slice(0, 40),
        roomTitle: (roomTitle || '').slice(0, 60),
        createdAt: Date.now(),
        locked: false,
        participants: new Map(), // id -> participant
        status: 'waiting', // 'waiting' | 'playing' | 'revealed'
        config: sanitizeHealthConfig(config),
        responses: {}, // participantId -> { ratings: { category: number } } — private until reveal
        history: [], // { roundId, title, overall, submitted } — appended at each reveal
        stats: null,
        emptySince: null,
      };
      const host = addParticipant(game, { name: hostName || 'Host', role: 'facilitator' });
      game.hostId = host.id;
      return game;
    },

    /**
     * Start (or restart) the check — host-only. Legal from WAITING (first
     * run) and REVEALED (New Health Check); a running check can't be restarted,
     * which makes the action idempotent against double-clicks.
     */
    startPrompt(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'playing') return { ok: false, error: 'in_progress' };
      game.roundId = (game.roundId || 0) + 1;
      game.status = 'playing';
      game.responses = {};
      game.stats = null;
      for (const p of game.participants.values()) {
        p.hasVoted = false;
        p.skipped = false;
        p.status = 'connected';
      }
      return { ok: true };
    },

    /**
     * Submit a full health check: every category must carry an integer rating
     * in 1..scale. One submission per participant, permanent.
     */
    cast(game, actorId, value) {
      const p = game.participants.get(actorId);
      if (!p) return { ok: false, error: 'not_found' };
      if (game.status !== 'playing') return { ok: false, error: 'not_playing' };
      if (p.hasVoted) return { ok: false, error: 'already_voted' };
      const ratings = value?.ratings;
      if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) return { ok: false, error: 'no_value' };
      const { categories, scale } = game.config;
      const clean = {};
      for (const cat of categories) {
        const r = Number(ratings[cat]);
        if (!Number.isInteger(r) || r < 1 || r > scale) return { ok: false, error: 'bad_value' };
        clean[cat] = r;
      }
      game.responses[actorId] = { ratings: clean };
      p.hasVoted = true;
      p.status = 'voted';
      return { ok: true };
    },

    /** Everyone still at the table has submitted. */
    everyoneVoted(game) {
      const eligible = [...game.participants.values()].filter((p) => p.status !== 'disconnected');
      if (eligible.length === 0) return false;
      return eligible.every((p) => game.responses[p.id] !== undefined);
    },

    /** Reveal (host-only) once everyone has submitted — computes the stats. */
    reveal(game, actorId) {
      if (actorId !== game.hostId) return { ok: false, error: 'not_host' };
      if (game.status === 'revealed') return { ok: false, error: 'already_revealed' };
      if (game.status === 'waiting') return { ok: false, error: 'not_started' };
      if (!mod.everyoneVoted(game)) return { ok: false, error: 'not_all_voted' };
      game.status = 'revealed';
      game.stats = healthStats(game);
      return { ok: true };
    },

    /** Privacy-aware snapshot — ratings never leave the server pre-reveal. */
    buildGameSnapshot(game) {
      const revealed = game.status === 'revealed';
      return {
        game: 'team-health',
        kind: 'health',
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
        votedIds: Object.keys(game.responses),
        everyoneVoted: mod.everyoneVoted(game),
        stats: revealed ? game.stats : null,
        history: [...game.history],
        // Per-participant ratings only when the host opted out of anonymity —
        // and only after reveal. `stats.breakdown` carries the same data.
        votes: revealed && !game.config.anonymous ? { ...game.responses } : {},
      };
    },

    /** Has this participant submitted? (rejoin status) */
    committed(game, participantId) {
      return game.responses?.[participantId] !== undefined;
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
      delete game.responses[targetId];
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
