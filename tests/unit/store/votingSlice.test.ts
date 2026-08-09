import { describe, expect, it } from 'vitest';
import { snapshotReceived } from '@/store/actions';
import reducer, { clearMyVote, resetVoting, setMyVote } from '@/store/slices/votingSlice';
import { makeParticipant, makeSnapshot } from '../../helpers/fixtures';

describe('votingSlice', () => {
  it('has a sensible initial state', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state.phase).toBe('waiting');
    expect(state.deckValues).toEqual([]);
    expect(state.votedIds).toEqual([]);
    expect(state.everyoneHasVoted).toBe(false);
    expect(state.votes).toEqual({});
    expect(state.stats).toBeNull();
    expect(state.myVote).toBeNull();
  });

  it('setMyVote locks my card optimistically, clearMyVote rolls it back', () => {
    let state = reducer(undefined, setMyVote('8'));
    expect(state.myVote).toBe('8');
    state = reducer(state, clearMyVote());
    expect(state.myVote).toBeNull();
  });

  it('hydrates deck values from the room settings', () => {
    const snapshot = makeSnapshot({ settings: { deckId: 'tshirt', timerSec: null } });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.deckValues).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', '?']);
  });

  it('keeps votes private until the reveal', () => {
    const snapshot = makeSnapshot({
      status: 'voting',
      votedIds: ['grace'],
      participants: [makeParticipant({ id: 'grace' })],
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.phase).toBe('voting');
    expect(state.votedIds).toEqual(['grace']);
    expect(state.votes).toEqual({});
    expect(state.stats).toBeNull();
  });

  it('exposes votes and stats once revealed', () => {
    const snapshot = makeSnapshot({
      status: 'revealed',
      votedIds: ['grace'],
      everyoneHasVoted: true,
      votes: { grace: '8' },
      stats: { count: 1, mode: '8', modeShare: 1, unique: 1, avg: 8, median: 8, spread: 0, level: 'full', counts: [{ value: '8', count: 1 }] },
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.votes).toEqual({ grace: '8' });
    expect(state.stats!.mode).toBe('8');
    expect(state.everyoneHasVoted).toBe(true);
  });

  it('resetVoting returns to the initial state', () => {
    const state = reducer(
      { phase: 'revealed', deckValues: ['1'], votedIds: ['a'], everyoneHasVoted: true, votes: { a: '1' }, stats: null, myVote: '1' },
      resetVoting(),
    );
    expect(state).toEqual({
      phase: 'waiting',
      deckValues: [],
      votedIds: [],
      everyoneHasVoted: false,
      votes: {},
      stats: null,
      myVote: null,
    });
  });
});
