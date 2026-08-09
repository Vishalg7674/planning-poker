'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store, useAppDispatch } from '@/store';
import { setTheme } from '@/store/slices/uiSlice';
import { applyTheme, readStoredTheme } from '@/lib/theme';

/**
 * ThemeSync keeps `data-theme` on <html> in lockstep with the uiSlice theme,
 * including following the OS preference while in "system" mode.
 */
function ThemeSync() {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const theme = readStoredTheme();
    dispatch(setTheme(theme));
    applyTheme(theme);
    setReady(true);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      // Only re-resolve when the user is on "system".
      if (store.getState().ui.theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, [dispatch]);

  if (!ready) return null;
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeSync />
      {children}
    </Provider>
  );
}
