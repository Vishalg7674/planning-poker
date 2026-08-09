'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '@/store';
import { setMyVote } from '@/store/slices/votingSlice';
import { emitAck } from '@/lib/socket';

/**
 * Keyboard shortcuts:
 *  - Host: Space reveals the round once the timer ended, or as soon as
 *    everyone has voted
 *  - Anyone: 1–9 keys vote the deck by position while voting is live
 * Ignored while typing in a field or with a modal open.
 */
export function useRoomShortcuts() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

      const s = store.getState();
      if (Object.values(s.ui.modals).some(Boolean)) return;

      const isHost = s.room.hostId === s.ui.myParticipantId;
      const canReveal = isHost && (s.voting.phase === 'ended' || (s.voting.phase === 'voting' && s.voting.everyoneHasVoted));

      if (canReveal && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        emitAck('votes:reveal', {});
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const num = Number(e.key);
        const st = store.getState();
        if (num >= 1 && num <= 9 && st.voting.phase === 'voting' && !st.voting.myVote) {
          const value = st.voting.deckValues[num - 1];
          if (value) {
            dispatch(setMyVote(value));
            emitAck('vote:cast', { value });
          }
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, store]);
}
