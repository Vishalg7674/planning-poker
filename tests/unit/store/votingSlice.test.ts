import { describe, expect, it } from 'vitest';
import { snapshotReceived } from '@/store/actions';
import reducer, { clearMyVote, resetVoting, setMyVote } from '@/store/slices/votingSlice';
import { makeParticipant, makeSnapshot } from '../../helpers/fixtures';

describe('votingSlice', () => {
  it('has a sensible initial state', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state.phase).toBe('waiting');
    expect(state.roundId).toBe(0);
    expect(state.story).toBeNull();
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
    const snapshot = makeSnapshot({ settings: { deckId: 'tshirt', timerSec: null, accent: 'gold', revealMode: 'staggered' } });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.deckValues).toEqual(['XS', 'S', 'M', 'L', 'XL']);
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
      stats: {
        count: 1,
        mode: '8',
        modeShare: 1,
        unique: 1,
        numeric: true,
        avg: 8,
        median: 8,
        spread: 0,
        highest: 8,
        lowest: 8,
        range: 0,
        level: 'full',
        counts: [{ value: '8', count: 1 }],
      },
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.votes).toEqual({ grace: '8' });
    expect(state.stats!.mode).toBe('8');
    expect(state.everyoneHasVoted).toBe(true);
  });

  it('hydrates roundId and the story from the snapshot', () => {
    const snapshot = makeSnapshot({
      roundId: 3,
      status: 'voting',
      story: { id: 'PROJ-143', title: 'User Profile', description: 'As a user…' },
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.roundId).toBe(3);
    expect(state.story).toEqual({ id: 'PROJ-143', title: 'User Profile', description: 'As a user…' });
  });

  it('clears my optimistic vote when a new round begins (roundId changes)', () => {
    const round1 = reducer(undefined, snapshotReceived(makeSnapshot({ roundId: 1, status: 'voting' })));
    const voted = reducer(round1, setMyVote('8'));
    expect(voted.myVote).toBe('8');
    // The host starts the next story: startVoting increments roundId → 2.
    const nextRound = reducer(voted, snapshotReceived(makeSnapshot({ roundId: 2, status: 'voting', votedIds: [] })));
    expect(nextRound.myVote).toBeNull();
    expect(nextRound.roundId).toBe(2);
  });

  it('clears my optimistic vote when the room returns to waiting (host pressed New)', () => {
    const revealed = reducer(undefined, snapshotReceived(makeSnapshot({ roundId: 1, status: 'revealed', votes: { me: '5' }, votedIds: ['me'] })));
    const voted = reducer(revealed, setMyVote('5'));
    expect(voted.myVote).toBe('5');
    // room:newRound resets to WAITING with the SAME roundId — votes must still go.
    const waiting = reducer(voted, snapshotReceived(makeSnapshot({ roundId: 1, status: 'waiting', votedIds: [], votes: {}, stats: null })));
    expect(waiting.myVote).toBeNull();
    expect(waiting.phase).toBe('waiting');
    expect(waiting.votedIds).toEqual([]);
  });

  it('resetVoting returns to the initial state', () => {
    const state = reducer(
      { phase: 'revealed', roundId: 2, story: { id: 'X', title: 'T', description: '' }, deckValues: ['1'], votedIds: ['a'], everyoneHasVoted: true, votes: { a: '1' }, stats: null, myVote: '1' },
      resetVoting(),
    );
    expect(state).toEqual({
      phase: 'waiting',
      roundId: 0,
      story: null,
      deckValues: [],
      votedIds: [],
      everyoneHasVoted: false,
      votes: {},
      stats: null,
      myVote: null,
    });
  });
});
