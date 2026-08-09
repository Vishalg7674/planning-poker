'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
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
  const votedCount = useAppSelector((s) => s.voting.votedIds.length);
  const participantCount = useAppSelector((s) => s.participants.list.length);
  const everyoneHasVoted = useAppSelector((s) => s.voting.everyoneHasVoted);
  const [revealing, setRevealing] = useState(false);

  const reveal = () => {
    if (revealing) return;
    setRevealing(true);
    emitAck<{ ok: boolean; error?: string }>('votes:reveal', {})
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not reveal', message: res?.error }));
          setRevealing(false);
        }
      })
      .catch(() => {
        dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' }));
        setRevealing(false);
      });
  };

  return (
    <div className={styles.bar} data-complete={everyoneHasVoted}>
      <span className={styles.count} role="status" aria-live="polite">
        {everyoneHasVoted ? (
          <>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>{' '}
            Everyone has voted · {votedCount} / {participantCount}
          </>
        ) : (
          <>
            {votedCount} / {participantCount} voted
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
