'use client';

import { useEffect, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store, useAppDispatch } from '@/store';
import { setTheme } from '@/store/slices/uiSlice';
import { applyTheme, readStoredTheme } from '@/lib/theme';

/**
 * ThemeSync keeps `data-theme` on <html> in lockstep with the uiSlice theme,
 * including following the OS preference while in "system" mode. It renders
 * nothing — it only runs the theme side effects.
 */
function ThemeSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const theme = readStoredTheme();
    dispatch(setTheme(theme));
    applyTheme(theme);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      // Only re-resolve when the user is on "system".
      if (store.getState().ui.theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, [dispatch]);

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
