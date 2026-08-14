/**
 * Client-side contract for the engine-backed games (server/games/engine.mjs).
 *
 * Every shipped game shares one snapshot shape — `game`/`kind` tell the shared
 * GameRoom which panel to render, and `prompt`/`votes`/`stats` carry the
 * kind-specific payload. Identities are per-game so sessions never collide,
 * even in the same browser tab.
 */

import type { GameKind } from './gameConfig';

export type GameStatus = 'waiting' | 'playing' | 'revealed';

export interface GameParticipant {
  id: string;
  name: string;
  role: 'facilitator' | 'voter';
  status: 'connected' | 'voted' | 'disconnected';
  hasVoted: boolean;
  skipped: boolean;
  joinedAt: number;
  hue: number;
}

/** Kind-specific prompt shapes. Quiz/estimate answers only appear at reveal. */
export type GamePrompt =
  | string // teammate: "…show up early to a meeting?"
  | { text: string; options: string[] } // options / quiz (options visible)
  | { text: string; options?: string[]; answer?: number } // quiz full shape
  | { text: string; unit?: string; answer?: number } // estimate full shape
  | { text: string; answer?: string; answerText?: string }; // free full shape

export interface GameStatCount {
  option: number;
  count: number;
}

export interface TeammateStats {
  roundId: number;
  counts: { participantId: string; count: number }[];
  winners: string[];
  topCount: number;
  totalVotes: number;
}

export interface OptionsStats {
  roundId: number;
  counts: GameStatCount[];
  totalVotes: number;
  winner: number | 'tie';
  topCount: number;
}

export interface QuizStats {
  roundId: number;
  correctIndex: number;
  correctText: string;
  counts: GameStatCount[];
  correctIds: string[];
  wrongIds: string[];
  totalVotes: number;
}

export interface GuessEntry {
  participantId: string;
  value: string;
  distance: number;
}

export interface EstimateStats {
  roundId: number;
  answer: number;
  unit: string;
  guesses: GuessEntry[];
  winnerIds: string[];
  closest: number | null;
  totalVotes: number;
}

export interface FreeSubmissionEntry {
  participantId: string;
  text: string;
  correct?: boolean;
  answer?: string;
}

/** Reveal stats after the free-text submit phase. */
export interface FreeSubmitStats {
  roundId: number;
  phase: 'submit';
  submissions: FreeSubmissionEntry[];
  correctIds: string[];
  wrongIds: string[];
  totalSubmissions: number;
}

/** Reveal stats after the free-text vote phase. */
export interface FreeVoteStats {
  roundId: number;
  phase: 'vote';
  submissions: Record<string, string>;
  counts: { participantId: string; count: number }[];
  winners: string[];
  topCount: number;
  totalVotes: number;
}

export type FreeStats = FreeSubmitStats | FreeVoteStats;

export type GameStats = TeammateStats | OptionsStats | QuizStats | EstimateStats | FreeStats;

/** Privacy-aware game state broadcast to clients after every mutation. */
export interface GameSnapshot {
  game: string;
  kind: GameKind;
  code: string;
  roundId: number;
  hostId: string | null;
  teamName: string;
  roomTitle: string;
  createdAt: number;
  locked: boolean;
  participants: GameParticipant[];
  status: GameStatus;
  prompt: GamePrompt | null;
  /** Who has voted this round — the value stays private until reveal. */
  votedIds: string[];
  everyoneVoted: boolean;
  /** voterId → value — only populated once the round is revealed. */
  votes: Record<string, string>;
  stats: GameStats | null;
  /** `free` games only: 'submit' (everyone answers) or 'vote' (pick the best). */
  phase?: 'submit' | 'vote';
  /** `free` games only: participantId → text — public once revealed. */
  submissions?: Record<string, string>;
}

export interface GameIdentity {
  participantId: string;
  name: string;
  role: 'facilitator' | 'voter';
}

const keyFor = (gameId: string) => `reveal:identity:${gameId}`;

/** Per-game session identity — each game has its own storage key. */
export function loadGameIdentity(gameId: string): GameIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(keyFor(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameIdentity;
    if (!parsed.participantId || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGameIdentity(gameId: string, identity: GameIdentity) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(keyFor(gameId), JSON.stringify(identity));
}

export function clearGameIdentity(gameId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(keyFor(gameId));
}
