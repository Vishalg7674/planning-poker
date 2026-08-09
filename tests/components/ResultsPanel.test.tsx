import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ResultsPanel from '@/components/room/ResultsPanel';
import { renderWithStore } from '../helpers/store';
import { makeParticipant } from '../helpers/fixtures';
import type { Stats } from '@/lib/types';

const stats: Stats = {
  count: 3,
  mode: '8',
  modeShare: 0.6667,
  unique: 2,
  avg: 7,
  median: 8,
  spread: 3,
  level: 'some',
  counts: [
    { value: '8', count: 2 },
    { value: '5', count: 1 },
  ],
};

function preload(over: { stats?: Stats | null; votes?: Record<string, string> } = {}) {
  const { stats: s = stats, votes = { a: '5', b: '8', c: '8' } } = over;
  const participants = ['a', 'b', 'c', 'd'].map((id, i) =>
    makeParticipant({ id, name: `P${i}`, status: votes[id] ? 'voted' : 'connected', hasVoted: !!votes[id], joinedAt: i, hue: i * 10 }),
  );
  return {
    room: { hostId: 'a' },
    voting: { phase: 'revealed', votes, stats: s, deckValues: [], votedIds: Object.keys(votes), everyoneHasVoted: true },
    participants: { list: participants },
    ui: { myParticipantId: 'a' },
  } as never;
}

describe('ResultsPanel', () => {
  it('shows the headline statistics', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    const stat = (label: string) => screen.getByText(label).closest('div')!;
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(stat('Average')).toHaveTextContent('7');
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(stat('Median')).toHaveTextContent('8');
    expect(screen.getByText('Most selected')).toBeInTheDocument();
    expect(stat('Most selected')).toHaveTextContent('8');
    expect(screen.getByText('Votes')).toBeInTheDocument();
    expect(stat('Votes')).toHaveTextContent('3 / 4');
  });

  it('renders the vote distribution with counts', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    expect(screen.getByText('Vote distribution')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows every vote and flags non-voters', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    const cards = within(screen.getByLabelText('Revealed votes'));
    expect(cards.getAllByText('8')).toHaveLength(2);
    expect(cards.getByText('5')).toBeInTheDocument();
    expect(cards.getByText(/Didn.t vote/)).toBeInTheDocument();
  });

  it('handles a reveal with zero votes gracefully', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload({ stats: null, votes: {} }) });
    expect(screen.getByText('Nobody voted this round')).toBeInTheDocument();
    expect(screen.queryByText('Average')).not.toBeInTheDocument();
  });

  it('fires the celebration once on full consensus', () => {
    const { store } = renderWithStore(<ResultsPanel />, {
      preloaded: preload({ stats: { ...stats, level: 'full', unique: 1, counts: [{ value: '8', count: 3 }] } }),
    });
    expect(store.getState().ui.celebrationTick).toBe(1);
  });
});
