import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ComingSoonGame from '@/components/games/ComingSoonGame';
import { getGame } from '@/lib/games';

const game = getGame('fastest-finger')!;

describe('ComingSoonGame', () => {
  it('renders icon, name, description, category and coming-soon badge', () => {
    render(<ComingSoonGame game={game} />);
    expect(screen.getByRole('heading', { name: 'Fastest Finger' })).toBeInTheDocument();
    expect(screen.getByText('👆')).toBeInTheDocument();
    expect(screen.getByText('COMING SOON')).toBeInTheDocument();
    expect(screen.getByText(/We're building this game!/)).toBeInTheDocument();
    expect(screen.getByText(/⚡ Speed · 3–20 players · 5 min/)).toBeInTheDocument();
  });

  it('links back to the games catalog', () => {
    render(<ComingSoonGame game={game} />);
    expect(screen.getByRole('link', { name: /Back to Games/ })).toHaveAttribute('href', '/games');
  });
});
