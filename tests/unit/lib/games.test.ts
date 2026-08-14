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

  it('ships every game live — no coming-soon placeholders remain', () => {
    for (const g of GAMES) {
      expect(g.status, g.id).toBe('live');
    }
    expect(LIVE_GAMES).toHaveLength(110);
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

  it('marks the flagship games live, pointing at the real implementations', () => {
    const poker = getGame('planning-poker')!;
    expect(poker.status).toBe('live');
    expect(poker.route).toBe('/create');
    const mlt = getGame('most-likely-to')!;
    expect(mlt.status).toBe('live');
    expect(mlt.route).toBe('/games/most-likely-to');
    const wyr = getGame('would-you-rather')!;
    expect(wyr.status).toBe('live');
    expect(wyr.route).toBe('/games/would-you-rather');
    const tot = getGame('this-or-that')!;
    expect(tot.status).toBe('live');
    expect(tot.route).toBe('/games/this-or-that');
    const quiz = getGame('team-trivia')!;
    expect(quiz.status).toBe('live');
    expect(quiz.route).toBe('/games/team-trivia');
    const caption = getGame('caption-this')!;
    expect(caption.status).toBe('live');
    expect(caption.route).toBe('/games/caption-this');
  });

  it('routes every game to its page', () => {
    for (const g of GAMES) {
      expect(g.route, g.id).toBe(g.id === 'planning-poker' ? '/create' : `/games/${g.id}`);
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
