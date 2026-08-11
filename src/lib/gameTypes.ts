// ---------------------------------------------------------------------------
// Shared game engine types — the vocabulary every future multiplayer game
// builds on. Planning Poker and Would You Rather predate this and keep their
// own specialized types; new games (Most Likely To, trivia, quizzes, …) use
// these so the Leaderboard / WinnerModal / scoring utilities all plug in
// without per-game glue.
//
// The server stays authoritative — these types describe *derived* client
// state (leaderboards, round results) plus small client-side helpers.
// ---------------------------------------------------------------------------

/** High-level lifecycle of a competitive game session. */
export type GamePhase = 'lobby' | 'playing' | 'roundEnd' | 'gameEnd';

/** Presence / activity states a player can be in during a game. */
export type PlayerGameStatus =
  | 'joined'
  | 'ready'
  | 'playing'
  | 'answered'
  | 'waiting'
  | 'disconnected'
  | 'reconnected'
  | 'eliminated'
  | 'winner';

/** A player inside a competitive game room. */
export interface GamePlayer {
  playerId: string;
  name: string;
  /** Avatar hue — matches the existing Avatar component's `hue` prop. */
  hue: number;
  isHost: boolean;
  isConnected: boolean;
  status: PlayerGameStatus;
  /** Points earned this round (reset each round). */
  roundScore: number;
  /** Cumulative points across the whole session (survives Play Again). */
  totalScore: number;
}

/** A single ranked row on a leaderboard. */
export interface LeaderboardEntry {
  playerId: string;
  name: string;
  hue: number;
  /** 1-based rank with standard-competition tie handling (1, 2, 2, 4). */
  rank: number;
  /** Total score used for ranking. */
  score: number;
  /** Optional points gained this round — shown as a floating "+N" chip. */
  delta?: number;
  isMe?: boolean;
}

/** Result of one finished round: per-player points + the updated board. */
export interface RoundResult {
  round: number;
  /** playerId → points awarded this round. */
  roundPoints: Record<string, number>;
  /** Updated, sorted leaderboard after applying the round. */
  leaderboard: LeaderboardEntry[];
}

/** Build a fresh GamePlayer with stable, overridable defaults. */
export function makeGamePlayer(playerId: string, name: string, over: Partial<GamePlayer> = {}): GamePlayer {
  return {
    playerId,
    name,
    hue: 0,
    isHost: false,
    isConnected: true,
    status: 'joined',
    roundScore: 0,
    totalScore: 0,
    ...over,
  };
}
