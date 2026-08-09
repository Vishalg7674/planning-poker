import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EndedPanel from '@/components/room/EndedPanel';
import { renderWithStore } from '../helpers/store';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

beforeEach(() => {
  emitAckMock.mockReset();
  emitAckMock.mockResolvedValue({ ok: true });
});

function preload(over: { host?: boolean; voted?: number; total?: number } = {}) {
  const { host = true, voted = 2, total = 4 } = over;
  return {
    room: { hostId: 'p1' },
    voting: { phase: 'ended', votedIds: ['a', 'b'], everyoneHasVoted: false, votes: {}, stats: null, deckValues: [] },
    participants: { list: Array.from({ length: total }, (_, i) => ({ id: `p${i}`, name: `P${i}`, role: 'voter' as const, status: i < voted ? 'voted' as const : 'connected' as const, hasVoted: i < voted, joinedAt: i, hue: i })) },
    ui: { myParticipantId: host ? 'p1' : 'p9' },
  } as never;
}

describe('EndedPanel', () => {
  it('summarises the round for everyone', () => {
    renderWithStore(<EndedPanel />, { preloaded: preload() });
    expect(screen.getByText('Voting ended')).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 voted/)).toBeInTheDocument();
  });

  it('gives the host the reveal button', () => {
    renderWithStore(<EndedPanel />, { preloaded: preload() });
    expect(screen.getByRole('button', { name: 'Reveal Votes' })).toBeInTheDocument();
  });

  it('asks participants to wait for the host', () => {
    renderWithStore(<EndedPanel />, { preloaded: preload({ host: false }) });
    expect(screen.queryByRole('button', { name: 'Reveal Votes' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for the host to reveal the votes…')).toBeInTheDocument();
  });
});
