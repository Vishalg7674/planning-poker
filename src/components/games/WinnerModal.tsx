'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import Celebration from '@/components/Celebration';
import Button from '@/components/Button';
import Avatar from '@/components/Avatar';
import Leaderboard from '@/components/games/Leaderboard';
import { useAnimatedNumber } from '@/lib/useAnimatedNumber';
import type { LeaderboardEntry } from '@/lib/gameTypes';
import styles from './WinnerModal.module.scss';

interface WinnerModalProps {
  open: boolean;
  /** e.g. "Most Likely To" — shown in the headline. */
  gameName: string;
  /** Sorted leaderboard — `entries[0]` is the winner. */
  entries: LeaderboardEntry[];
  totalRounds: number;
  onPlayAgain: () => void;
  onBackToGames: () => void;
  onClose: () => void;
}

/**
 * The end-of-game celebration, shared by every competitive game: confetti
 * burst over the modal, the 🥇 winner with an animated score, the full
 * medal-styled leaderboard, and Play Again / Back to Games actions.
 *
 * Confetti replays every time the modal opens (or reopens after Play Again).
 */
export default function WinnerModal({
  open,
  gameName,
  entries,
  totalRounds,
  onPlayAgain,
  onBackToGames,
  onClose,
}: WinnerModalProps) {
  const [tick, setTick] = useState(open ? 1 : 0);
  const [prevOpen, setPrevOpen] = useState(open);

  // Replay the confetti burst every time the modal (re)opens. This is React's
  // documented "adjust state when a prop changes" pattern — a guarded setState
  // during render instead of setState-in-effect (which react-hooks lint
  // rejects) or a ref write during render (also rejected).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTick((t) => t + 1);
  }

  const winner = entries[0];

  return (
    <Modal open={open} onClose={onClose} title="Game Complete!" size="lg">
      <Celebration tick={tick} />

      <div className={styles.body}>
        <p className={styles.eyebrow}>
          {gameName} · {totalRounds} {totalRounds === 1 ? 'round' : 'rounds'}
        </p>

        {winner && (
          <div className={styles.winner} role="status" aria-label={`Winner: ${winner.name} with ${winner.score} points`}>
            <span className={styles.winnerMedal} aria-hidden="true">
              🥇
            </span>
            <Avatar name={winner.name} hue={winner.hue} size="lg" />
            <h3 className={styles.winnerName}>{winner.name}</h3>
            <p className={styles.winnerScore}>
              <WinnerScore value={winner.score} /> pts
            </p>
          </div>
        )}

        {!winner && <p className={styles.noWinner}>No scores yet — play a round to crown a champion.</p>}

        <Leaderboard entries={entries} compact showDelta />
      </div>

      <footer className={styles.footer}>
        <Button variant="outline" onClick={onBackToGames}>
          ← Back to Games
        </Button>
        <Button variant="gold" onClick={onPlayAgain} autoFocus={entries.length > 0}>
          Play Again
        </Button>
      </footer>
    </Modal>
  );
}

function WinnerScore({ value }: { value: number }) {
  const shown = useAnimatedNumber(value, 900);
  return <span className={styles.winnerNumber}>{shown.toLocaleString()}</span>;
}
