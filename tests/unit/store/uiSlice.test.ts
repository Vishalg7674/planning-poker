import { describe, expect, it } from 'vitest';
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
    expect(state.modals).toEqual({ endSession: false, removeParticipant: false });
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
});
