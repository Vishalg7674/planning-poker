import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameCard from '@/components/games/GameCard';
import { getGame } from '@/lib/games';

const live = getGame('planning-poker')!;
const soon = getGame('fastest-finger')!;

function liveCard() {
  render(<GameCard game={live} />);
  return screen.getByRole('link', { name: /Play now/ });
}

describe('GameCard', () => {
  it('renders icon, name, description and meta for any game', () => {
    render(<GameCard game={soon} />);
    expect(screen.getByText('Fastest Finger')).toBeInTheDocument();
    expect(screen.getByText(/First to tap the right answer/)).toBeInTheDocument();
    expect(screen.getByText('👆')).toBeInTheDocument();
    expect(screen.getByText('👥 3–20 players')).toBeInTheDocument();
    expect(screen.getByText('⚡ 5 min')).toBeInTheDocument();
  });

  it('marks a live game and links straight to its real route', () => {
    expect(liveCard()).toHaveAttribute('href', '/create');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Play Game →')).toBeInTheDocument();
  });

  it('marks a live game by linking straight to its own route', () => {
    render(<GameCard game={getGame('most-likely-to')!} />);
    const card = screen.getByRole('link', { name: /Play now/ });
    expect(card).toHaveAttribute('href', '/games/most-likely-to');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('marks a live game and links to its real route', () => {
    render(<GameCard game={soon} />);
    const card = screen.getByRole('link', { name: /Play now/ });
    expect(card).toHaveAttribute('href', '/games/fastest-finger');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
