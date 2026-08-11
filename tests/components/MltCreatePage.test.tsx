import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MltCreatePage from '@/app/games/most-likely-to/page';
import { renderWithStore } from '../helpers/store';
import { DEFAULT_MLT_SELECTION, MLT_PROMPTS } from '@/lib/mltPrompts';

const { emitAckMock, pushMock } = vi.hoisted(() => ({ emitAckMock: vi.fn(), pushMock: vi.fn() }));

vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  emitAckMock.mockReset();
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe('MltCreatePage', () => {
  it('renders the create form with the prompt bank and count', () => {
    renderWithStore(<MltCreatePage />, {});
    expect(screen.getByRole('heading', { name: 'Most Likely To' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByText(`${DEFAULT_MLT_SELECTION.length} / 12 selected`)).toBeInTheDocument();
    // The full bank is listed, with the default selection marked.
    expect(screen.getAllByRole('button', { name: MLT_PROMPTS[0] })).toHaveLength(1);
    expect(screen.getByRole('button', { name: MLT_PROMPTS[0] })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button').length).toBeGreaterThan(MLT_PROMPTS.length);
  });

  it('toggling prompts off updates the count', async () => {
    const user = userEvent.setup();
    renderWithStore(<MltCreatePage />, {});
    await user.click(screen.getByRole('button', { name: MLT_PROMPTS[0] }));
    expect(screen.getByText(`${DEFAULT_MLT_SELECTION.length - 1} / 12 selected`)).toBeInTheDocument();
  });

  it('adds a custom prompt and creates the room with game + prompts', async () => {
    emitAckMock.mockResolvedValue({ ok: true, code: 'XYZ12', participantId: 'h1' });
    const user = userEvent.setup();
    const { store } = renderWithStore(<MltCreatePage />, {});

    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.type(screen.getByLabelText('Custom prompt'), 'Send a message to the wrong Slack channel');
    await user.click(screen.getByRole('button', { name: 'Add prompt' }));
    expect(screen.getByText(`${DEFAULT_MLT_SELECTION.length + 1} / 12 selected`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Room' }));
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledTimes(1));
    const [event, payload] = emitAckMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('room:create');
    expect(payload.game).toBe('most-likely-to');
    expect(payload.hostName).toBe('Ada');
    expect(payload.prompts).toEqual([...DEFAULT_MLT_SELECTION, 'Send a message to the wrong Slack channel']);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/r/XYZ12'));
    expect(store.getState().ui.myParticipantId).toBe('h1');
  });

  it('blocks creation with no prompts selected', async () => {
    const user = userEvent.setup();
    renderWithStore(<MltCreatePage />, {});
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.type(screen.getByLabelText('Your Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick at least one prompt');
    expect(emitAckMock).not.toHaveBeenCalled();
  });
});
