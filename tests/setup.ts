import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// jsdom polyfills — jsdom is intentionally minimal; a few browser APIs the
// app uses are not implemented there.
// ---------------------------------------------------------------------------

// matchMedia: used by lib/theme (system theme) and providers/ThemeSync.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// requestAnimationFrame: used by DistributionChart's grow animation.
window.requestAnimationFrame ??= (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame ??= (id: number) => window.clearTimeout(id);

// navigator.clipboard: used by StartPanel / room page "Copy invite link".
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

// ---------------------------------------------------------------------------
// Auto-cleanup: unmount every rendered component after each test so state
// (and portal DOM) never leaks between tests.
// ---------------------------------------------------------------------------
afterEach(() => cleanup());
