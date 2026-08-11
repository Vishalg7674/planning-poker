'use client';

import type { AppDispatch, RootState } from '@/store';
import { clearMyVote, setMyVote } from '@/store/slices/votingSlice';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import { friendlyError } from '@/lib/errors';

/**
 * Shared room actions. Every click + keyboard path for vote / reveal / start
 * goes through these helpers so that:
 *
 *  1. Double-fires are impossible (guards check live store state / a module
 *     in-flight flag, not a stale render closure).
 *  2. Server error codes are translated to human messages.
 *  3. The optimistic vote lock behaves consistently everywhere — including
 *     `already_voted`, which means our vote IS counted, so the lock must stay.
 */

let revealInFlight = false;
let startInFlight = false;

/**
 * Cast a vote. Optimistically locks my card, then talks to the server. A
 * double-click or a stray keyboard press cannot double-send: the guards read
 * the live Redux state (myVote / votedIds) which `setMyVote` updates
 * synchronously, and the server owns the final lock anyway.
 */
export function requestVote(dispatch: AppDispatch, getState: () => RootState, value: string): void {
  const s = getState();
  if (s.voting.phase !== 'voting') return;
  if (s.voting.myVote !== null) return;
  const myId = s.ui.myParticipantId;
  if (myId && s.voting.votedIds.includes(myId)) return;

  dispatch(setMyVote(value));
  emitAck<{ ok: boolean; error?: string }>('vote:cast', { value })
    .then((res) => {
      // already_voted = the server already has our vote (a duplicate landed
      // first). That is success — keep the lock, don't scare the user.
      if (res?.ok || res?.error === 'already_voted') return;
      dispatch(clearMyVote());
      dispatch(
        pushToast({ kind: 'error', title: 'Vote not counted', message: friendlyError(res?.error, 'Your vote was not accepted.') }),
      );
    })
    .catch(() => {
      dispatch(clearMyVote());
      dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table — check your connection.' }));
    });
}

/**
 * Reveal the round (host-only — the server enforces it). Idempotent: a second
 * call while one is in flight is a no-op, so rapid clicks or a Space keypress
 * racing the button can never produce two reveal events.
 */
export function requestReveal(dispatch: AppDispatch): Promise<boolean> {
  if (revealInFlight) return Promise.resolve(false);
  revealInFlight = true;
  return emitAck<{ ok: boolean; error?: string }>('votes:reveal', {})
    .then((res) => {
      if (res?.ok) return true;
      dispatch(pushToast({ kind: 'error', title: 'Could not reveal', message: friendlyError(res?.error, 'The votes could not be revealed.') }));
      return false;
    })
    .catch(() => {
      dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' }));
      return false;
    })
    .finally(() => {
      revealInFlight = false;
    });
}

/** Start the round (host-only — the server enforces it). Idempotent like reveal. */
export function requestStart(dispatch: AppDispatch): Promise<boolean> {
  if (startInFlight) return Promise.resolve(false);
  startInFlight = true;
  return emitAck<{ ok: boolean; error?: string }>('voting:start', {})
    .then((res) => {
      if (res?.ok) return true;
      dispatch(pushToast({ kind: 'error', title: 'Could not start', message: friendlyError(res?.error, 'The round could not be started.') }));
      return false;
    })
    .catch(() => {
      dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' }));
      return false;
    })
    .finally(() => {
      startInFlight = false;
    });
}
