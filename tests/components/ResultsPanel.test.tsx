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
  numeric: true,
  avg: 7,
  median: 8,
  spread: 3,
  highest: 8,
  lowest: 5,
  range: 3,
  level: 'moderate',
  counts: [
    { value: '8', count: 2 },
    { value: '5', count: 1 },
  ],
};

function preload(over: { stats?: Stats | null; votes?: Record<string, string>; revealMode?: string; deckId?: string; myId?: string; story?: { id: string; title: string; description: string } | null } = {}) {
  const {
    stats: s = stats,
    votes = { a: '5', b: '8', c: '8' },
    revealMode = 'staggered',
    deckId = 'fibonacci',
    myId = 'a',
    story = { id: 'PROJ-1', title: 'Password Reset', description: '' },
  } = over;
  const participants = ['a', 'b', 'c', 'd'].map((id, i) =>
    makeParticipant({ id, name: `P${i}`, status: votes[id] ? 'voted' : 'connected', hasVoted: !!votes[id], joinedAt: i, hue: i * 10 }),
  );
  return {
    room: { hostId: 'a', settings: { deckId, timerSec: null, accent: 'gold', revealMode } },
    voting: { phase: 'revealed', roundId: 1, story, votes, stats: s, deckValues: [], votedIds: Object.keys(votes), everyoneHasVoted: true },
    participants: { list: participants },
    ui: { myParticipantId: myId },
  } as never;
}

describe('ResultsPanel', () => {
  it('shows the consensus headline and smart statistics', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    expect(screen.getByText('Moderate Disagreement')).toBeInTheDocument();
    const stat = (label: string) => screen.getAllByText(label)[0]!.closest('div')!;
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(stat('Average')).toHaveTextContent('7');
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(stat('Median')).toHaveTextContent('8');
    expect(screen.getByText('Most selected')).toBeInTheDocument();
    expect(stat('Most selected')).toHaveTextContent('8');
    expect(screen.getAllByText('Highest').length).toBeGreaterThan(0);
    expect(stat('Highest')).toHaveTextContent('8');
    expect(screen.getAllByText('Lowest').length).toBeGreaterThan(0);
    expect(stat('Lowest')).toHaveTextContent('5');
    expect(screen.getByText('Range')).toBeInTheDocument();
    expect(stat('Range')).toHaveTextContent('3');
    expect(screen.getByText('Votes')).toBeInTheDocument();
    expect(stat('Votes')).toHaveTextContent('3 / 4');
  });

  it('shows the non-voter count', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    expect(screen.getByText('1 person did not vote')).toBeInTheDocument();
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

  it('lists the lowest and highest voters', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    // The extremes line text is split across <strong> + text nodes — match by
    // the span's normalized text content.
    expect(screen.getByText((_, el) => el?.textContent === 'Lowest P0 · 5')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Highest P1 · 8, P2 · 8')).toBeInTheDocument();
  });

  it('suggests discussing a large disagreement', () => {
    const large = {
      ...stats,
      level: 'large' as const,
      unique: 5,
      modeShare: 0.2,
      lowest: 3,
      highest: 21,
      range: 18,
      counts: [
        { value: '3', count: 1 },
        { value: '5', count: 1 },
        { value: '8', count: 1 },
        { value: '13', count: 1 },
        { value: '21', count: 1 },
      ],
    };
    renderWithStore(<ResultsPanel />, {
      preloaded: preload({ stats: large, votes: { a: '3', b: '5', c: '8', d: '13', e: '21' } }),
    });
    expect(screen.getByText(/Large disagreement detected/)).toBeInTheDocument();
    const discuss = screen.getAllByRole('status').find((el) => el.textContent?.includes('range from 3 → 21'));
    expect(discuss).toBeTruthy();
  });

  it('handles a non-numeric deck (T-Shirt) without numeric stats', () => {
    const tshirt: Stats = {
      count: 3,
      mode: 'M',
      modeShare: 0.6667,
      unique: 2,
      numeric: false,
      avg: null,
      median: null,
      spread: null,
      highest: null,
      lowest: null,
      range: null,
      level: 'strong',
      counts: [
        { value: 'M', count: 2 },
        { value: 'S', count: 1 },
      ],
    };
    renderWithStore(<ResultsPanel />, {
      preloaded: preload({ stats: tshirt, votes: { a: 'S', b: 'M', c: 'M' } }),
    });
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('M').length).toBeGreaterThanOrEqual(3); // stat + two vote cards
    expect(screen.queryByText('Highest')).not.toBeInTheDocument();
    expect(screen.queryByText('Range')).not.toBeInTheDocument();
  });

  it('highlights the ½ card as an extreme on modified Fibonacci (server parity)', () => {
    const half: Stats = {
      count: 2,
      mode: '½',
      modeShare: 0.5,
      unique: 2,
      numeric: true,
      avg: 10.75,
      median: 10.75,
      spread: 20.5,
      highest: 21,
      lowest: 0.5,
      range: 20.5,
      level: 'moderate',
      counts: [
        { value: '½', count: 1 },
        { value: '21', count: 1 },
      ],
    };
    renderWithStore(<ResultsPanel />, {
      preloaded: preload({
        stats: half,
        votes: { a: '½', b: '21' },
        deckId: 'modifiedFibonacci',
      }),
    });
    // The ½ voter must be listed as the lowest, not dropped by Number('½') = NaN.
    expect(screen.getByText((_, el) => el?.textContent === 'Lowest P0 · ½')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Highest P1 · 21')).toBeInTheDocument();
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

  it('shows which story the results belong to', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload({ story: { id: 'PROJ-143', title: 'User Profile', description: '' } }) });
    expect(screen.getByText('PROJ-143')).toBeInTheDocument();
    expect(screen.getByText('User Profile')).toBeInTheDocument();
  });

  it('falls back to a round label when the story was skipped', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload({ story: null }) });
    expect(screen.getByText('Round 1')).toBeInTheDocument();
  });

  it('offers the host a + New Story action to start the next round', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload() });
    expect(screen.getByRole('button', { name: '+ New Story' })).toBeInTheDocument();
  });

  it('never shows the + New Story action to participants', () => {
    renderWithStore(<ResultsPanel />, { preloaded: preload({ myId: 'b' }) });
    expect(screen.queryByRole('button', { name: '+ New Story' })).not.toBeInTheDocument();
  });
});
