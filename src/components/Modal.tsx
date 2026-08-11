'use client';

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
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

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Consistent enter/exit modal: scale+fade from an origin point over a blurred
 * backdrop. Rendered in a portal so transformed ancestors can't break it.
 *
 * Accessibility: focus moves into the dialog on open, Tab is trapped inside,
 * and focus returns to the element that opened the modal on close. Escape
 * closes it when `dismissable`.
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
  const onCloseRef = useRef(onClose);
  // Keep the latest onClose without forcing the key-listener effect below to
  // re-run on every render (parents pass inline arrow functions).
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      // Trap Tab inside the dialog.
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, dismissable]);

  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={dismissable ? () => onCloseRef.current() : undefined} role="presentation">
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(styles.modal, styles[size])}
        style={{ '--origin': origin } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={() => onCloseRef.current()} aria-label="Close dialog" className={styles.close}>
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
