'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '@/store';
import { requestReveal, requestVote } from '@/lib/roomActions';

/**
 * Keyboard shortcuts:
 *  - Host: Space reveals the round once the timer ended, or as soon as
 *    everyone has voted
 *  - Anyone: 1–9 keys vote the deck by position while voting is live
 * Ignored while typing in a field, with a modal open, or when the focus is on
 * an interactive control (so Space still activates a focused button).
 * All actions route through the shared room-action helpers, so they carry the
 * same double-fire guards and friendly error handling as the buttons.
 */
export function useRoomShortcuts() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable ||
          t.closest('button, a, [role="button"], [role="radio"], [role="checkbox"]'))
      ) {
        return;
      }

      const s = store.getState();
      if (Object.values(s.ui.modals).some(Boolean)) return;

      const isHost = s.room.hostId === s.ui.myParticipantId;
      const canReveal = isHost && (s.voting.phase === 'ended' || (s.voting.phase === 'voting' && s.voting.everyoneHasVoted));

      if (canReveal && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        requestReveal(dispatch);
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const num = Number(e.key);
        if (num >= 1 && num <= 9) {
          const value = store.getState().voting.deckValues[num - 1];
          if (value) requestVote(dispatch, store.getState, value);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, store]);
}
