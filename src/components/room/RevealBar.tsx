'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { requestReveal } from '@/lib/roomActions';
import Button from '@/components/Button';
import styles from './RevealBar.module.scss';

/**
 * Live status bar under the deck while voting is in progress.
 * Everyone sees the N / M vote counter; the host gets the gold Reveal button
 * as soon as every participant has voted — no waiting for a timer.
 */
export default function RevealBar() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const participants = useAppSelector((s) => s.participants.list);
  // Progress counts only reflect people actually at the table — a participant
  // who disconnected must not inflate the denominator (the server's
  // everyoneHasVoted already ignores them).
  const activeCount = participants.filter((p) => p.status !== 'disconnected').length;
  const activeVotedCount = participants.filter((p) => p.status !== 'disconnected' && p.hasVoted).length;
  const everyoneHasVoted = useAppSelector((s) => s.voting.everyoneHasVoted);
  const [revealing, setRevealing] = useState(false);

  const reveal = () => {
    if (revealing) return;
    setRevealing(true);
    requestReveal(dispatch).finally(() => setRevealing(false));
  };

  return (
    <div className={styles.bar} data-complete={everyoneHasVoted}>
      <span className={styles.count} role="status" aria-live="polite">
        {everyoneHasVoted ? (
          <>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>{' '}
            Everyone has voted · {activeVotedCount} / {activeCount}
          </>
        ) : (
          <>
            {activeVotedCount} / {activeCount} voted
          </>
        )}
      </span>
      {isHost ? (
        everyoneHasVoted ? (
          <Button variant="gold" size="md" onClick={reveal} disabled={revealing}>
            {revealing ? 'Revealing…' : 'Reveal Votes'}
          </Button>
        ) : (
          <span className={styles.wait}>Reveal unlocks once everyone has voted.</span>
        )
      ) : (
        <span className={styles.wait}>Votes stay hidden until the host reveals.</span>
      )}
    </div>
  );
}
