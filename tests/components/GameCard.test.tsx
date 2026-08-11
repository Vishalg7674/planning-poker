import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameCard from '@/components/games/GameCard';
import { getGame } from '@/lib/games';

const live = getGame('planning-poker')!;
const soon = getGame('this-or-that')!;

describe('GameCard', () => {
  it('renders icon, name, description and meta for any game', () => {
    render(<GameCard game={soon} />);
    expect(screen.getByText('This or That')).toBeInTheDocument();
    expect(screen.getByText(/Pick a side/)).toBeInTheDocument();
    expect(screen.getByText('⚖️')).toBeInTheDocument();
    expect(screen.getByText('👥 3–20 players')).toBeInTheDocument();
    expect(screen.getByText('⚡ 5 min')).toBeInTheDocument();
  });

  it('marks a live game and links straight to its real route', () => {
    render(<GameCard game={live} />);
    const card = screen.getByRole('link', { name: /Play now/ });
    expect(card).toHaveAttribute('href', '/create');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Play Game →')).toBeInTheDocument();
  });

  it('marks a coming-soon game and links to its placeholder page', () => {
    render(<GameCard game={soon} />);
    const card = screen.getByRole('link', { name: /Coming soon/ });
    expect(card).toHaveAttribute('href', '/games/this-or-that');
    expect(screen.getByText('COMING SOON')).toBeInTheDocument();
  });
});
