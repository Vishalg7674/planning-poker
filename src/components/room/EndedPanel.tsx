'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import Button from '@/components/Button';
import styles from './EndedPanel.module.scss';

/** Screen 3 — the timer hit zero. Votes are closed; the host may reveal. */
export default function EndedPanel() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const votedCount = useAppSelector((s) => s.voting.votedIds.length);
  const participantCount = useAppSelector((s) => s.participants.list.length);
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
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Voting closed</span>
      <h2 className={styles.title}>Voting ended</h2>
      <p className={styles.sub}>
        {votedCount} of {participantCount} voted — the rest were still thinking. Votes are final.
      </p>

      {isHost ? (
        <>
          <Button variant="gold" size="lg" onClick={reveal} disabled={revealing}>
            {revealing ? 'Revealing…' : 'Reveal Votes'}
          </Button>
          <p className={styles.note}>The cards flip face-up for everyone the moment you reveal.</p>
        </>
      ) : (
        <p className={styles.waiting}>Waiting for the host to reveal the votes…</p>
      )}
    </div>
  );
}
