'use client';

import { useAppSelector } from '@/store';
import styles from './ConnectionPill.module.scss';

const LABEL: Record<string, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Server offline',
};

/** Small non-blocking pill showing the realtime connection state. */
export default function ConnectionPill() {
  const connection = useAppSelector((s) => s.ui.connection);
  return (
    <span className={`${styles.pill} ${styles[connection]}`} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{LABEL[connection] ?? connection}</span>
    </span>
  );
}
