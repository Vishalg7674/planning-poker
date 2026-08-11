import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestReveal, requestStart, requestVote } from '@/lib/roomActions';
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

  it('reveal surfaces a friendly message on rejection', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'not_all_voted' });
    const store = makeStore();
    const ok = await requestReveal(store.dispatch);
    expect(ok).toBe(false);
    expect(store.getState().ui.toasts[0]?.message).toContain('everyone has voted');
  });
});
