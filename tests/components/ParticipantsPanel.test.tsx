import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ParticipantsPanel from '@/components/room/ParticipantsPanel';
import { renderWithStore } from '../helpers/store';
import { makeParticipant } from '../helpers/fixtures';

function preload(over: { phase?: 'waiting' | 'voting' | 'ended' | 'revealed'; votes?: Record<string, string>; hostId?: string; me?: string } = {}) {
  const { phase = 'voting', votes = {}, hostId = 'p1', me = 'p1' } = over;
  const grace = makeParticipant({ id: 'p2', name: 'Grace', status: votes.p2 ? 'voted' : 'connected', hasVoted: !!votes.p2, joinedAt: 1000, hue: 40 });
  const host = makeParticipant({ id: 'p1', name: 'Ada', role: 'facilitator', status: votes.p1 ? 'voted' : 'connected', hasVoted: !!votes.p1, joinedAt: 0, hue: 10 });
  return {
    room: { hostId },
    voting: { phase, votes, votedIds: Object.keys(votes), everyoneHasVoted: false, deckValues: [], stats: null },
    participants: { list: [host, grace] },
    ui: { myParticipantId: me },
  } as never;
}

describe('ParticipantsPanel', () => {
  it('labels the host and shows Joined in the waiting room', () => {
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, { preloaded: preload({ phase: 'waiting' }) });
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.getAllByText('Joined')).toHaveLength(2);
    expect(screen.queryByText('Voted')).not.toBeInTheDocument();
    expect(screen.queryByText('Thinking')).not.toBeInTheDocument();
  });

  it('shows Voted / Thinking while voting — never the values', () => {
    const votes = { p1: '5' };
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, { preloaded: preload({ phase: 'voting', votes }) });
    expect(screen.getAllByText('Voted')).toHaveLength(1);
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    // Privacy: the actual estimate must not appear anywhere pre-reveal.
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.getByText('Votes stay hidden until the host reveals the round.')).toBeInTheDocument();
  });

  it('marks a disconnected participant clearly', () => {
    const disconnected = makeParticipant({ id: 'p3', name: 'Neha', status: 'disconnected', hasVoted: false, joinedAt: 2000, hue: 70 });
    const grace = makeParticipant({ id: 'p2', name: 'Grace', status: 'connected', hasVoted: false, joinedAt: 1000, hue: 40 });
    const host = makeParticipant({ id: 'p1', name: 'Ada', role: 'facilitator', status: 'connected', hasVoted: false, joinedAt: 0, hue: 10 });
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, {
      preloaded: {
        room: { hostId: 'p1' },
        voting: { phase: 'voting', votes: {}, votedIds: [], everyoneHasVoted: false, deckValues: [], stats: null },
        participants: { list: [host, grace, disconnected] },
        ui: { myParticipantId: 'p1' },
      } as never,
    });
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
  });

  it('reveals values and marks non-voters after the reveal', () => {
    const votes = { p1: '5', p2: '8' };
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, { preloaded: preload({ phase: 'revealed', votes }) });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('marks a non-voter clearly after the reveal', () => {
    const votes = { p1: '5' };
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, { preloaded: preload({ phase: 'revealed', votes }) });
    expect(screen.getByText(/Didn.t vote/)).toBeInTheDocument();
  });

  it('lets the host remove other participants', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    renderWithStore(<ParticipantsPanel onRemove={onRemove} />, { preloaded: preload({ phase: 'waiting' }) });
    const graceRow = screen.getByText('Grace').closest('li');
    await user.click(graceRow!.querySelector('button[title="Remove from table"]')!);
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  it('does not show the remove control to non-hosts', () => {
    renderWithStore(<ParticipantsPanel onRemove={() => {}} />, {
      preloaded: preload({ phase: 'waiting', me: 'p2' }),
    });
    expect(screen.queryByTitle('Remove from table')).not.toBeInTheDocument();
  });
});
