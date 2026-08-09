export type Role = 'facilitator' | 'voter';
export type ParticipantStatus = 'connected' | 'voted' | 'disconnected';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type DeckId = 'standard' | 'fibonacci' | 'tshirt' | 'powers2';

/** One round per room. */
export type RoomPhase = 'waiting' | 'voting' | 'ended' | 'revealed';

export type ConsensusLevel = 'full' | 'strong' | 'some' | 'large';

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
  avg: number | null;
  median: number | null;
  spread: number | null;
  level: ConsensusLevel;
  counts: VoteCount[];
}

export interface Settings {
  deckId: DeckId;
  /** Voting timer in seconds — null means the timer is OFF. Only 10/15/30 allowed. */
  timerSec: number | null;
}

export interface TimerInfo {
  durationSec: number;
  endsAt: number;
}

/** Full privacy-aware room state broadcast to clients after every mutation. */
export interface Snapshot {
  code: string;
  hostId: string | null;
  teamName: string;
  createdAt: number;
  settings: Settings;
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
