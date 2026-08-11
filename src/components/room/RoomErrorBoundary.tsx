'use client';

import { Component, type ReactNode } from 'react';
import Link from 'next/link';
import Button from '@/components/Button';
import styles from './RoomErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches unexpected render errors inside the room so a display bug can never
 * white-screen the whole app. The realtime connection stays alive underneath —
 * "Try Again" just re-renders the room from the current store state.
 */
export default class RoomErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className={styles.fallback} role="alert">
        <span className={styles.emoji} aria-hidden="true">
          😵
        </span>
        <h2 className={styles.title}>Something went wrong</h2>
        <p className={styles.body}>Your room is still safe — this is a display error only. Try again or head home.</p>
        <div className={styles.actions}>
          <Button variant="gold" onClick={() => this.setState({ hasError: false })}>
            Try Again
          </Button>
          <Link href="/" className={styles.homeLink}>
            <Button variant="ghost">Back home</Button>
          </Link>
        </div>
      </div>
    );
  }
}
