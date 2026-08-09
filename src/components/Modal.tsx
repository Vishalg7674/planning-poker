'use client';

import { useEffect, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import styles from './Modal.module.scss';
import { cx } from '@/lib/cx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** transform-origin for the enter animation — e.g. '80% 6%' makes it grow from the trigger. */
  origin?: string;
  /** close when the backdrop is clicked */
  dismissable?: boolean;
}

/**
 * Consistent enter/exit modal: scale+fade from an origin point over a blurred
 * backdrop. Rendered in a portal so transformed ancestors can't break it.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  origin = 'center',
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={dismissable ? onClose : undefined} role="presentation">
      <div
        className={cx(styles.modal, styles[size])}
        style={{ '--origin': origin } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog" className={styles.close}>
            ✕
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
