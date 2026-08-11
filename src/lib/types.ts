export type Role = 'facilitator' | 'voter';
export type ParticipantStatus = 'connected' | 'voted' | 'disconnected';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** The five decks the server accepts. */
export type DeckId = 'fibonacci' | 'modifiedFibonacci' | 'sequential' | 'tshirt' | 'powersOfTwo';

/** Room accent presets (applied as CSS custom properties on the room root). */
export type Accent = 'gold' | 'purple' | 'blue' | 'green';

/** How the reveal card-flip wave plays out. */
export type RevealMode = 'normal' | 'staggered' | 'dramatic';

/** One round per room. */
export type RoomPhase = 'waiting' | 'voting' | 'ended' | 'revealed';

/** Server-computed consensus verdict for a round's submitted votes. */
export type ConsensusLevel = 'full' | 'strong' | 'moderate' | 'large';

export interface Participant {
  id: string;
  name: string;
  role: Role;
  status: ParticipantStatus;
  /** Server-enforced: once true, this participant can never vote again. */
  hasVoted: boolean;
  joinedAt: number;
  hue: number;
}

export interface VoteCount {
  value: string;
  count: number;
}

export interface Stats {
  count: number;
  mode: string;
  modeShare: number;
  unique: number;
  /** Whether the deck's values are numeric (average/median/range apply). */
  numeric: boolean;
  avg: number | null;
  median: number | null;
  spread: number | null;
  highest: number | null;
  lowest: number | null;
  range: number | null;
  level: ConsensusLevel;
  counts: VoteCount[];
}

export interface Settings {
  deckId: DeckId;
  /** Voting timer in seconds — null means the timer is OFF. Only 10/15/30 allowed. */
  timerSec: number | null;
  /** Room accent preset — applied to the room root as CSS variables. */
  accent: Accent;
  /** Reveal animation mode — how the card flip wave plays. */
  revealMode: RevealMode;
}

export interface TimerInfo {
  durationSec: number;
  endsAt: number;
}

/** Full privacy-aware room state broadcast to clients after every mutation. */
export interface Snapshot {
  code: string;
  /** Increments on every startVoting — a stable per-round identity for result modals. */
  roundId: number;
  hostId: string | null;
  teamName: string;
  /** Optional room title set by the host at creation. */
  roomTitle: string;
  createdAt: number;
  settings: Settings;
  /** Host-only: while locked, brand-new participants cannot join. */
  locked: boolean;
  participants: Participant[];
  status: RoomPhase;
  votedIds: string[];
  /** True when every participant has cast a vote this round. */
  everyoneHasVoted: boolean;
  /** Vote values — only populated once the round is revealed. */
  votes: Record<string, string>;
  stats: Stats | null;
  timer: TimerInfo | null;
}

export interface Identity {
  participantId: string;
  name: string;
  role: Role;
}
