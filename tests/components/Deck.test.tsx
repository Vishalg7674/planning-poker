import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Deck from '@/components/room/Deck';
import { renderWithStore } from '../helpers/store';
import type { PartialDeep } from '../helpers/types';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

const DECK = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?'];

function preload(over: PartialDeep<Record<string, unknown>> = {}) {
  return {
    room: { hostId: 'p1', settings: { deckId: 'fibonacci', timerSec: null } },
    voting: { phase: 'waiting', deckValues: DECK, votedIds: [], everyoneHasVoted: false, votes: {}, stats: null, myVote: null, ...(over.voting as object) },
    ui: { myParticipantId: 'p2', ...(over.ui as object) },
  } as never;
}

beforeEach(() => {
  emitAckMock.mockReset();
  emitAckMock.mockResolvedValue({ ok: true });
});

describe('Deck', () => {
  it('renders every card of the deck', () => {
    renderWithStore(<Deck />, { preloaded: preload() });
    for (const value of DECK) {
      expect(screen.getByRole('button', { name: `Vote ${value}` })).toBeInTheDocument();
    }
  });

  it('keeps cards disabled in the waiting room (non-host)', () => {
    renderWithStore(<Deck />, { preloaded: preload() });
    expect(screen.getAllByRole('button')[0]).toBeDisabled();
    expect(screen.getByText('Cards unlock when the host starts voting.')).toBeInTheDocument();
  });

  it('tells the host the cards unlock when they start the round', () => {
    renderWithStore(<Deck />, {
      preloaded: preload({ ui: { myParticipantId: 'p1' } }),
    });
    expect(screen.getByText('Cards unlock for everyone when you start the round.')).toBeInTheDocument();
  });

  it('enables cards while voting and locks my vote permanently on pick', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<Deck />, {
      preloaded: preload({ voting: { phase: 'voting' } }),
    });

    const eight = screen.getByRole('button', { name: 'Vote 8' });
    expect(eight).toBeEnabled();

    await user.click(eight);

    await waitFor(() => expect(store.getState().voting.myVote).toBe('8'));
    expect(emitAckMock).toHaveBeenCalledWith('vote:cast', { value: '8' });
    expect(eight).toHaveAttribute('aria-pressed', 'true');

    // Every other card is now disabled — no take-backs.
    for (const value of DECK.filter((v) => v !== '8')) {
      expect(screen.getByRole('button', { name: `Vote ${value}` })).toBeDisabled();
    }
    expect(screen.getByText(/Vote locked/)).toBeInTheDocument();
  });

  it('a rejected vote rolls back the optimistic lock and warns', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'already_voted' });
    const user = userEvent.setup();
    const { store } = renderWithStore(<Deck />, {
      preloaded: preload({ voting: { phase: 'voting' } }),
    });

    await user.click(screen.getByRole('button', { name: 'Vote 8' }));

    await waitFor(() => expect(store.getState().voting.myVote).toBeNull());
    expect(store.getState().ui.toasts[0]?.title).toBe('Vote not counted');
  });

  it('does not cast when the round has ended', async () => {
    const user = userEvent.setup();
    renderWithStore(<Deck />, { preloaded: preload({ voting: { phase: 'ended' } }) });
    expect(screen.getByText(/Voting ended/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vote 8' }));
    expect(emitAckMock).not.toHaveBeenCalled();
  });
});
