import type { Theme } from '@/store/slices/uiSlice';

export const THEME_KEY = 'reveal:theme';
export const THEMES: Theme[] = ['dark', 'light', 'system'];

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    return stored && THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Swap the `data-theme` attribute — the only thing the whole token layer keys off. */
export function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
}

export function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode etc. — theme just won't persist */
  }
}
