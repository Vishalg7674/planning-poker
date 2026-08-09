import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, persistTheme, readStoredTheme, resolveTheme, THEME_KEY } from '@/lib/theme';

describe('theme helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    // matchMedia is stubbed to `matches: false` in tests/setup.ts.
  });

  describe('readStoredTheme', () => {
    it('defaults to system when nothing is stored', () => {
      expect(readStoredTheme()).toBe('system');
    });

    it('reads a stored theme', () => {
      window.localStorage.setItem(THEME_KEY, 'dark');
      expect(readStoredTheme()).toBe('dark');
    });

    it('falls back to system for an invalid stored value', () => {
      window.localStorage.setItem(THEME_KEY, 'neon');
      expect(readStoredTheme()).toBe('system');
    });
  });

  describe('resolveTheme', () => {
    it('resolves explicit themes directly', () => {
      expect(resolveTheme('dark')).toBe('dark');
      expect(resolveTheme('light')).toBe('light');
    });

    it('follows the OS preference for system', () => {
      // matches: false → light, per the jsdom stub.
      expect(resolveTheme('system')).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('sets data-theme on <html>', () => {
      applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('persistTheme', () => {
    it('writes the theme to localStorage', () => {
      persistTheme('light');
      expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
    });

    it('swallows storage errors (private mode)', () => {
      const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(() => persistTheme('dark')).not.toThrow();
      setItem.mockRestore();
    });
  });
});
