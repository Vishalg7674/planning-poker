'use client';

import { useAppDispatch } from '@/store';
import { openModal } from '@/store/slices/uiSlice';
import Button from '@/components/Button';
import styles from './HostToolbar.module.scss';

/** The only host control left below the table: end the session. */
export default function HostToolbar() {
  const dispatch = useAppDispatch();

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <span className={styles.hint}>Shortcuts: Space reveal · 1–9 vote</span>
        <Button size="sm" variant="danger" onClick={() => dispatch(openModal('endSession'))}>
          End session
        </Button>
      </div>
    </div>
  );
}
