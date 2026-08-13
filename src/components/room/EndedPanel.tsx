'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { openModal } from '@/store/slices/uiSlice';
import { requestReveal } from '@/lib/roomActions';
import Button from '@/components/Button';
import styles from './EndedPanel.module.scss';

/** Screen 3 — the timer hit zero. Votes are closed; the host may reveal. */
export default function EndedPanel() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const participants = useAppSelector((s) => s.participants.list);
  // Only count people still at the table — disconnected participants neither
  // vote nor block the reveal.
  const activeCount = participants.filter((p) => p.status !== 'disconnected').length;
  const activeVotedCount = participants.filter((p) => p.status !== 'disconnected' && p.hasVoted).length;
  const [revealing, setRevealing] = useState(false);

  const reveal = () => {
    if (revealing) return;
    setRevealing(true);
    requestReveal(dispatch).finally(() => setRevealing(false));
  };

  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Voting closed</span>
      <h2 className={styles.title}>Voting ended</h2>
      <p className={styles.sub}>
        {activeVotedCount} of {activeCount} voted — the rest were still thinking. Votes are final.
      </p>

      {isHost ? (
        <>
          <div className={styles.actions}>
            <Button variant="gold" size="lg" onClick={reveal} disabled={revealing}>
              {revealing ? 'Revealing…' : 'Reveal Votes'}
            </Button>
            <Button variant="outline" size="lg" onClick={() => dispatch(openModal('newRound'))} disabled={revealing}>
              + New Story
            </Button>
          </div>
          <p className={styles.note}>The cards flip face-up for everyone the moment you reveal.</p>
        </>
      ) : (
        <p className={styles.waiting}>Waiting for the host to reveal the votes…</p>
      )}
    </div>
  );
}
