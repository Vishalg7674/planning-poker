export type Role = 'facilitator' | 'voter';
export type ParticipantStatus = 'connected' | 'voted' | 'disconnected';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Which game a room is playing — the server routes rules per game. */
export type GameId = 'planning-poker' | 'would-you-rather' | 'most-likely-to';

/** A single Would You Rather prompt: pick side A or side B. */
export interface WyrQuestion {
  a: string;
  b: string;
}

/**
 * Server-computed Most Likely To round result (revealed only).
 * `points` maps playerId → points earned this round (crown + prediction);
 * `counts` maps targetId → nominations received; `winners` are the crowned
 * player(s) (top vote count, ties included); `predictors` are the voters who
 * nominated a winner.
 */
export interface MltRoundResult {
  points: Record<string, number>;
  counts: Record<string, number>;
  winners: string[];
  predictors: string[];
}

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
  hostId: string | null;
  teamName: string;
  /** Optional room title set by the host at creation. */
  roomTitle: string;
  createdAt: number;
  game: GameId;
  /** The active WYR question — null while waiting, or for Planning Poker rooms. */
  question: WyrQuestion | null;
  /** 0-based index of the active question (WYR only). */
  questionIndex: number;
  /** Total questions in this WYR session. */
  questionCount: number;
  /** The active MLT prompt — null while waiting, or for non-MLT rooms. */
  prompt: string | null;
  /** 0-based index of the active MLT prompt. */
  promptIndex: number;
  /** Total prompts in this MLT session. */
  promptCount: number;
  /** MLT round result — null unless the round is revealed. */
  mltResult: MltRoundResult | null;
  /** MLT session totals (survive Play Again). */
  mltScores: Record<string, number>;
  /** True once the MLT host finished the final round — opens the WinnerModal. */
  sessionOver: boolean;
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
