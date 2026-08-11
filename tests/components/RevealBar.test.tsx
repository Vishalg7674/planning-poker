import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RevealBar from '@/components/room/RevealBar';
import { renderWithStore } from '../helpers/store';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

beforeEach(() => {
  emitAckMock.mockReset();
  emitAckMock.mockResolvedValue({ ok: true });
});

function preload(over: { host?: boolean; voted?: number; total?: number; everyone?: boolean } = {}) {
  const { host = true, voted = 1, total = 2, everyone = false } = over;
  return {
    room: { hostId: 'p1' },
    voting: {
      phase: 'voting',
      votedIds: Array.from({ length: voted }, (_, i) => `p${i}`),
      everyoneHasVoted: everyone,
    },
    participants: {
      list: Array.from({ length: total }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        role: 'voter' as const,
        status: i < voted ? 'voted' as const : 'connected' as const,
        hasVoted: i < voted,
        joinedAt: i,
        hue: i,
      })),
    },
    ui: { myParticipantId: host ? 'p1' : 'p2' },
  } as never;
}

describe('RevealBar', () => {
  it('shows the running vote count to everyone', () => {
    renderWithStore(<RevealBar />, { preloaded: preload() });
    expect(screen.getByText('1 / 2 voted')).toBeInTheDocument();
  });

  it('keeps the reveal button hidden until everyone has voted', () => {
    renderWithStore(<RevealBar />, { preloaded: preload() });
    expect(screen.queryByRole('button', { name: 'Reveal Votes' })).not.toBeInTheDocument();
    expect(screen.getByText('Reveal unlocks once everyone has voted.')).toBeInTheDocument();
  });

  it('gives the host a reveal button the moment everyone has voted', async () => {
    const user = userEvent.setup();
    renderWithStore(<RevealBar />, { preloaded: preload({ voted: 2, everyone: true }) });
    expect(screen.getByText('Everyone has voted · 2 / 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reveal Votes' }));
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('votes:reveal', {}));
  });

  it('tells participants the votes stay hidden', () => {
    renderWithStore(<RevealBar />, { preloaded: preload({ host: false, everyone: true }) });
    expect(screen.queryByRole('button', { name: 'Reveal Votes' })).not.toBeInTheDocument();
    expect(screen.getByText('Votes stay hidden until the host reveals.')).toBeInTheDocument();
  });
});
