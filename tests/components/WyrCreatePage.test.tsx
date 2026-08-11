import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WyrCreatePage from '@/app/games/would-you-rather/page';
import { renderWithStore } from '../helpers/store';
import { WYR_QUESTIONS } from '@/lib/wyrQuestions';

const { emitAckMock, pushMock } = vi.hoisted(() => ({ emitAckMock: vi.fn(), pushMock: vi.fn() }));

vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  emitAckMock.mockReset();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe('WyrCreatePage', () => {
  it('renders the create form with the question bank and count', () => {
    renderWithStore(<WyrCreatePage />, {});
    expect(screen.getByRole('heading', { name: 'Would You Rather' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByText(`12 / 20 selected`)).toBeInTheDocument();
    // The full bank is listed, with the default selection marked.
    expect(screen.getAllByRole('button', { name: /^Would you rather/ })).toHaveLength(WYR_QUESTIONS.length);
    expect(screen.getByRole('button', { name: /^Would you rather Have the ability to fly/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggling questions off updates the count', async () => {
    const user = userEvent.setup();
    renderWithStore(<WyrCreatePage />, {});
    await user.click(screen.getByRole('button', { name: /^Would you rather Have the ability to fly/ }));
    expect(screen.getByText('11 / 20 selected')).toBeInTheDocument();
  });

  it('adds a custom question and creates the room with game + questions', async () => {
    emitAckMock.mockResolvedValue({ ok: true, code: 'XYZ12', participantId: 'h1' });
    const user = userEvent.setup();
    const { store } = renderWithStore(<WyrCreatePage />, {});

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.type(screen.getByLabelText('Custom option A'), 'Only use a trackpad');
    await user.type(screen.getByLabelText('Custom option B'), 'Only use a mouse');
    await user.click(screen.getByRole('button', { name: 'Add question' }));
    expect(screen.getByText('13 / 20 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() => {
      expect(emitAckMock).toHaveBeenCalledWith(
        'room:create',
        expect.objectContaining({
          hostName: 'Ada',
          game: 'would-you-rather',
          accent: 'gold',
        }),
      );
    });
    const payload = emitAckMock.mock.calls[0][1];
    expect(payload.questions).toHaveLength(13);
    expect(payload.questions).toContainEqual({ a: 'Only use a trackpad', b: 'Only use a mouse' });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/r/XYZ12'));
    expect(store.getState().ui.myRole).toBe('facilitator');
  });

  it('blocks creation with zero questions', async () => {
    const user = userEvent.setup();
    renderWithStore(<WyrCreatePage />, {});
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 / 20 selected')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one question/i);
    expect(emitAckMock).not.toHaveBeenCalled();
  });

  it('shows a server error when creation fails', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'nope' });
    const user = userEvent.setup();
    renderWithStore(<WyrCreatePage />, {});

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nope');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
