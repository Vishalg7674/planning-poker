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
    const snapshot = makeSnapshot({ settings: { deckId: 'tshirt', timerSec: null, accent: 'gold', revealMode: 'staggered' } });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.deckValues).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('tracks the active Would You Rather question from the snapshot', () => {
    const snapshot = makeSnapshot({
      game: 'would-you-rather',
      status: 'voting',
      question: { a: 'Have the ability to fly', b: 'Have the ability to be invisible' },
      questionIndex: 1,
      questionCount: 3,
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.question).toEqual({ a: 'Have the ability to fly', b: 'Have the ability to be invisible' });
    expect(state.questionIndex).toBe(1);
    expect(state.questionCount).toBe(3);
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

  it('tracks the active Most Likely To prompt and session data from the snapshot', () => {
    const snapshot = makeSnapshot({
      game: 'most-likely-to',
      status: 'revealed',
      prompt: 'Forget their laptop',
      promptIndex: 2,
      promptCount: 5,
      mltResult: { points: { p1: 100 }, counts: { p1: 3 }, winners: ['p1'], predictors: ['p2'] },
      mltScores: { p1: 100, p2: 20 },
      sessionOver: true,
    });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.prompt).toBe('Forget their laptop');
    expect(state.promptIndex).toBe(2);
    expect(state.promptCount).toBe(5);
    expect(state.mltResult!.points.p1).toBe(100);
    expect(state.mltScores.p2).toBe(20);
    expect(state.sessionOver).toBe(true);
  });

  it('resetVoting returns to the initial state', () => {
    const state = reducer(
      {
        phase: 'revealed',
        deckValues: ['1'],
        votedIds: ['a'],
        everyoneHasVoted: true,
        votes: { a: '1' },
        stats: null,
        myVote: '1',
        question: { a: 'x', b: 'y' },
        questionIndex: 2,
        questionCount: 4,
        prompt: 'p',
        promptIndex: 1,
        promptCount: 2,
        mltResult: { points: {}, counts: {}, winners: [], predictors: [] },
        mltScores: { a: 5 },
        sessionOver: true,
      },
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
      question: null,
      questionIndex: 0,
      questionCount: 0,
      prompt: null,
      promptIndex: 0,
      promptCount: 0,
      mltResult: null,
      mltScores: {},
      sessionOver: false,
    });
  });
});
