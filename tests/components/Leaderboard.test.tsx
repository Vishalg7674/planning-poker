import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Leaderboard, { medalForRank } from '@/components/games/Leaderboard';
import type { LeaderboardEntry } from '@/lib/gameTypes';

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { playerId: 'p', name: 'Player', hue: 0, rank: 1, score: 0, ...over };
}

const board: LeaderboardEntry[] = [
  entry({ playerId: 'p1', name: 'Vishal', hue: 10, rank: 1, score: 420, delta: 100, isMe: true }),
  entry({ playerId: 'p2', name: 'Rahul', hue: 20, rank: 2, score: 360, delta: 80 }),
  entry({ playerId: 'p3', name: 'Priya', hue: 30, rank: 3, score: 300, delta: 60 }),
  entry({ playerId: 'p4', name: 'Amit', hue: 40, rank: 4, score: 240 }),
  entry({ playerId: 'p5', name: 'Neha', hue: 50, rank: 5, score: 180 }),
];

describe('medalForRank', () => {
  it('maps the top three to medals and nothing beyond', () => {
    expect(medalForRank(1)).toBe('🥇');
    expect(medalForRank(2)).toBe('🥈');
    expect(medalForRank(3)).toBe('🥉');
    expect(medalForRank(4)).toBeNull();
  });
});

describe('Leaderboard', () => {
  it('renders medals for the top three and numbers beyond', () => {
    render(<Leaderboard entries={board} />);
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders names, animated totals and pts labels', () => {
    render(<Leaderboard entries={board} />);
    expect(screen.getByText('Vishal')).toBeInTheDocument();
    expect(screen.getByText('Rahul')).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('360')).toBeInTheDocument();
    expect(screen.getAllByText('pts').length).toBe(5);
  });

  it('marks my own row with a you chip', () => {
    render(<Leaderboard entries={board} myId="p1" />);
    // The chip carries aria-label="you" (the Avatar's own "you" tag has none).
    expect(screen.getAllByLabelText('you')).toHaveLength(1);
  });

  it('renders +N delta chips only when showDelta is on', () => {
    const { rerender } = render(<Leaderboard entries={board} />);
    expect(screen.queryByText('+100')).not.toBeInTheDocument();

    rerender(<Leaderboard entries={board} showDelta />);
    expect(screen.getByText('+100')).toBeInTheDocument();
    expect(screen.getByText('+80')).toBeInTheDocument();
    // No delta provided → no chip for this row.
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  it('renders the title and empty state', () => {
    const { rerender } = render(<Leaderboard entries={[]} title="Leaderboard" />);
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByText(/No scores yet/)).toBeInTheDocument();

    rerender(<Leaderboard entries={board} title="Round 3" subtitle="Total scores" />);
    expect(screen.getByText('Round 3')).toBeInTheDocument();
    expect(screen.getByText('Total scores')).toBeInTheDocument();
  });

  it('renders avatars with the player name as the accessible name', () => {
    render(<Leaderboard entries={[board[0]]} />);
    expect(screen.getByRole('img', { name: 'Vishal' })).toBeInTheDocument();
  });
});
