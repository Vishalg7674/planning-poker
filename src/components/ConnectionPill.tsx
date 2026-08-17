'use client';

import { useAppDispatch, useAppSelector } from '@/store';
import { connectionChanged } from '@/store/actions';
import { getSocket } from '@/lib/socket';
import styles from './ConnectionPill.module.scss';

const LABEL: Record<string, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting…',
  disconnected: 'Server offline',
};

/** Small non-blocking pill showing the realtime connection state. When the
 * server is unreachable it turns into a Retry button — a socket failure never
 * freezes the UI, it just asks you to reconnect. */
export default function ConnectionPill() {
  const connection = useAppSelector((s) => s.ui.connection);
  const dispatch = useAppDispatch();

  if (connection === 'disconnected') {
    return (
      <button
        type="button"
        className={`${styles.pill} ${styles.disconnected} ${styles.retry}`}
        onClick={() => {
          getSocket().connect();
          dispatch(connectionChanged('connecting'));
        }}
        title="Reconnect to the realtime server"
        aria-label="Reconnect to the realtime server"
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.label}>Server offline — Retry</span>
      </button>
    );
  }

  return (
    <span className={`${styles.pill} ${styles[connection]}`} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{LABEL[connection] ?? connection}</span>
    </span>
  );
}
