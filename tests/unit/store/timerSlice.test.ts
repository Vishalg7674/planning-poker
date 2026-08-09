import { describe, expect, it } from 'vitest';
import { snapshotReceived, timerUp } from '@/store/actions';
import reducer, { resetTimer, tick } from '@/store/slices/timerSlice';
import { makeSnapshot } from '../../helpers/fixtures';

describe('timerSlice', () => {
  it('has a sensible initial state', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state).toEqual({ timer: null, remaining: 0, timesUp: false });
  });

  it('derives remaining seconds from the shared endsAt', () => {
    const endsAt = Date.now() + 10_500;
    const snapshot = makeSnapshot({ timer: { durationSec: 10, endsAt } });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.timer).toEqual({ durationSec: 10, endsAt });
    expect(state.remaining).toBe(11); // ceil(10.5)
    expect(state.timesUp).toBe(false);
  });

  it('clears the timer when the snapshot has none', () => {
    const state = reducer(
      { timer: { durationSec: 10, endsAt: Date.now() + 1000 }, remaining: 1, timesUp: false },
      snapshotReceived(makeSnapshot({ timer: null })),
    );
    expect(state.timer).toBeNull();
    expect(state.remaining).toBe(0);
  });

  it('tick clamps at zero', () => {
    let state = reducer(undefined, tick(4));
    expect(state.remaining).toBe(4);
    state = reducer(state, tick(-2));
    expect(state.remaining).toBe(0);
  });

  it('timerUp marks the countdown finished', () => {
    const state = reducer({ timer: { durationSec: 10, endsAt: 0 }, remaining: 0, timesUp: false }, timerUp());
    expect(state.timesUp).toBe(true);
    expect(state.remaining).toBe(0);
  });

  it('resetTimer returns to the initial state', () => {
    const state = reducer({ timer: { durationSec: 10, endsAt: 1 }, remaining: 3, timesUp: true }, resetTimer());
    expect(state).toEqual({ timer: null, remaining: 0, timesUp: false });
  });
});
