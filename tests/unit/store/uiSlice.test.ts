import { beforeEach, describe, expect, it } from 'vitest';
import {
  connectionChanged,
  roomEnded,
  roomGone,
  snapshotReceived,
  timerUp,
  youRemoved,
} from '@/store/actions';
import reducer, {
  clearMyIdentity,
  dismissToast,
  openModal,
  closeModal,
  pushToast,
  setMyIdentity,
  setPresentation,
  setTheme,
  triggerCelebration,
} from '@/store/slices/uiSlice';
import { makeParticipant, makeSnapshot } from '../../helpers/fixtures';

describe('uiSlice', () => {
  it('has a sensible initial state', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state.joined).toBe(false);
    expect(state.myParticipantId).toBeNull();
    expect(state.myRole).toBe('voter');
    expect(state.connection).toBe('connecting');
    expect(state.toasts).toEqual([]);
    expect(state.modals).toEqual({ endSession: false, removeParticipant: false, roundResult: false });
  });

  it('setMyIdentity marks me as joined', () => {
    const state = reducer(undefined, setMyIdentity({ participantId: 'p1', name: 'Ada', role: 'facilitator' }));
    expect(state.joined).toBe(true);
    expect(state.myParticipantId).toBe('p1');
    expect(state.myRole).toBe('facilitator');
    expect(state.roomGoneMessage).toBeNull();
  });

  it('clearMyIdentity unjoins me', () => {
    let state = reducer(undefined, setMyIdentity({ participantId: 'p1', name: 'Ada', role: 'facilitator' }));
    state = reducer(state, clearMyIdentity());
    expect(state.joined).toBe(false);
    expect(state.myParticipantId).toBeNull();
  });

  it('connectionChanged tracks the socket state', () => {
    expect(reducer(undefined, connectionChanged('connected')).connection).toBe('connected');
    expect(reducer(undefined, connectionChanged('reconnecting')).connection).toBe('reconnecting');
  });

  it('pushToast appends and caps at four', () => {
    let state = reducer(undefined, { type: '@@init' });
    for (let i = 0; i < 6; i++) state = reducer(state, pushToast({ kind: 'info', title: `t${i}` }));
    expect(state.toasts).toHaveLength(4);
    expect(state.toasts[0].title).toBe('t2');
    expect(state.toasts.map((t) => t.id)).toEqual([...new Set(state.toasts.map((t) => t.id))]);
  });

  it('dismissToast removes a toast by id', () => {
    let state = reducer(undefined, pushToast({ kind: 'info', title: 'hi' }));
    const id = state.toasts[0].id;
    state = reducer(state, dismissToast(id));
    expect(state.toasts).toHaveLength(0);
  });

  it('timerUp surfaces the time is up warning', () => {
    const state = reducer(undefined, timerUp());
    expect(state.toasts[0].title).toBe("Time's up!");
    expect(state.toasts[0].kind).toBe('warning');
  });

  it('roomGone stores a message and unjoins', () => {
    let state = reducer(undefined, setMyIdentity({ participantId: 'p1', name: 'Ada', role: 'facilitator' }));
    state = reducer(state, roomGone({ message: 'gone' }));
    expect(state.roomGoneMessage).toBe('gone');
    expect(state.joined).toBe(false);
  });

  it('roomEnded shows a session-ended toast', () => {
    const state = reducer(undefined, roomEnded());
    expect(state.toasts[0].title).toBe('Session ended');
  });

  it('youRemoved clears my identity', () => {
    let state = reducer(undefined, setMyIdentity({ participantId: 'p1', name: 'Ada', role: 'facilitator' }));
    state = reducer(state, youRemoved());
    expect(state.joined).toBe(false);
    expect(state.myParticipantId).toBeNull();
  });

  it('snapshotReceived syncs my role/name and clears stale room-gone notices', () => {
    let state = reducer(undefined, setMyIdentity({ participantId: 'grace', name: 'Old', role: 'voter' }));
    state = reducer(state, roomGone({ message: 'stale' }));
    const me = makeParticipant({ id: 'grace', name: 'Grace', role: 'voter' });
    state = reducer(state, snapshotReceived(makeSnapshot({ participants: [me] })));
    expect(state.myName).toBe('Grace');
    expect(state.roomGoneMessage).toBeNull();
  });

  it('snapshotReceived flips a reconnecting socket to connected', () => {
    let state = reducer(undefined, connectionChanged('reconnecting'));
    state = reducer(state, snapshotReceived(makeSnapshot()));
    expect(state.connection).toBe('connected');
  });

  it('modals open and close', () => {
    let state = reducer(undefined, openModal('endSession'));
    expect(state.modals.endSession).toBe(true);
    state = reducer(state, closeModal('endSession'));
    expect(state.modals.endSession).toBe(false);
  });

  it('triggerCelebration increments the tick', () => {
    expect(reducer(undefined, triggerCelebration()).celebrationTick).toBe(1);
  });

  it('setTheme stores the theme', () => {
    expect(reducer(undefined, setTheme('light')).theme).toBe('light');
  });

  it('setPresentation toggles the big-screen mode', () => {
    expect(reducer(undefined, setPresentation(true)).presentation).toBe(true);
    expect(reducer(undefined, setPresentation(false)).presentation).toBe(false);
  });

  it('presentation defaults to off', () => {
    expect(reducer(undefined, { type: '@@init' }).presentation).toBe(false);
  });
});

