'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '@/store';
import { setMyVote } from '@/store/slices/votingSlice';
import { emitAck } from '@/lib/socket';

/**
 * Keyboard shortcuts:
 *  - Host: Space reveals the round once the timer ended, as soon as everyone
 *    has voted — or, in Would You Rather, whenever the question is live
 *  - Planning Poker: 1–9 vote the deck by position while voting is live
 *  - Would You Rather: A / B keys pick a side while the question is live
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
      const isWyr = s.room.game === 'would-you-rather';
      const isPoker = s.room.game === 'planning-poker';
      // Icebreaker games (WYR, MLT) are host-paced — Space reveals any time.
      const canReveal =
        isHost &&
        (s.voting.phase === 'ended' ||
          (s.voting.phase === 'voting' && (s.voting.everyoneHasVoted || isWyr || s.room.game === 'most-likely-to')));

      if (canReveal && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        emitAck('votes:reveal', {});
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const st = store.getState();
        if (st.voting.phase !== 'voting' || st.voting.myVote) return;
        if (isWyr) {
          const side = e.key.toLowerCase();
          if (side === 'a' || side === 'b') {
            dispatch(setMyVote(side.toUpperCase()));
            emitAck('vote:cast', { value: side.toUpperCase() });
          }
          return;
        }
        // Number keys vote the deck only in Planning Poker — other games
        // (MLT and future ones) have their own controls.
        if (!isPoker) return;
        const num = Number(e.key);
        if (num >= 1 && num <= 9) {
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
