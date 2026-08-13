import type { Participant, Snapshot } from '@/lib/types';

let seq = 0;

/** Build a participant with stable, overridable fields. */
export function makeParticipant(over: Partial<Participant> = {}): Participant {
  seq += 1;
  return {
    id: `p${seq}`,
    name: `Player ${seq}`,
    role: 'voter',
    status: 'connected',
    hasVoted: false,
    joinedAt: seq * 1000,
    hue: seq * 37,
    ...over,
  };
}

/**
 * Build a full privacy-aware snapshot. The defaults describe a fresh waiting
 * room; pass `over` to model voting / ended / revealed rooms.
 */
export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    code: 'ABCDE',
    roundId: 1,
    hostId: 'p1',
    teamName: '',
    roomTitle: '',
    createdAt: 0,
    settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' },
    locked: false,
    participants: [],
    status: 'waiting',
    votedIds: [],
    everyoneHasVoted: false,
    votes: {},
    stats: null,
    story: null,
    timer: null,
    ...over,
  };
}
