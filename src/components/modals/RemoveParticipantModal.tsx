'use client';

import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useAppDispatch } from '@/store';
import { closeModal, pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import type { Participant } from '@/lib/types';
import styles from './modals.module.scss';

interface Props {
  open: boolean;
  target: Participant | null;
  onClose: () => void;
}

export default function RemoveParticipantModal({ open, target, onClose }: Props) {
  const dispatch = useAppDispatch();

  const remove = () => {
    if (!target) return;
    emitAck<{ ok: boolean; error?: string }>('participant:remove', { participantId: target.id }).then((res) => {
        if (!res.ok) throw new Error(res.error);
        dispatch(pushToast({ kind: 'success', title: 'Removed', message: `${target.name} is off the table.` }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Could not remove', message: 'Check your connection.' })));
    dispatch(closeModal('removeParticipant'));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Remove from table" size="sm" origin="right top">
      <p className={styles.confirmBody}>
        Remove <strong>{target?.name ?? 'this participant'}</strong>? They’ll be disconnected and can rejoin with a new
        identity if the room is still open.
      </p>
      <div className={styles.downloadRow}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={remove}>
          Remove
        </Button>
      </div>
    </Modal>
  );
}
