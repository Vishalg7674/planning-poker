'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useAppDispatch } from '@/store';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import styles from './modals.module.scss';

export default function EndSessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const end = async () => {
    setBusy(true);
    try {
      const res = await emitAck<{ ok: boolean }>('room:end', {});
      if (!res?.ok) throw new Error();
      // room:ended event tears the room down; the bridge clears state.
    } catch {
      dispatch(pushToast({ kind: 'error', title: 'Could not end session', message: 'Check your connection.' }));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="End the session?" size="sm" origin="right top">
      <p className={styles.confirmBody}>
        The room will be <strong>removed from memory</strong>. Everyone is disconnected, and no trace of this session is
        kept anywhere.
      </p>
      <div className={styles.downloadRow}>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Keep the room
        </Button>
        <Button variant="danger" onClick={end} disabled={busy}>
          {busy ? 'Ending…' : 'End session & clear memory'}
        </Button>
      </div>
    </Modal>
  );
}
