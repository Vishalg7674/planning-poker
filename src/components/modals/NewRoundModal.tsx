'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store';
import { requestNewRound } from '@/lib/roomActions';
import styles from './modals.module.scss';

/**
 * Host confirmation for starting a new story in the SAME room. The round
 * payload (votes, results, reveal, story) resets for everyone; the room
 * itself — code, host, participants, settings — is untouched, so nobody is
 * kicked or re-invited. Shown from REVEALED and ENDED, where the action is
 * legal; the copy warns when unrevealed votes would be discarded.
 */
export default function NewRoundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const phase = useAppSelector((s) => s.voting.phase);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    const result = await requestNewRound(dispatch, store.getState);
    setBusy(false);
    // 'ok' = the room is now WAITING; 'guarded' = a parallel call already
    // started the round (double-click / second tab) — either way the new
    // waiting room is on its way, so dismiss the confirm. 'rejected' keeps
    // the dialog open for a retry; requestNewRound already surfaced the toast.
    if (result !== 'rejected') onClose();
  };

  const abandoning = phase === 'ended';

  return (
    <Modal open={open} onClose={onClose} title="Start a new story?" size="sm" origin="right top">
      <p className={styles.confirmBody}>
        A fresh voting round will begin <strong>for everyone in this room</strong>. Votes, results and the reveal reset —
        the room code, host, participants and settings stay exactly as they are.
      </p>
      {abandoning && (
        <p className={styles.confirmWarn} role="status">
          Voting was cut short by the timer — the votes collected so far are still hidden and will be discarded without a
          reveal.
        </p>
      )}
      <div className={styles.downloadRow}>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="gold" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Continue'}
        </Button>
      </div>
    </Modal>
  );
}
