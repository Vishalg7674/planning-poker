import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MltRoom from '@/components/mlt/MltRoom';
import { renderWithStore } from '../helpers/store';
import { makeParticipant, makeSnapshot } from '../helpers/fixtures';
import { snapshotReceived } from '@/store/actions';
import type { RootState } from '@/store';
import type { UiState } from '@/store/slices/uiSlice';
import type { VotingState } from '@/store/slices/votingSlice';
import type { MltRoundResult } from '@/lib/types';

const { emitAckMock, pushMock } = vi.hoisted(() => ({ emitAckMock: vi.fn(), pushMock: vi.fn() }));

vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const PROMPT = 'Forget their laptop at home on the day of the big demo';

beforeEach(() => {
  emitAckMock.mockReset();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

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

function mltState(over: Partial<RootState> = {}): Partial<RootState> {
  return {
    room: {
      code: 'ABC12',
      hostId: 'h1',
      teamName: 'Squad',
      roomTitle: '',
      createdAt: 0,
      game: 'most-likely-to',
      settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' },
      locked: false,
    },
    ui: ui({ myParticipantId: 'h1', myName: 'Host', myRole: 'facilitator', joined: true }),
    voting: voting({ promptCount: 3 }),
    participants: { list: [makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' })] },
    ...over,
  };
}

/** Host + Grace at the table, prompt 0 live. */
function liveState(votedIds: string[] = []): Partial<RootState> {
  return mltState({
    voting: voting({ phase: 'voting', prompt: PROMPT, promptIndex: 0, promptCount: 3, votedIds }),
    participants: {
      list: [
        makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
        makeParticipant({ id: 'p9', name: 'Grace' }),
      ],
    },
  });
}

describe('MltRoom', () => {
  it('waiting (host): shows the prompt count and start control', () => {
    renderWithStore(<MltRoom />, { preloaded: mltState() });
    expect(screen.getByText('3 prompts ready · 1 person is at the table.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Invite/ })).toBeInTheDocument();
  });

  it('waiting (participant): no host controls', () => {
    const state = mltState({ ui: ui({ myParticipantId: 'p9', myName: 'Grace', myRole: 'voter', joined: true }) });
    renderWithStore(<MltRoom />, { preloaded: state });
    expect(screen.getByText('Waiting for the host…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
  });

  it('voting: renders the prompt with teammate chips (never yourself) and locks my pick', async () => {
    const user = userEvent.setup();
    emitAckMock.mockResolvedValue({ ok: true });
    const state = liveState(['p9']); // Grace already nominated
    renderWithStore(<MltRoom />, { preloaded: state });

    expect(screen.getByText(/Who is most likely to/)).toBeInTheDocument();
    // Host may nominate Grace; no chip for themselves.
    expect(screen.getByRole('button', { name: 'Nominate Grace' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Nominate Host' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nominate Grace' }));
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('vote:cast', { value: 'p9' }));
    const chip = screen.getByRole('button', { name: 'Nominate Grace' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(chip).toBeDisabled());
    expect(screen.getByText(/Nomination locked/)).toBeInTheDocument();
  });

  it('voting (host): sees the nominated counter and can reveal', () => {
    const state = liveState(['p9']);
    renderWithStore(<MltRoom />, { preloaded: state });
    expect(screen.getByText('1 / 2 nominated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal Nominations' })).toBeEnabled();
  });

  it('revealed: crowns the most-nominated teammate, shows the tally and totals', () => {
    const mltResult: MltRoundResult = {
      points: { p9: 120, h1: 20 },
      counts: { p9: 2 },
      winners: ['p9'],
      predictors: ['h1', 'p9'],
    };
    const state = mltState({
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 0,
        promptCount: 3,
        votedIds: ['h1', 'p9'],
        everyoneHasVoted: true,
        votes: { h1: 'p9', p9: 'p9' },
        mltResult,
        mltScores: { p9: 120, h1: 20 },
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
          makeParticipant({ id: 'p8', name: 'Ned' }), // didn't vote
        ],
      },
    });
    renderWithStore(<MltRoom />, { preloaded: state });

    expect(screen.getByRole('heading', { name: '👑 Grace takes the crown!' })).toBeInTheDocument();
    expect(screen.getByText('2 votes')).toBeInTheDocument();
    expect(screen.getAllByText('+120').length).toBeGreaterThan(0);
    // Session totals leaderboard with round deltas.
    expect(screen.getByText('Total scores')).toBeInTheDocument();
    expect(screen.getByText('Ned didn’t nominate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Prompt →' })).toBeInTheDocument();
  });

  it('revealed (last prompt, host): offers Finish Game instead of next', () => {
    const mltResult: MltRoundResult = { points: { p9: 100 }, counts: { p9: 1 }, winners: ['p9'], predictors: ['h1'] };
    const state = mltState({
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 2,
        promptCount: 3,
        votedIds: ['h1'],
        votes: { h1: 'p9' },
        mltResult,
        mltScores: { p9: 100 },
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
        ],
      },
    });
    renderWithStore(<MltRoom />, { preloaded: state });
    expect(screen.getByRole('button', { name: /Finish Game/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Prompt →' })).not.toBeInTheDocument();
  });

  it('revealed (participant): sees results but no host controls', () => {
    const mltResult: MltRoundResult = { points: { p9: 100 }, counts: { p9: 1 }, winners: ['p9'], predictors: ['p9'] };
    const state = mltState({
      ui: ui({ myParticipantId: 'p9', myName: 'Grace', myRole: 'voter', joined: true }),
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 0,
        promptCount: 3,
        votedIds: ['p9'],
        votes: { p9: 'p9' },
        mltResult,
        mltScores: { p9: 100 },
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
        ],
      },
    });
    renderWithStore(<MltRoom />, { preloaded: state });
    expect(screen.queryByRole('button', { name: /Next Prompt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finish Game/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });

  it('session over: opens the WinnerModal and Play Again restarts (host)', async () => {
    const user = userEvent.setup();
    emitAckMock.mockResolvedValue({ ok: true });
    const mltResult: MltRoundResult = { points: { p9: 100 }, counts: { p9: 1 }, winners: ['p9'], predictors: ['p9'] };
    const state = mltState({
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 2,
        promptCount: 3,
        votedIds: ['p9'],
        votes: { p9: 'p9' },
        mltResult,
        mltScores: { p9: 100 },
        sessionOver: true,
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
        ],
      },
    });
    renderWithStore(<MltRoom />, { preloaded: state });

    const dialog = await screen.findByRole('dialog', { name: 'Game Complete!' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /Winner: Grace with/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(emitAckMock).toHaveBeenCalledWith('mlt:playAgain', {});
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Game Complete!' })).not.toBeInTheDocument());
  });

  it('play again clears a stale optimistic pick from a finished single-prompt session', async () => {
    const user = userEvent.setup();
    emitAckMock.mockResolvedValue({ ok: true });
    // Single-prompt room: promptIndex is 0 both before finish and after Play
    // Again, so the prompt-change effect can't fire — the session-over
    // transition must wipe the previous round's pick.
    const mltResult: MltRoundResult = { points: { p9: 100 }, counts: { p9: 1 }, winners: ['p9'], predictors: ['p9'] };
    const participants = [
      makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
      makeParticipant({ id: 'p9', name: 'Grace' }),
    ];
    const state = mltState({
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 0,
        promptCount: 1,
        votedIds: ['p9'],
        votes: { p9: 'p9' },
        mltResult,
        mltScores: { p9: 100 },
        sessionOver: true,
        myVote: 'p9', // stale pick left over from the finished round
      }),
      participants: { list: participants },
    });
    const { store } = renderWithStore(<MltRoom />, { preloaded: state });

    // Host clicks Play Again → the modal closes and the server broadcasts a
    // fresh waiting room (session totals survive).
    await user.click(await screen.findByRole('button', { name: 'Play Again' }));
    store.dispatch(
      snapshotReceived(
        makeSnapshot({
          game: 'most-likely-to',
          status: 'waiting',
          prompt: null,
          promptIndex: 0,
          promptCount: 1,
          votedIds: [],
          votes: {},
          mltResult: null,
          mltScores: { p9: 100 },
          sessionOver: false,
          participants,
        }),
      ),
    );
    // Host starts the next session — the new round must start unlocked.
    store.dispatch(
      snapshotReceived(
        makeSnapshot({
          game: 'most-likely-to',
          status: 'voting',
          prompt: PROMPT,
          promptIndex: 0,
          promptCount: 1,
          votedIds: [],
          votes: {},
          mltResult: null,
          mltScores: { p9: 100 },
          sessionOver: false,
          participants,
        }),
      ),
    );

    // The wipe happens in an effect after the snapshot lands — wait for it.
    const chip = await screen.findByRole('button', { name: 'Nominate Grace' });
    await waitFor(() => expect(chip).toBeEnabled());
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Nomination locked/)).not.toBeInTheDocument();
  });

  it('session over (participant): Play Again just closes the modal', async () => {
    const user = userEvent.setup();
    const mltResult: MltRoundResult = { points: { p9: 100 }, counts: { p9: 1 }, winners: ['p9'], predictors: ['p9'] };
    const state = mltState({
      ui: ui({ myParticipantId: 'p9', myName: 'Grace', myRole: 'voter', joined: true }),
      voting: voting({
        phase: 'revealed',
        prompt: PROMPT,
        promptIndex: 2,
        promptCount: 3,
        votedIds: ['p9'],
        votes: { p9: 'p9' },
        mltResult,
        mltScores: { p9: 100 },
        sessionOver: true,
      }),
      participants: {
        list: [
          makeParticipant({ id: 'h1', name: 'Host', role: 'facilitator' }),
          makeParticipant({ id: 'p9', name: 'Grace' }),
        ],
      },
    });
    renderWithStore(<MltRoom />, { preloaded: state });

    await user.click(await screen.findByRole('button', { name: 'Play Again' }));
    expect(emitAckMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Game Complete!' })).not.toBeInTheDocument());
  });
});
