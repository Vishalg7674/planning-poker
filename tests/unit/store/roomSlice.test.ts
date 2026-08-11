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
      roomTitle: '',
      createdAt: 0,
      game: 'planning-poker',
      settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' },
      locked: false,
    });
  });

  it('hydrates from a snapshot', () => {
    const snapshot = makeSnapshot({
      code: 'XYZ12',
      hostId: 'host-9',
      teamName: 'Squad',
      roomTitle: 'Sprint 24 Planning',
      createdAt: 12345,
      locked: true,
      settings: { deckId: 'tshirt', timerSec: 15, accent: 'purple', revealMode: 'dramatic' },
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.code).toBe('XYZ12');
    expect(state.hostId).toBe('host-9');
    expect(state.teamName).toBe('Squad');
    expect(state.roomTitle).toBe('Sprint 24 Planning');
    expect(state.createdAt).toBe(12345);
    expect(state.locked).toBe(true);
    expect(state.settings).toEqual({ deckId: 'tshirt', timerSec: 15, accent: 'purple', revealMode: 'dramatic' });
  });

  it('tracks which game the room is playing', () => {
    const snapshot = makeSnapshot({ game: 'would-you-rather' });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.game).toBe('would-you-rather');
  });

  it('copies settings rather than aliasing the snapshot', () => {
    const snapshot = makeSnapshot();
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.settings).not.toBe(snapshot.settings);
  });

  it('resetRoom returns the initial state', () => {
    const state = reducer(
      {
        code: 'X',
        hostId: 'h',
        teamName: 'T',
        roomTitle: 'R',
        createdAt: 1,
        game: 'would-you-rather',
        locked: true,
        settings: { deckId: 'sequential', timerSec: 10, accent: 'blue', revealMode: 'normal' },
      },
      resetRoom(),
    );
    expect(state.code).toBeNull();
    expect(state.settings.timerSec).toBeNull();
    expect(state.locked).toBe(false);
  });
});
