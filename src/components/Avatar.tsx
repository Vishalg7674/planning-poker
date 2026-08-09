'use client';

import type { ParticipantStatus } from '@/lib/types';
import styles from './Avatar.module.scss';
import { cx } from '@/lib/cx';

interface AvatarProps {
  name: string;
  hue: number;
  status?: ParticipantStatus;
  size?: 'sm' | 'md' | 'lg';
  isHost?: boolean;
  isMe?: boolean;
  title?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Hue-derived avatar circle with a status ring (thinking → voted pulse). */
export default function Avatar({ name, hue, status, size = 'md', isHost, isMe, title }: AvatarProps) {
  return (
    <span
      className={cx(styles.avatar, styles[size], status && styles[`status-${status}`], isHost && styles.host)}
      style={{ '--hue': hue } as React.CSSProperties}
      title={title ?? name}
      role="img"
      aria-label={name}
    >
      <span className={styles.face}>{initials(name)}</span>
      {isHost && (
        <span className={styles.crown} aria-hidden="true">
          ♛
        </span>
      )}
      {isMe && <span className={styles.me}>you</span>}
    </span>
  );
}
