import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PresentationView from '@/components/room/PresentationView';
import { renderWithStore } from '../helpers/store';
import { makeParticipant } from '../helpers/fixtures';
import type { Stats } from '@/lib/types';

function preload(over: { phase?: 'waiting' | 'voting' | 'ended' | 'revealed'; votes?: Record<string, string>; stats?: Stats | null; timer?: { durationSec: number; endsAt: number } | null; me?: string } = {}) {
  const { phase = 'voting', votes = {}, stats = null, timer = null, me = 'p1' } = over;
  const host = makeParticipant({ id: 'p1', name: 'Ada', role: 'facilitator', status: votes.p1 ? 'voted' : 'connected', hasVoted: !!votes.p1, joinedAt: 0, hue: 10 });
  const grace = makeParticipant({ id: 'p2', name: 'Grace', status: votes.p2 ? 'voted' : 'connected', hasVoted: !!votes.p2, joinedAt: 1000, hue: 40 });
  return {
    room: { hostId: 'p1', code: 'ABCDE', teamName: 'Squad', roomTitle: '', settings: { deckId: 'fibonacci', timerSec: null, accent: 'gold', revealMode: 'staggered' } },
    voting: { phase, votes, votedIds: Object.keys(votes), everyoneHasVoted: false, deckValues: ['1', '2', '3', '5', '8', '13', '21'], stats },
    participants: { list: [host, grace] },
    timer: { timer, remaining: 12, timesUp: false },
    ui: { myParticipantId: me },
  } as never;
}

describe('PresentationView', () => {
  it('shows the big-screen waiting state to participants', () => {
    renderWithStore(<PresentationView />, { preloaded: preload({ phase: 'waiting', me: 'p2' }) });
    expect(screen.getByText(/Waiting for the host to start/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit Presentation' })).toBeInTheDocument();
    expect(screen.getByText('Room ABCDE')).toBeInTheDocument();
  });

  it('shows the live voted counter and avatar statuses while voting', () => {
    const votes = { p1: '5' };
    renderWithStore(<PresentationView />, { preloaded: preload({ phase: 'voting', votes }) });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Voted/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
    // privacy: the deck shows candidate cards, but no revealed-vote panel exists pre-reveal
    expect(screen.queryByLabelText('Revealed votes')).not.toBeInTheDocument();
  });

  it('hides the countdown when the timer is off', () => {
    renderWithStore(<PresentationView />, { preloaded: preload({ phase: 'voting' }) });
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('shows the countdown when the timer is on', () => {
    const timer = { durationSec: 10, endsAt: Date.now() + 10_000 };
    renderWithStore(<PresentationView />, { preloaded: preload({ phase: 'voting', timer }) });
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('renders big results with median and consensus after the reveal', () => {
    const votes = { p1: '8', p2: '5' };
    const stats: Stats = {
      count: 2,
      mode: '8',
      modeShare: 0.5,
      unique: 2,
      numeric: true,
      avg: 6.5,
      median: 6.5,
      spread: 3,
      highest: 8,
      lowest: 5,
      range: 3,
      level: 'moderate',
      counts: [
        { value: '8', count: 1 },
        { value: '5', count: 1 },
      ],
    };
    renderWithStore(<PresentationView />, { preloaded: preload({ phase: 'revealed', votes, stats }) });
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(screen.getByText(/Moderate Disagreement/)).toBeInTheDocument();
  });
});
