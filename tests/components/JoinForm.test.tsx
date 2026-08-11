import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JoinForm from '@/components/room/JoinForm';
import { renderWithStore } from '../helpers/store';
import { makeParticipant, makeSnapshot } from '../helpers/fixtures';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

beforeEach(() => {
  emitAckMock.mockReset();
  window.sessionStorage.clear();
});

function joinAck(over: object = {}) {
  return {
    ok: true,
    participantId: 'g1',
    snapshot: makeSnapshot({
      code: 'ABCDE',
      participants: [makeParticipant({ id: 'g1', name: 'Grace' })],
    }),
    ...over,
  };
}

describe('JoinForm', () => {
  it('renders the room code and the join prompt', () => {
    renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join the room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeInTheDocument();
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});
    await user.click(screen.getByRole('button', { name: 'Join Room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/);
    expect(emitAckMock).not.toHaveBeenCalled();
  });

  it('joins the room with the typed name and hydrates my identity', async () => {
    emitAckMock.mockResolvedValue(joinAck());
    const user = userEvent.setup();
    const { store } = renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});

    await user.type(screen.getByLabelText('Enter your name'), 'Grace');
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('room:join', { code: 'ABCDE', name: 'Grace' }));
    await waitFor(() => expect(store.getState().ui.joined).toBe(true));
    expect(store.getState().ui.myName).toBe('Grace');
    expect(store.getState().ui.toasts[0]?.title).toBe('Welcome, Grace');
    // identity persisted for the rejoin path
    expect(window.sessionStorage.getItem('reveal:identity')).toContain('"participantId":"g1"');
  });

  it('surfaces a not-found room through onGone', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const onGone = vi.fn();
    const user = userEvent.setup();
    renderWithStore(<JoinForm code="ABCDE" onGone={onGone} />, {});

    await user.type(screen.getByLabelText('Enter your name'), 'Grace');
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    await waitFor(() => expect(onGone).toHaveBeenCalledWith(expect.stringContaining('ABCDE')));
  });

  it('shows a server error inline when the join fails', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'full' });
    const user = userEvent.setup();
    renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});

    await user.type(screen.getByLabelText('Enter your name'), 'Grace');
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('full');
  });

  it('tells the user the room is locked when the host locked it', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'room_locked' });
    const user = userEvent.setup();
    renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});

    await user.type(screen.getByLabelText('Enter your name'), 'Grace');
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This room is locked. Ask the host for access.');
  });

  it('tells the user the name is already taken by someone in the room', async () => {
    emitAckMock.mockResolvedValue({ ok: false, error: 'name_taken' });
    const user = userEvent.setup();
    renderWithStore(<JoinForm code="ABCDE" onGone={() => {}} />, {});

    await user.type(screen.getByLabelText('Enter your name'), 'Grace');
    await user.click(screen.getByRole('button', { name: 'Join Room' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This name is already taken. Please choose another name.');
  });
});
