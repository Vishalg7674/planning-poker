'use client';

import { useAppDispatch, useAppSelector } from '@/store';
import { openModal, setPresentation } from '@/store/slices/uiSlice';
import Button from '@/components/Button';
import styles from './HostToolbar.module.scss';

/** Host controls below the table: presentation mode + end the session. */
export default function HostToolbar() {
  const dispatch = useAppDispatch();
  const presentation = useAppSelector((s) => s.ui.presentation);

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <span className={styles.hint}>Shortcuts: Space reveal · 1–9 vote</span>
        <div className={styles.actions}>
          <Button size="sm" variant="outline" onClick={() => dispatch(setPresentation(!presentation))}>
            {presentation ? 'Exit Presentation' : '📺 Presentation'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => dispatch(openModal('endSession'))}>
            End session
          </Button>
        </div>
      </div>
    </div>
  );
}
