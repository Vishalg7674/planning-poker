'use client';

import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';

/**
 * App providers. Reveal is night-only by design — `data-theme="dark"` is set
 * statically in the root layout and every token in src/styles/globals.scss is
 * tuned for the dark felt, so there is no theme state to sync.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
