import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameSession } from '@/lib/useGameSession';
import { makeGamePlayer } from '@/lib/gameTypes';

function makePlayers() {
  return [
    makeGamePlayer('p1', 'Vishal', { hue: 10, totalScore: 120, roundScore: 40 }),
    makeGamePlayer('p2', 'Rahul', { hue: 20, totalScore: 90, roundScore: 30 }),
    makeGamePlayer('p3', 'Priya', { hue: 30, totalScore: 60, roundScore: 0 }),
  ];
}

interface SetupProps {
  ended: boolean;
  players: ReturnType<typeof makePlayers>;
}

function setup(over: Partial<SetupProps> = {}) {
  const onPlayAgain = vi.fn();
  const players = over.players ?? makePlayers();
  const initialProps: SetupProps = { ended: over.ended ?? false, players };
  const utils = renderHook(
    ({ ended, players }: SetupProps) =>
      useGameSession({ players, myId: 'p1', ended, onPlayAgain }),
    { initialProps },
  );
  return { ...utils, onPlayAgain, players };
}

describe('useGameSession', () => {
  it('derives a ranked leaderboard with round deltas and my-row highlight', () => {
    const { result } = setup();
    expect(result.current.leaderboard.map((e) => e.name)).toEqual(['Vishal', 'Rahul', 'Priya']);
    expect(result.current.leaderboard.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(result.current.leaderboard.map((e) => e.delta)).toEqual([40, 30, 0]);
    expect(result.current.leaderboard.find((e) => e.playerId === 'p1')?.isMe).toBe(true);
  });

  it('sorts ties by name, deterministically', () => {
    const players = [
      makeGamePlayer('p1', 'Rahul', { totalScore: 80 }),
      makeGamePlayer('p2', 'Priya', { totalScore: 80 }),
      makeGamePlayer('p3', 'Amit', { totalScore: 100 }),
    ];
    const { result } = setup({ players });
    expect(result.current.leaderboard.map((e) => e.name)).toEqual(['Amit', 'Priya', 'Rahul']);
    expect(result.current.leaderboard.map((e) => e.rank)).toEqual([1, 2, 2]);
  });

  it('exposes the current leader as the winner', () => {
    const { result } = setup();
    expect(result.current.winner?.playerId).toBe('p1');
    expect(result.current.winner?.score).toBe(120);
  });

  it('stays closed while the session is playing', () => {
    const { result } = setup({ ended: false });
    expect(result.current.winnerOpen).toBe(false);
  });

  it('auto-opens the celebration the moment the session ends (transition)', () => {
    const { result, rerender, players } = setup(); // mounts ended: false
    expect(result.current.winnerOpen).toBe(false);
    rerender({ ended: true, players });
    expect(result.current.winnerOpen).toBe(true);
  });

  it('celebrates when mounted already-ended (e.g. a remount after Play Again)', () => {
    const { result } = setup({ ended: true });
    expect(result.current.winnerOpen).toBe(true);
  });

  it('closes via closeWinner without restarting', () => {
    const { result, onPlayAgain } = setup({ ended: true });
    act(() => result.current.closeWinner());
    expect(result.current.winnerOpen).toBe(false);
    expect(onPlayAgain).not.toHaveBeenCalled();
  });

  it('playAgain restarts and does not reopen while the server still reports ended', () => {
    const { result, rerender, onPlayAgain, players } = setup({ ended: true });
    expect(result.current.winnerOpen).toBe(true);

    act(() => result.current.playAgain());
    expect(result.current.winnerOpen).toBe(false);
    expect(onPlayAgain).toHaveBeenCalledTimes(1);

    // Server hasn't reset the snapshot yet — the modal must stay closed.
    rerender({ ended: true, players });
    expect(result.current.winnerOpen).toBe(false);
  });

  it('reopens the celebration when a *new* session ends', () => {
    const { result, rerender, onPlayAgain, players } = setup({ ended: true });
    act(() => result.current.playAgain());

    // New session: server resets to playing, then ends again later.
    rerender({ ended: false, players });
    expect(result.current.winnerOpen).toBe(false);
    rerender({ ended: true, players });
    expect(result.current.winnerOpen).toBe(true);
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('openWinner opens the celebration manually', () => {
    const { result } = setup({ ended: false });
    act(() => result.current.openWinner());
    expect(result.current.winnerOpen).toBe(true);
  });

  it('never auto-opens without scores, even when ended', () => {
    const { result } = setup({ ended: true, players: [] });
    expect(result.current.winner).toBeNull();
    expect(result.current.winnerOpen).toBe(false);
    expect(result.current.leaderboard).toEqual([]);
  });
});
