import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import GameCatalog from '@/components/games/GameCatalog';
import { GAME_COUNT, GAMES } from '@/lib/games';

describe('GameCatalog', () => {
  it('renders every game card and reports the total', () => {
    render(<GameCatalog />);
    // One link per game card.
    expect(screen.getAllByRole('link')).toHaveLength(GAME_COUNT);
    expect(screen.getByText(`${GAME_COUNT} games`)).toBeInTheDocument();
    // The shipped games carry a LIVE badge.
    expect(screen.getByText('Planning Poker')).toBeInTheDocument();
    expect(screen.getByText('Most Likely To')).toBeInTheDocument();
    expect(screen.getByText('Would You Rather')).toBeInTheDocument();
    expect(screen.getByText('This or That')).toBeInTheDocument();
    expect(screen.getByText('Team Trivia')).toBeInTheDocument();
    // Every catalog game is live now.
    expect(screen.getAllByText('LIVE')).toHaveLength(GAME_COUNT);
  });

  it('filters instantly by search', async () => {
    const user = userEvent.setup();
    render(<GameCatalog />);
    await user.type(screen.getByRole('searchbox', { name: 'Search games' }), 'poker');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Planning Poker')).toBeInTheDocument();
    expect(screen.queryByText('Most Likely To')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    render(<GameCatalog />);
    await user.type(screen.getByRole('searchbox', { name: 'Search games' }), 'zzzzzz');
    expect(screen.getByRole('status')).toHaveTextContent('No games found.');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('filters by category chip and resets with All', async () => {
    const user = userEvent.setup();
    render(<GameCatalog />);
    await user.click(screen.getByRole('button', { name: /Developer/ }));
    const developerGames = GAMES.filter((g) => g.category === 'developer');
    expect(screen.getAllByRole('link')).toHaveLength(developerGames.length);
    expect(screen.queryByText('Most Likely To')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Developer/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('link')).toHaveLength(GAME_COUNT);
  });

  it('renders per-category "View all" links when requested', () => {
    render(<GameCatalog showCategoryLinks />);
    const viewAll = screen.getAllByRole('link', { name: /View all/ });
    expect(viewAll).toHaveLength(9);
    expect(viewAll[0]).toHaveAttribute('href', '/games?cat=icebreakers');
  });

  it('respects a preselected category', () => {
    render(<GameCatalog initialCategory="word" />);
    const wordGames = GAMES.filter((g) => g.category === 'word');
    expect(screen.getAllByRole('link')).toHaveLength(wordGames.length);
    expect(screen.getByText('Word Chain')).toBeInTheDocument();
    expect(screen.queryByText('Most Likely To')).not.toBeInTheDocument();
  });

  it('groups remaining games by category while searching', async () => {
    const user = userEvent.setup();
    render(<GameCatalog />);
    await user.type(screen.getByRole('searchbox', { name: 'Search games' }), 'guess');
    // Several categories contain "guess" games — sections stay grouped.
    const sections = screen.getAllByRole('region');
    expect(sections.length).toBeGreaterThan(1);
    const first = within(sections[0]);
    expect(first.getAllByRole('link').length).toBeGreaterThan(0);
  });
});
