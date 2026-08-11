import { describe, expect, it } from 'vitest';
import { makeGamePlayer } from '@/lib/gameTypes';

describe('makeGamePlayer', () => {
  it('builds a player with sensible defaults', () => {
    const p = makeGamePlayer('p1', 'Vishal');
    expect(p).toEqual({
      playerId: 'p1',
      name: 'Vishal',
      hue: 0,
      isHost: false,
      isConnected: true,
      status: 'joined',
      roundScore: 0,
      totalScore: 0,
    });
  });

  it('applies overrides', () => {
    const p = makeGamePlayer('p1', 'Vishal', { isHost: true, hue: 137, status: 'playing', totalScore: 40 });
    expect(p.isHost).toBe(true);
    expect(p.hue).toBe(137);
    expect(p.status).toBe('playing');
    expect(p.totalScore).toBe(40);
  });
});
