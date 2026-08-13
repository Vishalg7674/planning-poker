import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_IDS,
  GAME_COUNT,
  GAMES,
  LIVE_GAMES,
  gamesByCategory,
  getCategory,
  getGame,
} from '@/lib/games';

describe('game registry', () => {
  it('contains 110 games across 9 categories', () => {
    expect(CATEGORIES).toHaveLength(9);
    expect(GAME_COUNT).toBe(110);
    expect(GAMES).toHaveLength(110);
  });

  it('has the exact expected per-category distribution', () => {
    const counts: Record<string, number> = {
      icebreakers: 15,
      speed: 12,
      guessing: 12,
      estimation: 7,
      funny: 14,
      developer: 15,
      creative: 12,
      word: 13,
      competitive: 10,
    };
    for (const [id, expected] of Object.entries(counts)) {
      expect(gamesByCategory(id as (typeof CATEGORY_IDS)[number]), `${id} count`).toHaveLength(expected);
    }
    // Every game belongs to a known category.
    for (const g of GAMES) {
      expect(CATEGORY_IDS).toContain(g.category);
    }
  });

  it('has unique ids and unique names', () => {
    const ids = GAMES.map((g) => g.id);
    const names = GAMES.map((g) => g.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every game a complete, well-formed entry', () => {
    for (const g of GAMES) {
      expect(g.icon, g.id).toBeTruthy();
      expect(g.description, g.id).toBeTruthy();
      expect(g.players, g.id).toMatch(/\d/);
      expect(g.duration, g.id).toMatch(/\d/);
      expect(g.category, g.id).toBeTruthy();
      expect(['live', 'coming-soon']).toContain(g.status);
      expect(g.route, g.id).toMatch(/^\//);
    }
  });

  it('marks the shipped games as live, pointing at the real implementations', () => {
    expect(LIVE_GAMES).toHaveLength(2);
    const ids = LIVE_GAMES.map((g) => g.id);
    expect(ids).toContain('planning-poker');
    expect(ids).toContain('most-likely-to');
    const poker = getGame('planning-poker')!;
    expect(poker.status).toBe('live');
    expect(poker.route).toBe('/create');
    const mlt = getGame('most-likely-to')!;
    expect(mlt.status).toBe('live');
    expect(mlt.route).toBe('/games/most-likely-to');
  });

  it('routes every coming-soon game to its placeholder page', () => {
    for (const g of GAMES.filter((x) => x.status === 'coming-soon')) {
      expect(g.route).toBe(`/games/${g.id}`);
    }
  });

  it('looks games and categories up by id', () => {
    expect(getGame('most-likely-to')?.name).toBe('Most Likely To');
    expect(getGame('nope')).toBeUndefined();
    expect(getCategory('word')?.name).toContain('Word');
    expect(getCategory('nope')).toBeUndefined();
  });

  it('keeps the two higher/lower games distinct across categories', () => {
    const guessing = getGame('higher-or-lower');
    const estimation = getGame('higher-lower');
    expect(guessing?.category).toBe('guessing');
    expect(estimation?.category).toBe('estimation');
  });
});
