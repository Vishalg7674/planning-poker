'use client';

import { useMemo } from 'react';
import styles from './Celebration.module.scss';

interface CelebrationProps {
  /** Increment to replay the burst. */
  tick: number;
  /** Optional short celebratory microcopy shown mid-burst. */
  label?: string;
}

const PALETTE = [
  'var(--accent-bright)',
  'var(--accent)',
  'var(--success)',
  '#e5736f',
  '#9cc0f0',
  '#d8b4fe',
  '#ffffff',
];

const PIECE_COUNT = 46;

/**
 * Reusable confetti / particle burst. Pure DOM + CSS custom properties —
 * no canvas. Keyed on `tick` so every reveal replays the burst.
 */
export default function Celebration({ tick, label }: CelebrationProps) {
  /* eslint-disable react-hooks/purity -- random confetti is the whole point; the memo is keyed on `tick` so it recomputes per burst. */
  const pieces = useMemo(() => {
    if (!tick) return [];
    return Array.from({ length: PIECE_COUNT }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 200;
      return {
        id: `${tick}-${i}`,
        cx: Math.cos(angle) * dist,
        cy: Math.sin(angle) * dist - 40,
        cr: `${(Math.random() - 0.5) * 540}deg`,
        delay: Math.random() * 160,
        color: PALETTE[i % PALETTE.length],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        round: Math.random() > 0.7,
      };
    });
  }, [tick]);
  /* eslint-enable react-hooks/purity */

  if (!tick) return null;

  return (
    <div className={styles.burst} aria-hidden="true" data-tick={tick}>
      <div className={styles.flash} />
      {pieces.map((p) => (
        <span
          key={p.id}
          className={styles.piece}
          style={
            {
              '--cx': `${p.cx}px`,
              '--cy': `${p.cy}px`,
              '--cr': p.cr,
              '--delay': `${p.delay}ms`,
              background: p.color,
              width: `${p.w}px`,
              height: `${p.h}px`,
              borderRadius: p.round ? '50%' : '2px',
            } as React.CSSProperties
          }
        />
      ))}
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
