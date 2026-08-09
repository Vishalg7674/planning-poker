import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePage from '@/app/create/page';
import { renderWithStore } from '../helpers/store';

const { emitAckMock, pushMock } = vi.hoisted(() => ({ emitAckMock: vi.fn(), pushMock: vi.fn() }));

vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  emitAckMock.mockReset();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe('CreatePage', () => {
  it('renders the create form with all customization fields', () => {
    renderWithStore(<CreatePage />, {});
    expect(screen.getByRole('heading', { name: 'Create Room' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Team Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Room Title')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Voting deck' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Accent color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Room' })).toBeInTheDocument();
  });

  it('lists all five decks', () => {
    renderWithStore(<CreatePage />, {});
    expect(screen.getByRole('radio', { name: /^Fibonacci/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Modified Fibonacci/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Sequential/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^T-Shirt/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Powers of 2/ })).toBeInTheDocument();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderWithStore(<CreatePage />, {});
    await user.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/);
    expect(emitAckMock).not.toHaveBeenCalled();
  });

  it('creates a room with customization, stores identity and navigates', async () => {
    emitAckMock.mockResolvedValue({ ok: true, code: 'XYZ12', participantId: 'h1' });
    const user = userEvent.setup();
    const { store } = renderWithStore(<CreatePage />, {});

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.type(screen.getByLabelText('Team Name'), 'Squad');
    await user.type(screen.getByLabelText('Room Title'), 'Sprint 24');
    await user.click(screen.getByRole('radio', { name: /T-Shirt/ }));
    await user.click(screen.getByRole('radio', { name: /Purple/ }));
    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() =>
      expect(emitAckMock).toHaveBeenCalledWith('room:create', {
        hostName: 'Ada',
        teamName: 'Squad',
        roomTitle: 'Sprint 24',
        deckId: 'tshirt',
        accent: 'purple',
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/r/XYZ12'));
    expect(store.getState().ui.myRole).toBe('facilitator');
    expect(window.sessionStorage.getItem('reveal:identity')).toContain('"role":"facilitator"');
  });

  it('shows a server error when creation fails', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'nope' });
    const user = userEvent.setup();
    renderWithStore(<CreatePage />, {});

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Create Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nope');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
