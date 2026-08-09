'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { dismissToast, type ToastKind } from '@/store/slices/uiSlice';
import styles from './Toasts.module.scss';

const KIND_ICON: Record<ToastKind, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '!',
  error: '✕',
  celebrate: '♦',
};

export default function Toasts() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  const dispatch = useAppDispatch();

  // Auto-dismiss
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => window.setTimeout(() => dispatch(dismissToast(t.id)), 4600));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts, dispatch]);

  if (!toasts.length) return null;

  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
          <span className={styles.icon} aria-hidden="true">
            {KIND_ICON[t.kind]}
          </span>
          <div className={styles.copy}>
            <p className={styles.title}>{t.title}</p>
            {t.message && <p className={styles.msg}>{t.message}</p>}
          </div>
          <button className={styles.x} onClick={() => dispatch(dismissToast(t.id))} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
