import { describe, expect, it } from 'vitest';
import { snapshotReceived } from '@/store/actions';
import reducer, { resetParticipants } from '@/store/slices/participantsSlice';
import { makeParticipant, makeSnapshot } from '../../helpers/fixtures';

describe('participantsSlice', () => {
  it('starts empty', () => {
    expect(reducer(undefined, { type: '@@init' }).list).toEqual([]);
  });

  it('sorts participants by join order', () => {
    const late = makeParticipant({ id: 'late', joinedAt: 9000 });
    const early = makeParticipant({ id: 'early', joinedAt: 1000 });
    const snapshot = makeSnapshot({ participants: [late, early] });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.list.map((p) => p.id)).toEqual(['early', 'late']);
  });

  it('resetParticipants empties the list', () => {
    const snapshot = makeSnapshot({ participants: [makeParticipant()] });
    const state = reducer(undefined, snapshotReceived(snapshot));
    expect(state.list).toHaveLength(1);
    expect(reducer(state, resetParticipants()).list).toEqual([]);
  });
});
