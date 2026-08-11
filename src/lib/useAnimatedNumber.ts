'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/** True when the user asked the OS to reduce motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly animates a number toward `target` (ease-out cubic) whenever it
 * changes. With `prefers-reduced-motion` it renders the target directly.
 *
 * Used by the Leaderboard / WinnerModal score counters: the displayed value
 * eases from the previously committed value to the new total — never a jarring
 * pop. `duration` is the animation length in ms.
 */
export function useAnimatedNumber(target: number, duration = 650): number {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [value, setValue] = useState(target);
  const committedRef = useRef(target);

  useEffect(() => {
    if (reduced) {
      committedRef.current = target;
      return;
    }
    const from = committedRef.current;
    if (from === target) return;

    // Date.now (not performance.now) so the hook works identically under
    // Vitest fake timers — the rAF timestamp argument is ignored.
    const start = Date.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setValue(Math.round(from + (target - from) * easeOut(t)));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        committedRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return reduced ? target : value;
}
