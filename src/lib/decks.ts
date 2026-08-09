import type { DeckId, Settings } from './types';

export interface Deck {
  id: DeckId;
  name: string;
  short: string;
  values: string[];
}

export const DECKS: Deck[] = [
  { id: 'standard', name: 'Standard', short: '0–89', values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'] },
  { id: 'fibonacci', name: 'Fibonacci', short: '1,2,3,5…', values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'] },
  { id: 'tshirt', name: 'T-Shirt', short: 'XS–XXL', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?'] },
  { id: 'powers2', name: 'Powers of 2', short: '1,2,4,8…', values: ['1', '2', '4', '8', '16', '32', '64', '?'] },
];

export const DEFAULT_DECK_ID: DeckId = 'fibonacci';

export function getDeckById(id: string): Deck {
  return DECKS.find((d) => d.id === id) ?? DECKS[1];
}

/** Resolve the concrete values a room is playing with. */
export function deckValues(settings: Settings): string[] {
  return getDeckById(settings.deckId).values;
}
