import { describe, expect, it } from 'vitest';
import { DECKS, DEFAULT_DECK_ID, cardToNumber, deckValues, getDeckById, isNumericDeck } from '@/lib/decks';
import { makeSnapshot } from '../../helpers/fixtures';

describe('deck catalog', () => {
  it('exposes the five built-in decks', () => {
    expect(DECKS.map((d) => d.id)).toEqual(['fibonacci', 'modifiedFibonacci', 'sequential', 'tshirt', 'powersOfTwo']);
  });

  it('defaults to fibonacci', () => {
    expect(DEFAULT_DECK_ID).toBe('fibonacci');
  });

  it('matches the documented card values', () => {
    expect(getDeckById('fibonacci').values).toEqual(['1', '2', '3', '5', '8', '13', '21']);
    expect(getDeckById('modifiedFibonacci').values).toEqual(['0', '½', '1', '2', '3', '5', '8', '13', '21']);
    expect(getDeckById('sequential').values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(getDeckById('tshirt').values).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(getDeckById('powersOfTwo').values).toEqual(['1', '2', '4', '8', '16', '32']);
  });

  it('every deck has values and a name', () => {
    for (const deck of DECKS) {
      expect(deck.values.length).toBeGreaterThan(0);
      expect(deck.name).toBeTruthy();
    }
  });

  it('flags T-Shirt as non-numeric and the rest as numeric', () => {
    expect(isNumericDeck('fibonacci')).toBe(true);
    expect(isNumericDeck('modifiedFibonacci')).toBe(true);
    expect(isNumericDeck('sequential')).toBe(true);
    expect(isNumericDeck('powersOfTwo')).toBe(true);
    expect(isNumericDeck('tshirt')).toBe(false);
  });
});

describe('getDeckById', () => {
  it('returns the matching deck', () => {
    expect(getDeckById('tshirt').values).toContain('XS');
    expect(getDeckById('powersOfTwo').values).toContain('16');
  });

  it('falls back to fibonacci for unknown ids', () => {
    expect(getDeckById('nope').id).toBe('fibonacci');
  });
});

describe('deckValues', () => {
  it('resolves values from a room snapshot settings', () => {
    const snapshot = makeSnapshot({ settings: { deckId: 'tshirt', timerSec: null, accent: 'gold', revealMode: 'staggered' } });
    expect(deckValues(snapshot.settings)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });
});

describe('cardToNumber', () => {
  it('maps the ½ card (modified Fibonacci) to 0.5 like the server', () => {
    expect(cardToNumber('½')).toBe(0.5);
  });

  it('parses plain numeric cards with Number', () => {
    expect(cardToNumber('8')).toBe(8);
    expect(cardToNumber('0')).toBe(0);
    expect(cardToNumber('21')).toBe(21);
  });

  it('returns NaN for non-numeric values (guarded by stats.numeric upstream)', () => {
    expect(Number.isNaN(cardToNumber('M'))).toBe(true);
  });
});
