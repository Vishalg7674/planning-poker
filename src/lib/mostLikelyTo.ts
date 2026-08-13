/**
 * Client-side contract for the "Most Likely To" game.
 *
 * The game shares the realtime transport (room codes, participants, snapshots)
 * with planning poker but keeps its own state shape and its own identity key —
 * a player never cross-contaminates their poker session with their game
 * session, even in the same browser tab.
 */

export type MltStatus = 'waiting' | 'playing' | 'revealed';
export type MltParticipantStatus = 'connected' | 'voted' | 'disconnected';

export interface MltParticipant {
  id: string;
  name: string;
  role: 'facilitator' | 'voter';
  status: MltParticipantStatus;
  hasVoted: boolean;
  skipped: boolean;
  joinedAt: number;
  hue: number;
}

export interface MltStatCount {
  participantId: string;
  count: number;
}

export interface MltStats {
  roundId: number;
  prompt: string;
  counts: MltStatCount[];
  /** Everyone tied at the top is crowned. */
  winners: string[];
  topCount: number;
  totalPicks: number;
}

/** Privacy-aware game state broadcast to clients after every mutation. */
export interface MltSnapshot {
  game: 'most-likely-to';
  code: string;
  roundId: number;
  hostId: string | null;
  teamName: string;
  roomTitle: string;
  createdAt: number;
  locked: boolean;
  participants: MltParticipant[];
  status: MltStatus;
  /** The current prompt, e.g. "…show up 5 minutes early to a meeting?" */
  prompt: string | null;
  /** Who has picked this round — the target stays private until reveal. */
  pickedIds: string[];
  everyonePicked: boolean;
  /** voterId → targetId — only populated once the round is revealed. */
  picks: Record<string, string>;
  stats: MltStats | null;
}

export interface MltIdentity {
  participantId: string;
  name: string;
  role: 'facilitator' | 'voter';
}

const IDENTITY_KEY = 'reveal:identity:most-likely-to';

/** Distinct from the planning-poker identity so the two rooms never collide. */
export function loadMltIdentity(): MltIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MltIdentity;
    if (!parsed.participantId || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMltIdentity(identity: MltIdentity) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export function clearMltIdentity() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(IDENTITY_KEY);
}
