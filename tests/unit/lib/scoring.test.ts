import { describe, expect, it } from 'vitest';
import {
  RANKING_POINTS,
  applyRound,
  awardRankingPoints,
  buildLeaderboard,
  calculateRanks,
  mergeLeaderboards,
  pointsForRank,
} from '@/lib/scoring';
import { makeGamePlayer } from '@/lib/gameTypes';

describe('calculateRanks', () => {
  it('sorts descending and assigns 1-based ranks with no ties', () => {
    expect(
      calculateRanks([
        { playerId: 'a', score: 5 },
        { playerId: 'b', score: 100 },
        { playerId: 'c', score: 20 },
      ]),
    ).toEqual([
      { playerId: 'b', score: 100, rank: 1 },
      { playerId: 'c', score: 20, rank: 2 },
      { playerId: 'a', score: 5, rank: 3 },
    ]);
  });

  it('ties share a rank and the next rank is skipped (standard competition)', () => {
    // 100, 80, 80, 60 → 1, 2, 2, 4
    expect(
      calculateRanks([
        { playerId: 'a', score: 80 },
        { playerId: 'b', score: 60 },
        { playerId: 'c', score: 100 },
        { playerId: 'd', score: 80 },
      ]),
    ).toEqual([
      { playerId: 'c', score: 100, rank: 1 },
      { playerId: 'a', score: 80, rank: 2 },
      { playerId: 'd', score: 80, rank: 2 },
      { playerId: 'b', score: 60, rank: 4 },
    ]);
  });

  it('three-way tie at the top skips to rank 4', () => {
    const ranks = calculateRanks([
      { playerId: 'a', score: 50 },
      { playerId: 'b', score: 50 },
      { playerId: 'c', score: 50 },
      { playerId: 'd', score: 10 },
    ]);
    expect(ranks.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it('handles empty input and a single player', () => {
    expect(calculateRanks([])).toEqual([]);
    expect(calculateRanks([{ playerId: 'a', score: 0 }])).toEqual([{ playerId: 'a', score: 0, rank: 1 }]);
  });

  it('is deterministic for equal scores (secondary sort by playerId)', () => {
    const ranks = calculateRanks([
      { playerId: 'b', score: 10 },
      { playerId: 'a', score: 10 },
    ]);
    expect(ranks[0].playerId).toBe('a');
    expect(ranks[1].playerId).toBe('b');
  });
});

describe('pointsForRank', () => {
  it('uses the default 100/80/60/40/20/10 table', () => {
    expect(RANKING_POINTS).toEqual([100, 80, 60, 40, 20, 10]);
    expect(pointsForRank(1)).toBe(100);
    expect(pointsForRank(2)).toBe(80);
    expect(pointsForRank(3)).toBe(60);
    expect(pointsForRank(4)).toBe(40);
    expect(pointsForRank(5)).toBe(20);
  });

  it('floors at 10 points for 6th place and beyond', () => {
    expect(pointsForRank(6)).toBe(10);
    expect(pointsForRank(7)).toBe(10);
    expect(pointsForRank(42)).toBe(10);
  });

  it('respects a custom points table and floors at its last value', () => {
    const fastest = [100, 80, 60];
    expect(pointsForRank(1, fastest)).toBe(100);
    expect(pointsForRank(2, fastest)).toBe(80);
    expect(pointsForRank(4, fastest)).toBe(60); // floor = last value
  });

  it('floors invalid ranks', () => {
    expect(pointsForRank(0)).toBe(10);
    expect(pointsForRank(-3)).toBe(10);
  });
});

describe('awardRankingPoints', () => {
  it('awards points by rank', () => {
    expect(
      awardRankingPoints([
        { playerId: 'a', score: 9 },
        { playerId: 'b', score: 3 },
        { playerId: 'c', score: 5 },
      ]),
    ).toEqual({ a: 100, c: 80, b: 60 });
  });

  it('gives tied players identical points', () => {
    // 100, 80, 80, 60 → a:100, b:80, c:80, d:40
    expect(
      awardRankingPoints([
        { playerId: 'a', score: 100 },
        { playerId: 'b', score: 80 },
        { playerId: 'c', score: 80 },
        { playerId: 'd', score: 60 },
      ]),
    ).toEqual({ a: 100, b: 80, c: 80, d: 40 });
  });

  it('returns an empty record for no players', () => {
    expect(awardRankingPoints([])).toEqual({});
  });

  it('supports a custom table (e.g. fastest-answer scoring)', () => {
    const table = [100, 80, 60];
    expect(
      awardRankingPoints(
        [
          { playerId: 'a', score: 1 },
          { playerId: 'b', score: 2 },
          { playerId: 'c', score: 3 },
          { playerId: 'd', score: 4 },
        ],
        table,
      ),
    ).toEqual({ d: 100, c: 80, b: 60, a: 60 });
  });
});

describe('buildLeaderboard', () => {
  it('sorts by total score, ranks, and carries round delta', () => {
    const players = [
      makeGamePlayer('p1', 'Amit', { totalScore: 40, roundScore: 40 }),
      makeGamePlayer('p2', 'Vishal', { totalScore: 100, roundScore: 40 }),
      makeGamePlayer('p3', 'Rahul', { totalScore: 80, roundScore: 20 }),
    ];
    const board = buildLeaderboard(players, 'p2');
    expect(board.map((e) => e.name)).toEqual(['Vishal', 'Rahul', 'Amit']);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board.map((e) => e.delta)).toEqual([40, 20, 40]);
    expect(board.find((e) => e.playerId === 'p2')?.isMe).toBe(true);
  });

  it('handles ties on the leaderboard', () => {
    const players = [
      makeGamePlayer('p1', 'A', { totalScore: 100 }),
      makeGamePlayer('p2', 'B', { totalScore: 80 }),
      makeGamePlayer('p3', 'C', { totalScore: 80 }),
    ];
    expect(buildLeaderboard(players).map((e) => e.rank)).toEqual([1, 2, 2]);
  });

  it('returns an empty board for no players', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });
});

describe('applyRound', () => {
  it('replaces roundScore, accumulates totalScore and returns a new board', () => {
    const players = [
      makeGamePlayer('p1', 'A', { totalScore: 100, roundScore: 100 }),
      makeGamePlayer('p2', 'B', { totalScore: 80, roundScore: 0 }),
    ];
    const { players: next, leaderboard } = applyRound(players, { p1: 80, p2: 100 });

    expect(next.find((p) => p.playerId === 'p1')).toMatchObject({ roundScore: 80, totalScore: 180 });
    expect(next.find((p) => p.playerId === 'p2')).toMatchObject({ roundScore: 100, totalScore: 180 });
    expect(leaderboard.map((e) => e.name)).toEqual(['A', 'B']); // tied at 180 → name order
    expect(leaderboard.map((e) => e.rank)).toEqual([1, 1]);
    expect(leaderboard.map((e) => e.delta)).toEqual([80, 100]);
  });

  it('players missing from roundPoints earn 0 and keep their total', () => {
    const players = [makeGamePlayer('p1', 'A', { totalScore: 50 }), makeGamePlayer('p2', 'B', { totalScore: 10 })];
    const { players: next } = applyRound(players, { p1: 20 });
    expect(next.find((p) => p.playerId === 'p2')).toMatchObject({ roundScore: 0, totalScore: 10 });
  });

  it('does not mutate the input players', () => {
    const players = [makeGamePlayer('p1', 'A', { totalScore: 50 })];
    const before = JSON.stringify(players);
    applyRound(players, { p1: 30 });
    expect(JSON.stringify(players)).toBe(before);
  });
});

describe('mergeLeaderboards (Game Night sessions)', () => {
  it('sums scores across games and re-ranks', () => {
    const poker = buildLeaderboard([
      makeGamePlayer('p1', 'Vishal', { totalScore: 100 }),
      makeGamePlayer('p2', 'Rahul', { totalScore: 80 }),
    ]);
    const trivia = buildLeaderboard([
      makeGamePlayer('p2', 'Rahul', { totalScore: 60 }),
      makeGamePlayer('p1', 'Vishal', { totalScore: 20 }),
    ]);
    const merged = mergeLeaderboards([poker, trivia]);

    // Totals: Vishal = 100 + 20 = 120, Rahul = 80 + 60 = 140 → Rahul leads.
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.playerId === 'p1')).toMatchObject({ name: 'Vishal', score: 120, rank: 2 });
    expect(merged.find((e) => e.playerId === 'p2')).toMatchObject({ name: 'Rahul', score: 140, rank: 1 });
  });

  it('handles empty boards', () => {
    expect(mergeLeaderboards([])).toEqual([]);
    expect(mergeLeaderboards([[], []])).toEqual([]);
  });
});
