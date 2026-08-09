import type { DeckId, Settings } from './types';

export interface Deck {
  id: DeckId;
  name: string;
  short: string;
  /** The exact card values in play order. */
  values: string[];
  /** Whether average/median/range make sense for this deck. */
  numeric: boolean;
}

/**
 * Central deck configuration — the voting UI only ever sees `deckValues(...)`,
 * never deck internals, so adding a custom deck later is a one-line change.
 */
export const DECKS: Deck[] = [
  {
    id: 'fibonacci',
    name: 'Fibonacci',
    short: '1,2,3,5…',
    values: ['1', '2', '3', '5', '8', '13', '21'],
    numeric: true,
  },
  {
    id: 'modifiedFibonacci',
    name: 'Modified Fibonacci',
    short: '0,½,1,2,3…',
    values: ['0', '½', '1', '2', '3', '5', '8', '13', '21'],
    numeric: true,
  },
  {
    id: 'sequential',
    name: 'Sequential',
    short: '1–8',
    values: ['1', '2', '3', '4', '5', '6', '7', '8'],
    numeric: true,
  },
  {
    id: 'tshirt',
    name: 'T-Shirt',
    short: 'XS–XL',
    values: ['XS', 'S', 'M', 'L', 'XL'],
    numeric: false,
  },
  {
    id: 'powersOfTwo',
    name: 'Powers of 2',
    short: '1,2,4,8…',
    values: ['1', '2', '4', '8', '16', '32'],
    numeric: true,
  },
];

export const DEFAULT_DECK_ID: DeckId = 'fibonacci';

export function getDeckById(id: string): Deck {
  return DECKS.find((d) => d.id === id) ?? DECKS[0];
}

/** Resolve the concrete values a room is playing with. */
export function deckValues(settings: Settings): string[] {
  return getDeckById(settings.deckId).values;
}

/** True for decks whose values are all numeric (avg/median/range apply). */
export function isNumericDeck(id: string): boolean {
  return getDeckById(id).numeric;
}

/**
 * Map a card value to its numeric weight for statistics / extreme highlights.
 * Mirrors the server's `toNum` in `server/room.mjs` — '½' (modified
 * Fibonacci) is 0.5; every other card parses via Number(). Keep the two in
 * sync: change the mapping here and in server/room.mjs together.
 */
export function cardToNumber(value: string): number {
  return value === '½' ? 0.5 : Number(value);
}
