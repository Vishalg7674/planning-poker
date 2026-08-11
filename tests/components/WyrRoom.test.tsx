import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WyrRoom from '@/components/wyr/WyrRoom';
import { renderWithStore } from '../helpers/store';
import { makeParticipant } from '../helpers/fixtures';
import type { RootState } from '@/store';
import type { UiState } from '@/store/slices/uiSlice';
import type { VotingState } from '@/store/slices/votingSlice';
import type { Stats } from '@/lib/types';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

const QUESTION = { a: 'Have the ability to fly', b: 'Have the ability to be invisible' };

beforeEach(() => {
  emitAckMock.mockReset();
  window.sessionStorage.clear();
});

/** A full UiState with the given fields overridden (makeStore merges per slice). */
function ui(over: Partial<UiState> = {}): UiState {
  return {
    theme: 'system',
    connection: 'connected',
    myParticipantId: null,
    myName: '',
    myRole: 'voter',
    joined: false,
    roomGoneMessage: null,
    modals: { endSession: false, removeParticipant: false },
    toasts: [],
    celebrationTick: 0,
    presentation: false,
    ...over,
  };
}

/** A full VotingState with the given fields overridden. */
function voting(over: Partial<VotingState> = {}): VotingState {
  return {
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
    ...over,
  };
}

function wyrState(over: Partial<RootState> = {}): Partial<RootState> {
  return {
    room: {
      code: 'ABC12',
      hostId: 'h1',
      teamName: 'Squad',
      roomTitle: '',
      createdAt: 0,
      game: 'would-you-rather',
      settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' },
      locked: false,
    },
    ui: ui({ myParticipantId: 'h1', myName: 'Host', myRole: 'facilitator', joined: true }),
    voting: voting({ questionCount: 3 }),
    participants: { list: [makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' })] },
    ...over,
  };
}

describe('WyrRoom', () => {
  it('waiting (host): shows the question count and start control', () => {
    renderWithStore(<WyrRoom />, { preloaded: wyrState() });
    expect(screen.getByText('3 questions ready · 1 person is at the table.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Invite/ })).toBeInTheDocument();
  });

  it('waiting (participant): no host controls', () => {
    const state = wyrState({ ui: ui({ myParticipantId: 'p9', myName: 'Grace', myRole: 'voter', joined: true }) });
    renderWithStore(<WyrRoom />, { preloaded: state });
    expect(screen.getByText('Waiting for the host…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
  });

  it('voting: renders the question as two A/B cards and locks my pick', async () => {
    const user = userEvent.setup();
    emitAckMock.mockResolvedValue({ ok: true });
    const state = wyrState({
      voting: voting({ phase: 'voting', deckValues: [], votedIds: [], everyoneHasVoted: false, votes: {}, stats: null, myVote: null, question: QUESTION, questionIndex: 0, questionCount: 3 }),
    });
    renderWithStore(<WyrRoom />, { preloaded: state });

    const cardA = screen.getByRole('button', { name: 'Vote A: Have the ability to fly' });
    const cardB = screen.getByRole('button', { name: 'Vote B: Have the ability to be invisible' });
    expect(cardA).toBeEnabled();
    expect(cardB).toBeEnabled();

    await user.click(cardA);
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('vote:cast', { value: 'A' }));
    // Optimistic lock: A is pressed, B is disabled, lock message shows.
    expect(cardA).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vote B: Have the ability to be invisible' })).toBeDisabled());
    expect(screen.getByText(/Vote locked/)).toBeInTheDocument();
  });

  it('voting (host): sees the picked counter and can reveal before everyone votes', () => {
    const state = wyrState({
      ui: ui({ myParticipantId: 'h1', myName: 'Host', myRole: 'facilitator', joined: true }),
      voting: voting({ phase: 'voting', deckValues: [], votedIds: ['p9'], everyoneHasVoted: false, votes: {}, stats: null, myVote: null, question: QUESTION, questionIndex: 0, questionCount: 3 }),
      participants: {
        list: [makeParticipant({ id: 'h1', name: 'Host' }), makeParticipant({ id: 'p9', name: 'Grace' })],
      },
    });
    renderWithStore(<WyrRoom />, { preloaded: state });
    expect(screen.getByText('1 / 2 picked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal Picks' })).toBeEnabled();
  });

  it('revealed: shows the split, non-voters, and the host next-question control', () => {
    const stats: Stats = {
      count: 2,
      mode: 'A',
      modeShare: 0.667,
      unique: 2,
      numeric: false,
      avg: null,
      median: null,
      spread: null,
      highest: null,
      lowest: null,
      range: null,
      level: 'moderate',
      counts: [
        { value: 'A', count: 2 },
        { value: 'B', count: 0 },
      ],
    };
    const state = wyrState({
      voting: voting({
        phase: 'revealed',
        deckValues: [],
        votedIds: ['h1', 'p9'],
        everyoneHasVoted: true,
        votes: { h1: 'A', p9: 'A' },
        stats,
        myVote: null,
        question: QUESTION,
        questionIndex: 0,
        questionCount: 3,
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
          makeParticipant({ id: 'p8', name: 'Noel' }),
        ],
      },
    });
    renderWithStore(<WyrRoom />, { preloaded: state });
    expect(screen.getByText('2 picks · 100%')).toBeInTheDocument();
    expect(screen.getByText('Noel didn’t pick')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next Question/ })).toBeInTheDocument();
  });

  it('revealed (last question, host): offers End Session instead of next', () => {
    const stats: Stats = {
      count: 1,
      mode: 'B',
      modeShare: 1,
      unique: 1,
      numeric: false,
      avg: null,
      median: null,
      spread: null,
      highest: null,
      lowest: null,
      range: null,
      level: 'full',
      counts: [{ value: 'B', count: 1 }],
    };
    const state = wyrState({
      voting: voting({
        phase: 'revealed',
        deckValues: [],
        votedIds: ['h1'],
        everyoneHasVoted: true,
        votes: { h1: 'B' },
        stats,
        myVote: null,
        question: QUESTION,
        questionIndex: 2,
        questionCount: 3,
      }),
    });
    renderWithStore(<WyrRoom />, { preloaded: state });
    expect(screen.getByText('🎉 Full agreement!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End Session' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next Question/ })).not.toBeInTheDocument();
  });

  it('revealed (participant): sees the split but no host controls', () => {
    const stats: Stats = {
      count: 1,
      mode: 'A',
      modeShare: 1,
      unique: 1,
      numeric: false,
      avg: null,
      median: null,
      spread: null,
      highest: null,
      lowest: null,
      range: null,
      level: 'full',
      counts: [{ value: 'A', count: 1 }],
    };
    const state = wyrState({
      ui: ui({ myParticipantId: 'p9', myName: 'Grace', myRole: 'voter', joined: true }),
      voting: voting({
        phase: 'revealed',
        deckValues: [],
        votedIds: ['p9'],
        everyoneHasVoted: true,
        votes: { p9: 'A' },
        stats,
        myVote: null,
        question: QUESTION,
        questionIndex: 0,
        questionCount: 3,
      }),
    });
    renderWithStore(<WyrRoom />, { preloaded: state });
    expect(screen.queryByRole('button', { name: /Next Question/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End Session' })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });
});
