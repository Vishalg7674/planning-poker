'use client';

import Modal from '@/components/Modal';
import Button from '@/components/Button';
import { useAppSelector } from '@/store';
import styles from './modals.module.scss';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * The round-result modal — replaces the old "message that never goes away"
 * pattern. It opens once per reveal for the two results that deserve
 * attention (full consensus 🎉 and large disagreement ⚡), is explicitly
 * dismissible, and never reappears for the same round (see uiSlice).
 *
 * The results panel itself stays behind the modal, so closing never loses
 * data — it just dismisses the notification.
 */
export default function RoundResultModal({ open, onClose }: Props) {
  const stats = useAppSelector((s) => s.voting.stats);
  const votes = useAppSelector((s) => s.voting.votes);
  const participants = useAppSelector((s) => s.participants.list);

  if (!open || !stats) return null;

  const isFull = stats.level === 'full';
  const voterCount = Object.keys(votes).length;

  return (
    <Modal open={open} onClose={onClose} title={isFull ? 'Consensus Reached' : 'Large Disagreement'} size="sm">
      <div className={styles.resultBody}>
        <span className={styles.resultEmoji} aria-hidden="true">
          {isFull ? '🎉' : '⚡'}
        </span>
        {isFull ? (
          <>
            <p className={styles.resultLine}>
              Everyone voted <strong>{stats.mode}</strong>
            </p>
            <p className={styles.resultSub}>
              {participants.length === 1
                ? 'The whole table is aligned.'
                : `All ${voterCount} ${voterCount === 1 ? 'voter is' : 'voters are'} aligned.`}
            </p>
            <div className={styles.resultStats}>
              {stats.numeric && stats.avg != null && (
                <span>
                  Average <strong>{stats.avg}</strong>
                </span>
              )}
              {stats.numeric && stats.median != null && (
                <span>
                  Median <strong>{stats.median}</strong>
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className={styles.resultLine}>Estimates range widely</p>
            <p className={styles.resultSub}>
              {stats.numeric && stats.lowest != null && stats.highest != null
                ? `From ${stats.lowest} → ${stats.highest} across ${stats.unique} different cards.`
                : `Across ${stats.unique} different cards.`}
            </p>
            <p className={styles.resultSub}>Worth a quick discussion before the round closes?</p>
          </>
        )}
      </div>
      <div className={styles.downloadRow}>
        <Button variant="gold" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
