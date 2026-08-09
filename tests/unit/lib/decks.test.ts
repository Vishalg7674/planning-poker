import { describe, expect, it } from 'vitest';
import { DECKS, DEFAULT_DECK_ID, deckValues, getDeckById } from '@/lib/decks';
import { makeSnapshot } from '../../helpers/fixtures';

describe('deck catalog', () => {
  it('exposes the four built-in decks', () => {
    expect(DECKS.map((d) => d.id)).toEqual(['standard', 'fibonacci', 'tshirt', 'powers2']);
  });

  it('defaults to fibonacci', () => {
    expect(DEFAULT_DECK_ID).toBe('fibonacci');
  });

  it('every deck has values', () => {
    for (const deck of DECKS) {
      expect(deck.values.length).toBeGreaterThan(0);
      expect(deck.name).toBeTruthy();
    }
  });
});

describe('getDeckById', () => {
  it('returns the matching deck', () => {
    expect(getDeckById('tshirt').values).toContain('XS');
    expect(getDeckById('powers2').values).toContain('16');
  });

  it('falls back to fibonacci for unknown ids', () => {
    expect(getDeckById('nope').id).toBe('fibonacci');
  });
});

describe('deckValues', () => {
  it('resolves values from a room snapshot settings', () => {
    const snapshot = makeSnapshot({ settings: { deckId: 'tshirt', timerSec: null } });
    expect(deckValues(snapshot.settings)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', '?']);
  });
});
