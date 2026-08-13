import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestNewRound, requestReveal, requestSkip, requestStart, requestVote } from '@/lib/roomActions';
import { makeStore } from '../../helpers/store';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

function votingStore() {
  // The store helper shallow-merges partials over the slice defaults — the
  // `as never` keeps that intentionally-partial typing, like the component tests.
  return makeStore({
    room: { hostId: 'p1', settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' } },
    voting: {
      phase: 'voting',
      deckValues: ['1', '2', '3', '5', '8', '13', '21'],
      votedIds: [],
      everyoneHasVoted: false,
      votes: {},
      stats: null,
      myVote: null,
    },
    ui: { myParticipantId: 'p2' },
  } as never);
}

describe('requestVote', () => {
  beforeEach(() => {
    emitAckMock.mockReset();
    emitAckMock.mockResolvedValue({ ok: true });
  });

  it('locks the card optimistically and sends exactly one vote', () => {
    const store = votingStore();
    requestVote(store.dispatch, store.getState, '8');
    expect(store.getState().voting.myVote).toBe('8');
    expect(emitAckMock).toHaveBeenCalledWith('vote:cast', { value: '8' });
  });

  it('ignores a second call while a vote is locked (double-click protection)', () => {
    const store = votingStore();
    requestVote(store.dispatch, store.getState, '8');
    requestVote(store.dispatch, store.getState, '8');
    expect(emitAckMock).toHaveBeenCalledTimes(1);
    expect(store.getState().voting.myVote).toBe('8');
  });

  it('keeps the lock and stays quiet when the server reports already_voted', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'already_voted' });
    const store = votingStore();
    requestVote(store.dispatch, store.getState, '8');
    await Promise.resolve();
    expect(store.getState().voting.myVote).toBe('8');
    expect(store.getState().ui.toasts).toHaveLength(0);
  });

  it('rolls back the lock and warns on a genuine rejection', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'bad_value' });
    const store = votingStore();
    requestVote(store.dispatch, store.getState, '8');
    await Promise.resolve();
    expect(store.getState().voting.myVote).toBeNull();
    expect(store.getState().ui.toasts[0]?.title).toBe('Vote not counted');
    expect(store.getState().ui.toasts[0]?.message).toBe('That card isn’t on the table.');
  });

  it('does nothing outside the voting phase', () => {
    const store = makeStore({ voting: { phase: 'waiting' } } as never);
    requestVote(store.dispatch, store.getState, '8');
    expect(emitAckMock).not.toHaveBeenCalled();
  });
});

describe('requestSkip', () => {
  beforeEach(() => {
    emitAckMock.mockReset();
    emitAckMock.mockResolvedValue({ ok: true });
  });

  it('locks the skip optimistically and sends vote:skip exactly once', async () => {
    const store = votingStore();
    requestSkip(store.dispatch);
    expect(store.getState().voting.mySkipped).toBe(true);
    requestSkip(store.dispatch); // double-click guard
    await vi.waitFor(() => expect(emitAckMock).toHaveBeenCalledTimes(1));
    expect(emitAckMock).toHaveBeenCalledWith('vote:skip', {});
  });

  it('keeps the skip state and stays quiet when the server reports already_voted', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'already_voted' });
    const store = votingStore();
    await requestSkip(store.dispatch);
    expect(store.getState().voting.mySkipped).toBe(true);
    expect(store.getState().ui.toasts).toHaveLength(0);
  });

  it('rolls back the skip and warns on a genuine rejection', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'not_host' });
    const store = votingStore();
    await requestSkip(store.dispatch);
    expect(store.getState().voting.mySkipped).toBe(false);
    expect(store.getState().ui.toasts[0]?.title).toBe('Could not skip');
  });
});

describe('requestReveal / requestStart', () => {
  beforeEach(() => {
    emitAckMock.mockReset();
    emitAckMock.mockResolvedValue({ ok: true });
  });

  it('reveal fires exactly once for rapid repeated calls', async () => {
    const store = makeStore();
    requestReveal(store.dispatch);
    requestReveal(store.dispatch);
    requestReveal(store.dispatch);
    await vi.waitFor(() => expect(emitAckMock).toHaveBeenCalledTimes(1));
    expect(emitAckMock).toHaveBeenCalledWith('votes:reveal', {});
  });

  it('start fires exactly once for rapid repeated calls', async () => {
    const store = makeStore();
    requestStart(store.dispatch);
    requestStart(store.dispatch);
    await vi.waitFor(() => expect(emitAckMock).toHaveBeenCalledTimes(1));
    expect(emitAckMock).toHaveBeenCalledWith('voting:start', {});
  });

  it('rides the story details along with voting:start (trimmed)', async () => {
    const store = makeStore();
    await requestStart(store.dispatch, { id: 'PROJ-143', title: ' User Profile ', description: 'As a user…' });
    expect(emitAckMock).toHaveBeenCalledWith('voting:start', {
      story: { id: 'PROJ-143', title: 'User Profile', description: 'As a user…' },
    });
  });

  it('omits the story from the payload when the form is empty', async () => {
    const store = makeStore();
    await requestStart(store.dispatch, { id: '   ', title: '', description: '' });
    expect(emitAckMock).toHaveBeenCalledWith('voting:start', {});
  });

  it('reveal surfaces a friendly message on rejection', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'not_all_voted' });
    const store = makeStore();
    const ok = await requestReveal(store.dispatch);
    expect(ok).toBe(false);
    expect(store.getState().ui.toasts[0]?.message).toContain('everyone has voted');
  });
});

describe('requestNewRound', () => {
  beforeEach(() => {
    emitAckMock.mockReset();
    emitAckMock.mockResolvedValue({ ok: true });
  });

  const revealedStore = () => makeStore({ voting: { phase: 'revealed' } } as never);

  it('emits room:newRound once from a REVEALED room', async () => {
    const store = revealedStore();
    const result = await requestNewRound(store.dispatch, store.getState);
    expect(result).toBe('ok');
    expect(emitAckMock).toHaveBeenCalledWith('room:newRound', {});
  });

  it('guards a second rapid call (double-click) and reports guarded, not an error', async () => {
    const store = revealedStore();
    const first = requestNewRound(store.dispatch, store.getState);
    const second = await requestNewRound(store.dispatch, store.getState);
    expect(second).toBe('guarded');
    await first;
    expect(emitAckMock).toHaveBeenCalledTimes(1);
    expect(store.getState().ui.toasts).toHaveLength(0); // no false error toast
  });

  it('does nothing while the room is VOTING (guarded)', async () => {
    const store = makeStore({ voting: { phase: 'voting' } } as never);
    const result = await requestNewRound(store.dispatch, store.getState);
    expect(result).toBe('guarded');
    expect(emitAckMock).not.toHaveBeenCalled();
  });

  it('reports rejected with a toast on a server rejection', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'not_host' });
    const store = revealedStore();
    const result = await requestNewRound(store.dispatch, store.getState);
    expect(result).toBe('rejected');
    expect(store.getState().ui.toasts[0]?.title).toBe('Could not start a new round');
  });
});
