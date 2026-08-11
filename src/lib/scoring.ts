// ---------------------------------------------------------------------------
// Shared scoring engine — pure, deterministic, testable.
//
// Default ranking-based scoring:
//   1st → 100 · 2nd → 80 · 3rd → 60 · 4th → 40 · 5th → 20 · 6th+ → 10
//
// Tie handling is *standard competition ranking*: equal scores share the same
// rank and the next rank is skipped (e.g. scores 100, 80, 80, 60 → ranks
// 1, 2, 2, 4). Tied players receive identical points — never an arbitrary
// ranking.
//
// Games may override the points table per round (fastest-answer, survival,
// participation scoring, …) — the same rank/merge machinery still applies.
// ---------------------------------------------------------------------------

import type { GamePlayer, LeaderboardEntry } from './gameTypes';

/** A raw score keyed by player, before ranking. */
export interface ScoredPlayer {
  playerId: string;
  score: number;
}

/** A score after ranking. */
export interface RankedPlayer extends ScoredPlayer {
  /** 1-based rank with standard-competition ties (1, 2, 2, 4). */
  rank: number;
}

/** Default points by placement — index 0 = 1st place. */
export const RANKING_POINTS = [100, 80, 60, 40, 20, 10];

/** Stable secondary sort so equal-score rows render deterministically. */
function sortScored(a: ScoredPlayer, b: ScoredPlayer): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.playerId.localeCompare(b.playerId);
}

/**
 * Rank scores with standard-competition ties. The array is returned sorted
 * by score (descending). Equal scores share a rank; the next rank skips —
 * e.g. [100, 80, 80, 60] → ranks [1, 2, 2, 4].
 */
export function calculateRanks(scored: ScoredPlayer[]): RankedPlayer[] {
  const sorted = [...scored].sort(sortScored);
  let prevScore: number | null = null;
  let prevRank = 1;
  return sorted.map((entry, index) => {
    if (entry.score === prevScore) {
      return { ...entry, rank: prevRank };
    }
    // First of a new score group — its rank is its 1-based position, which
    // is what makes the skipped ranks work (2,2,4).
    prevScore = entry.score;
    prevRank = index + 1;
    return { ...entry, rank: prevRank };
  });
}

/**
 * Points awarded for a given 1-based rank using a points table. Ranks past
 * the end of the table floor at the table's last value (6th+ → 10 by default).
 */
export function pointsForRank(rank: number, table: number[] = RANKING_POINTS): number {
  const floor = table[table.length - 1] ?? 0;
  if (rank < 1) return floor;
  return table[rank - 1] ?? floor;
}

/**
 * Award ranking points for a round. `roundScores` maps player → round score;
 * the returned record maps playerId → points (ties get identical points).
 */
export function awardRankingPoints(roundScores: ScoredPlayer[], table: number[] = RANKING_POINTS): Record<string, number> {
  const ranked = calculateRanks(roundScores);
  const out: Record<string, number> = {};
  for (const entry of ranked) {
    out[entry.playerId] = pointsForRank(entry.rank, table);
  }
  return out;
}

/**
 * Build a sorted, ranked leaderboard from players' *total* scores. Secondary
 * sort is by name (stable + deterministic). `delta` carries the round score so
 * the UI can animate "+N" alongside the total.
 */
export function buildLeaderboard(players: GamePlayer[], myId: string | null | undefined = null): LeaderboardEntry[] {
  const ranked = calculateRanks(players.map((p) => ({ playerId: p.playerId, score: p.totalScore })));
  const byId = new Map(ranked.map((r) => [r.playerId, r]));
  return [...players]
    .sort((a, b) => {
      const ra = byId.get(a.playerId)!.rank;
      const rb = byId.get(b.playerId)!.rank;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    })
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      hue: p.hue,
      rank: byId.get(p.playerId)!.rank,
      score: p.totalScore,
      delta: p.roundScore,
      isMe: p.playerId === myId,
    }));
}

/**
 * Apply a round's points to a set of players: roundScore is replaced with the
 * newly awarded points, totalScore accumulates, and a fresh leaderboard is
 * returned. Players absent from `roundPoints` earn 0 (and keep their total).
 */
export function applyRound(
  players: GamePlayer[],
  roundPoints: Record<string, number>,
  myId: string | null | undefined = null,
): { players: GamePlayer[]; leaderboard: LeaderboardEntry[] } {
  const next = players.map((p) => {
    const gained = roundPoints[p.playerId] ?? 0;
    return { ...p, roundScore: gained, totalScore: p.totalScore + gained };
  });
  return { players: next, leaderboard: buildLeaderboard(next, myId) };
}

/**
 * Merge several leaderboards into one cumulative board — the building block
 * for a future "Game Night" multi-game session (Planning Poker → Most Likely
 * To → Trivia → …) with a single overall champion. Scores sum per player;
 * name/hue come from the first board containing the player.
 */
export function mergeLeaderboards(boards: LeaderboardEntry[][]): LeaderboardEntry[] {
  const totals = new Map<string, { name: string; hue: number; score: number }>();
  for (const board of boards) {
    for (const entry of board) {
      const prev = totals.get(entry.playerId);
      totals.set(entry.playerId, {
        name: entry.name,
        hue: entry.hue,
        score: (prev?.score ?? 0) + entry.score,
      });
    }
  }
  const ranked = calculateRanks(
    [...totals.entries()].map(([playerId, v]) => ({ playerId, score: v.score })),
  );
  return ranked.map((r) => ({
    playerId: r.playerId,
    name: totals.get(r.playerId)!.name,
    hue: totals.get(r.playerId)!.hue,
    rank: r.rank,
    score: r.score,
  }));
}
