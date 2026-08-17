import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';
import { renderWithStore } from '../helpers/store';
import { GAME_COUNT } from '@/lib/games';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe('HomePage', () => {
  it('shows the new platform positioning', () => {
    renderWithStore(<HomePage />, {});
    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero).toHaveTextContent('Break the ice.');
    expect(hero).toHaveTextContent('Play together.');
    expect(screen.getByText(/no login required/)).toBeInTheDocument();
    expect(screen.getByText('✓ No signup')).toBeInTheDocument();
    expect(screen.getByText(`${GAME_COUNT} games · 0 logins`)).toBeInTheDocument();
  });

  it('shows the registry-derived game counter', () => {
    renderWithStore(<HomePage />, {});
    const stats = screen.getByLabelText('Games at a glance');
    expect(stats).toHaveTextContent(`${GAME_COUNT}`);
    expect(stats).toHaveTextContent('10');
    expect(stats).toHaveTextContent('1');
    expect(stats).toHaveTextContent('0');
    expect(stats).toHaveTextContent('click to play');
    expect(stats).toHaveTextContent('logins required');
  });

  it('offers Create a Game and Explore Games CTAs', () => {
    renderWithStore(<HomePage />, {});
    const createGame = screen.getAllByRole('link', { name: 'Create a Game' });
    expect(createGame.length).toBeGreaterThan(0);
    for (const link of createGame) expect(link).toHaveAttribute('href', '/create');
    expect(screen.getByRole('link', { name: 'Create a room' })).toHaveAttribute('href', '/create');
    // Explore Games scrolls to the catalog.
    const explore = screen.getAllByRole('link', { name: 'Explore Games' });
    expect(explore.length).toBeGreaterThan(0);
    for (const link of explore) expect(link).toHaveAttribute('href', '#games');
  });

  it('features Planning Poker prominently', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByText('⭐ Featured')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planning Poker' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play Planning Poker' })).toHaveAttribute('href', '/create');
  });

  it('renders the full game catalog with search and categories', async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, {});
    const heading = screen.getByRole('heading', { name: 'Something for every meeting' });
    expect(heading).toBeInTheDocument();
    // All 110 cards render on the homepage.
    expect(screen.getAllByRole('link', { name: /Play now|Coming soon/ })).toHaveLength(GAME_COUNT);

    await user.type(screen.getByRole('searchbox', { name: 'Search games' }), 'trivia');
    await waitFor(() => expect(screen.getByText(/matching “trivia”/)).toBeInTheDocument());
    expect(screen.getByText('Trivia Battle')).toBeInTheDocument();
    expect(screen.queryByText('Most Likely To')).not.toBeInTheDocument();
  });

  it('shows the roadmap podium and how-it-works steps', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByRole('heading', { name: '🏆 Play. Score. Compete.' })).toBeInTheDocument();
    expect(screen.getByText('Vishal')).toBeInTheDocument();
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('420 pts')).toBeInTheDocument();
    expect(screen.getByText('Pick a game')).toBeInTheDocument();
    expect(screen.getByText('See the leaderboard')).toBeInTheDocument();
  });

  it('keeps the join-by-code form working', async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, {});
    const input = screen.getByRole('textbox', { name: 'Room code' });
    await user.type(input, 'abc12');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/r/ABC12'));
  });

  it('validates the join code', async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, {});
    await user.type(screen.getByRole('textbox', { name: 'Room code' }), 'ab');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText(/4–6 letters/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders the footer with the new positioning', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByText(/Real-time games for teams, retrospectives and icebreakers/)).toBeInTheDocument();
    expect(screen.getByText('© 2026 Reveal')).toBeInTheDocument();
  });
});
