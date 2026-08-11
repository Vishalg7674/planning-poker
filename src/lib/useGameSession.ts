'use client';

import { useCallback, useMemo, useState } from 'react';
import { buildLeaderboard } from './scoring';
import type { GamePlayer, LeaderboardEntry } from './gameTypes';

export interface UseGameSessionOptions {
  /** Players with round + total scores, straight from the server snapshot. */
  players: GamePlayer[];
  /** My participant id — highlights my row on the board. */
  myId?: string | null;
  /**
   * True once the server has declared the session over (e.g. the final round
   * was revealed). The server owns this condition — the hook just reacts.
   */
  ended: boolean;
  /**
   * Host action that resets round data and starts a fresh session. Per the
   * platform convention the *total session score is kept* (so a team can play
   * several games and crown an overall champion) — what exactly resets is the
   * server's decision; the hook only closes the celebration and lets the
   * server's next snapshot drive the UI back to the lobby.
   */
  onPlayAgain: () => void;
}

export interface GameSessionView {
  /** Sorted, ranked leaderboard derived from the players (see buildLeaderboard). */
  leaderboard: LeaderboardEntry[];
  /** The current leader — `null` until somebody has scored. */
  winner: LeaderboardEntry | null;
  /** Whether the end-of-game celebration modal is open. */
  winnerOpen: boolean;
  /** Open the celebration manually (e.g. a host \"End Game\" control). */
  openWinner: () => void;
  /** Dismiss the celebration without restarting. */
  closeWinner: () => void;
  /** Restart the game: closes the celebration and calls `onPlayAgain`. */
  playAgain: () => void;
}

/**
 * Standard end-of-game lifecycle for every competitive game on the platform.
 *
 * The server stays authoritative — it sends `players` (round + total scores)
 * and the `ended` flag; this hook only *derives* the display state:
 *
 *   1. ranks the players into a leaderboard (`buildLeaderboard`),
 *   2. opens the shared WinnerModal the moment the server marks the session
 *      `ended` (and somebody has scored),
 *   3. routes Play Again / dismissal.
 *
 * Games keep their own rules and server logic — this hook supplies only the
 * shared flow, so every game feels like the same platform.
 */
export function useGameSession({ players, myId = null, ended, onPlayAgain }: UseGameSessionOptions): GameSessionView {
  const leaderboard = useMemo(() => buildLeaderboard(players, myId), [players, myId]);
  const winner = leaderboard[0] ?? null;

  // A session that ends while still mounted (e.g. a remount after Play Again)
  // should celebrate too — seed the initial state, then auto-open on every
  // `ended` transition. This is React's documented "adjust state when a prop
  // changes" pattern: a guarded setState during render, which the react-hooks
  // lint rules accept (unlike setState-in-effect or ref writes during render).
  //
  // Invariant: a session only ends after rounds were played, and a room always
  // has participants — so `winner` is non-null whenever `ended` fires. The
  // `&& winner` guard just keeps an empty board from celebrating.
  const [winnerOpen, setWinnerOpen] = useState(ended && leaderboard.length > 0);
  const [prevEnded, setPrevEnded] = useState(ended);
  if (ended !== prevEnded) {
    setPrevEnded(ended);
    if (ended && winner) setWinnerOpen(true);
  }

  const openWinner = useCallback(() => setWinnerOpen(true), []);
  const closeWinner = useCallback(() => setWinnerOpen(false), []);

  const playAgain = useCallback(() => {
    // Do not touch `wasEnded` here: while the server resets the session it
    // may still report `ended` for a beat — the ref guard keeps the modal
    // closed until the snapshot flips back and a *new* session ends.
    setWinnerOpen(false);
    onPlayAgain();
  }, [onPlayAgain]);

  return { leaderboard, winner, winnerOpen, openWinner, closeWinner, playAgain };
}