describe('uiSlice round-result modal', () => {
  const fullStats = {
    count: 3,
    mode: '5',
    modeShare: 1,
    unique: 1,
    numeric: true,
    avg: 5,
    median: 5,
    spread: 0,
    highest: 5,
    lowest: 5,
    range: 0,
    level: 'full' as const,
    counts: [{ value: '5', count: 3 }],
  };
  const moderateStats = {
    ...fullStats,
    level: 'moderate' as const,
    modeShare: 0.5,
    unique: 2,
    counts: [
      { value: '5', count: 2 },
      { value: '8', count: 1 },
    ],
  };
  const largeStats = {
    ...fullStats,
    level: 'large' as const,
    modeShare: 0.25,
    unique: 4,
    avg: 11.75,
    median: 10.5,
    highest: 21,
    lowest: 3,
    range: 18,
    counts: [
      { value: '3', count: 1 },
      { value: '5', count: 1 },
      { value: '8', count: 1 },
      { value: '21', count: 1 },
    ],
  };

  function revealed(roundId: number, stats: any) {
    return snapshotReceived(makeSnapshot({ status: 'revealed', roundId, stats, votedIds: ['a', 'b', 'c'], everyoneHasVoted: true }));
  }

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('opens once on a full-consensus reveal and never again for the same round', () => {
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(state, revealed(1, fullStats));
    expect(state.modals.roundResult).toBe(true);
    expect(state.roundResultRound).toBe('ABCDE:1');

    // Re-broadcasts of the same round keep it open (not a duplicate).
    state = reducer(state, revealed(1, fullStats));
    expect(state.modals.roundResult).toBe(true);

    // Dismiss → closed and acknowledged.
    state = reducer(state, closeModal('roundResult'));
    expect(state.modals.roundResult).toBe(false);
    expect(state.acknowledgedRound).toBe('ABCDE:1');

    // The same round's snapshots must never reopen it.
    state = reducer(state, revealed(1, fullStats));
    expect(state.modals.roundResult).toBe(false);
  });

  it('reopens only for a genuinely new round', () => {
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(state, revealed(1, fullStats));
    state = reducer(state, closeModal('roundResult'));
    state = reducer(state, revealed(2, fullStats));
    expect(state.modals.roundResult).toBe(true);
    expect(state.roundResultRound).toBe('ABCDE:2');
  });

  it('a brand-new room is always a fresh event — the modal opens again', () => {
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(state, revealed(1, fullStats)); // room ABCDE
    state = reducer(state, closeModal('roundResult'));
    // Same round id in a different room must not inherit the dismissal.
    state = reducer(state, snapshotReceived(makeSnapshot({ code: 'FGHJK', status: 'revealed', roundId: 1, stats: fullStats })));
    expect(state.modals.roundResult).toBe(true);
    expect(state.roundResultRound).toBe('FGHJK:1');
  });

  it('opens for large disagreement too', () => {
    const state = reducer(undefined, revealed(1, largeStats));
    expect(state.modals.roundResult).toBe(true);
  });

  it('does not open for moderate consensus or an empty reveal', () => {
    expect(reducer(undefined, revealed(1, moderateStats)).modals.roundResult).toBe(false);
    expect(reducer(undefined, revealed(1, null)).modals.roundResult).toBe(false);
  });

  it('closes the modal when a new round starts', () => {
    let state = reducer(undefined, revealed(1, fullStats));
    expect(state.modals.roundResult).toBe(true);
    state = reducer(state, snapshotReceived(makeSnapshot({ status: 'voting', roundId: 2, stats: null })));
    expect(state.modals.roundResult).toBe(false);
  });
});
