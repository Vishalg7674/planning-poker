'use client';

import { useAppDispatch, useAppSelector } from '@/store';
import { setTheme, type Theme } from '@/store/slices/uiSlice';
import { applyTheme, persistTheme } from '@/lib/theme';
import styles from './ThemeToggle.module.scss';

const NEXT: Record<Theme, Theme> = { dark: 'light', light: 'system', system: 'dark' };
const TITLE: Record<Theme, string> = { dark: 'Dark theme', light: 'Light theme', system: 'Follow system' };

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export default function ThemeToggle() {
  const theme = useAppSelector((s) => s.ui.theme);
  const dispatch = useAppDispatch();

  const cycle = () => {
    const next = NEXT[theme];
    dispatch(setTheme(next));
    applyTheme(next);
    persistTheme(next);
  };

  const Icon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : SystemIcon;

  return (
    <button type="button" className={styles.toggle} onClick={cycle} title={`Theme: ${TITLE[theme]} — click to change`} aria-label={`Theme: ${TITLE[theme]}`}>
      <Icon />
    </button>
  );
}
