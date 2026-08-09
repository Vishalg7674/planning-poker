import { describe, expect, it } from 'vitest';
import { snapshotReceived } from '@/store/actions';
import reducer, { resetRoom } from '@/store/slices/roomSlice';
import { makeSnapshot } from '../../helpers/fixtures';

describe('roomSlice', () => {
  it('has a sensible initial state', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state).toEqual({
      code: null,
      hostId: null,
      teamName: '',
      createdAt: 0,
      settings: { deckId: 'fibonacci', timerSec: null },
    });
  });

  it('hydrates from a snapshot', () => {
    const snapshot = makeSnapshot({
      code: 'XYZ12',
      hostId: 'host-9',
      teamName: 'Squad',
      createdAt: 12345,
      settings: { deckId: 'tshirt', timerSec: 15 },
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.code).toBe('XYZ12');
    expect(state.hostId).toBe('host-9');
    expect(state.teamName).toBe('Squad');
    expect(state.createdAt).toBe(12345);
    expect(state.settings).toEqual({ deckId: 'tshirt', timerSec: 15 });
  });

  it('copies settings rather than aliasing the snapshot', () => {
    const snapshot = makeSnapshot();
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.settings).not.toBe(snapshot.settings);
  });

  it('resetRoom returns the initial state', () => {
    const state = reducer(
      { code: 'X', hostId: 'h', teamName: 'T', createdAt: 1, settings: { deckId: 'standard', timerSec: 10 } },
      resetRoom(),
    );
    expect(state.code).toBeNull();
    expect(state.settings.timerSec).toBeNull();
  });
});
