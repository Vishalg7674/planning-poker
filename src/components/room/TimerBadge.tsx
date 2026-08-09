'use client';

import { useAppSelector } from '@/store';
import styles from './TimerBadge.module.scss';
import { cx } from '@/lib/cx';

const R = 26;
const CIRC = 2 * Math.PI * R;

/**
 * Synced countdown ring. Every client derives remaining time from the shared
 * `endsAt`, so all browsers hit zero together. The server owns the timer:
 * when it reaches zero the room flips to "ended" for everyone.
 * Pure display — no host controls (duration is chosen in the waiting room).
 */
export default function TimerBadge() {
  const timer = useAppSelector((s) => s.timer.timer);
  const remaining = useAppSelector((s) => s.timer.remaining);
  const timesUp = useAppSelector((s) => s.timer.timesUp);
  const phase = useAppSelector((s) => s.voting.phase);

  // The countdown only matters while the round is live (voting / ended).
  if (!timer || (phase !== 'voting' && phase !== 'ended')) return null;

  const ratio = timer.durationSec > 0 ? remaining / timer.durationSec : 0;
  const tone = timesUp || remaining <= 0 ? 'zero' : ratio <= 0.15 ? 'urgent' : ratio <= 0.4 ? 'warn' : 'calm';
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className={cx(styles.ring, styles[tone], timesUp && styles.zeroShake)} title="Countdown synced across the room">
      <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
        <circle className={styles.track} cx="31" cy="31" r={R} />
        <circle
          className={styles.progress}
          cx="31"
          cy="31"
          r={R}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - Math.max(0, Math.min(1, ratio)))}
        />
      </svg>
      <span className={styles.time} aria-live="polite">
        {timesUp ? '0:00' : `${mm}:${ss}`}
      </span>
      <span className={styles.label}>{timesUp ? 'Time’s up!' : tone === 'calm' ? 'Voting' : tone === 'warn' ? 'Hurry it up' : 'Last call!'}</span>
    </div>
  );
}
