import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StartPanel from '@/components/room/StartPanel';
import { renderWithStore } from '../helpers/store';

const { emitAckMock } = vi.hoisted(() => ({ emitAckMock: vi.fn() }));
vi.mock('@/lib/socket', () => ({ emitAck: emitAckMock }));

beforeEach(() => {
  emitAckMock.mockReset();
  emitAckMock.mockResolvedValue({ ok: true });
});

function preload(over: { host?: boolean; timerSec?: number | null } = {}) {
  const { host = true, timerSec = null } = over;
  const myId = host ? 'p1' : 'p2';
  return {
    room: { hostId: 'p1', settings: { deckId: 'fibonacci', timerSec } },
    participants: { list: [{ id: 'p1', name: 'Ada', role: 'facilitator', status: 'connected', hasVoted: false, joinedAt: 0, hue: 10 }] },
    ui: { myParticipantId: myId },
  } as never;
}

describe('StartPanel', () => {
  it('shows the invite copy and room controls to the host', () => {
    renderWithStore(<StartPanel />, { preloaded: preload() });
    expect(screen.getByText('Invite your team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Invite Link/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Voting' })).toBeInTheDocument();
    for (const label of ['Off', '10s', '15s', '30s']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the current timer preset as selected', () => {
    renderWithStore(<StartPanel />, { preloaded: preload({ timerSec: 15 }) });
    expect(screen.getByRole('button', { name: '15s' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('persists a timer pick through room:settings', async () => {
    const user = userEvent.setup();
    renderWithStore(<StartPanel />, { preloaded: preload() });
    await user.click(screen.getByRole('button', { name: '10s' }));
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('room:settings', { timerSec: 10 }));
  });

  it('starts voting through voting:start', async () => {
    const user = userEvent.setup();
    renderWithStore(<StartPanel />, { preloaded: preload() });
    await user.click(screen.getByRole('button', { name: 'Start Voting' }));
    await waitFor(() => expect(emitAckMock).toHaveBeenCalledWith('voting:start', {}));
  });

  it('never shows host controls to a participant', () => {
    renderWithStore(<StartPanel />, { preloaded: preload({ host: false }) });
    expect(screen.getByText('Waiting for the host…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Voting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy Invite Link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10s' })).not.toBeInTheDocument();
  });
});
