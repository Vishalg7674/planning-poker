import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAnimatedNumber } from '@/lib/useAnimatedNumber';

afterEach(() => {
  vi.useRealTimers();
});

describe('useAnimatedNumber', () => {
  it('shows the initial target immediately (no animation on mount)', () => {
    const { result } = renderHook(() => useAnimatedNumber(420));
    expect(result.current).toBe(420);
  });

  it('animates toward a new target and settles on it', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target), {
      initialProps: { target: 0 },
    });
    expect(result.current).toBe(0);

    rerender({ target: 100 });
    act(() => vi.advanceTimersByTime(16)); // first animation frame fires
    expect(result.current).toBeGreaterThan(0); // started moving

    act(() => vi.advanceTimersByTime(700));
    expect(result.current).toBe(100);
  });

  it('does not settle below the target mid-animation', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target), {
      initialProps: { target: 0 },
    });
    rerender({ target: 80 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBeLessThanOrEqual(80);
    expect(result.current).toBeGreaterThan(0);
  });

  it('snaps instantly when the user prefers reduced motion', () => {
    const media = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
    media.mockImplementation((query: string) => ({
      matches: true, // reduced motion
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target), {
      initialProps: { target: 0 },
    });
    rerender({ target: 250 });
    expect(result.current).toBe(250);

    // restore the default (no reduced motion)
    media.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
});
