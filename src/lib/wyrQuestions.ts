import type { WyrQuestion } from './types';

// ---------------------------------------------------------------------------
// Would You Rather question bank — the host curates from here (and can add
// their own) when creating a room at /games/would-you-rather. The selected
// questions are sent to the server at creation and stored in the room; this
// library is only the picker's menu, not the source of truth at play time.
// ---------------------------------------------------------------------------

export const MAX_WYR_QUESTIONS = 20;

export const WYR_QUESTIONS: WyrQuestion[] = [
  { a: 'Have the ability to fly', b: 'Have the ability to be invisible' },
  { a: 'Always be 10 minutes early', b: 'Always be 10 minutes late' },
  { a: 'Know every language fluently', b: 'Be able to play every instrument' },
  { a: 'Work from home forever', b: 'Work in the office forever' },
  { a: 'Only send emails, never attend meetings', b: 'Only attend meetings, never send emails' },
  { a: 'Have a photographic memory', b: 'Forget everything every 24 hours' },
  { a: 'Be the funniest person in the room', b: 'Be the smartest person in the room' },
  { a: 'Never wait in line again', b: 'Always get the best parking spot' },
  { a: 'Talk to animals', b: 'Speak every human language' },
  { a: 'Live without the internet for a year', b: 'Live without coffee for a year' },
  { a: 'Only eat breakfast foods forever', b: 'Only eat dinner foods forever' },
  { a: 'Be able to rewind time', b: 'Be able to pause time' },
  { a: 'Have your meetings on mute', b: 'Have your camera always on' },
  { a: 'Get one extra hour of sleep every day', b: 'Get one extra hour of free time every day' },
  { a: 'Be a morning person', b: 'Be a night owl' },
  { a: 'Never have to write a status update again', b: 'Never have to read a status update again' },
  { a: 'Always know exactly what to say', b: 'Always know exactly what to wear' },
  { a: 'Have a personal assistant', b: 'Have a personal chef' },
  { a: 'Be great at estimating time', b: 'Be great at estimating people' },
  { a: 'Spend a day with your past self', b: 'Spend a day with your future self' },
  { a: 'Only work on new projects', b: 'Only work on legacy code' },
  { a: 'Be immune to bugs', b: 'Be immune to meetings' },
  { a: 'Have every shortcut key memorized', b: 'Have every emoji meaning memorized' },
  { a: 'Never touch a keyboard again', b: 'Never touch a mouse again' },
];

/** A curated starting selection (first half of the bank) the host can adjust. */
export const DEFAULT_WYR_SELECTION: WyrQuestion[] = WYR_QUESTIONS.slice(0, 12);
