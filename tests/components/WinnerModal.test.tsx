import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WinnerModal from '@/components/games/WinnerModal';
import type { LeaderboardEntry } from '@/lib/gameTypes';

const entries: LeaderboardEntry[] = [
  { playerId: 'p1', name: 'Vishal', hue: 10, rank: 1, score: 420 },
  { playerId: 'p2', name: 'Rahul', hue: 20, rank: 2, score: 360, delta: 80 },
  { playerId: 'p3', name: 'Priya', hue: 30, rank: 3, score: 300, delta: 60 },
];

function renderModal(over: { open?: boolean } = {}) {
  const props = {
    open: over.open ?? true,
    gameName: 'Most Likely To',
    entries,
    totalRounds: 3,
    onPlayAgain: vi.fn(),
    onBackToGames: vi.fn(),
    onClose: vi.fn(),
  };
  const utils = render(<WinnerModal {...props} />);
  return { ...utils, props };
}

describe('WinnerModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('crowns the top entry as the winner with an animated score', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Game Complete!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game Complete!' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Winner: Vishal with 420 points' })).toBeInTheDocument();
    // Winner banner + leaderboard row both show the total.
    expect(screen.getAllByText('420').length).toBeGreaterThan(0);
    // Medal podium rows appear.
    expect(screen.getByText('Rahul')).toBeInTheDocument();
    expect(screen.getByText('Priya')).toBeInTheDocument();
  });

  it('shows the game name and round count', () => {
    renderModal();
    // The eyebrow is one paragraph whose text is split across JSX nodes.
    expect(
      screen.getByText((_, el) => el?.textContent === 'Most Likely To · 3 rounds'),
    ).toBeInTheDocument();
  });

  it('replays the confetti burst each time the modal reopens', () => {
    const base = {
      gameName: 'Most Likely To',
      entries,
      totalRounds: 3,
      onPlayAgain: vi.fn(),
      onBackToGames: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<WinnerModal {...base} open />);
    const burst = () => document.querySelector('[class*="burst"]');
    const tick1 = burst()?.getAttribute('data-tick');
    expect(tick1).toBeTruthy();

    rerender(<WinnerModal {...base} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<WinnerModal {...base} open />);
    const tick2 = burst()?.getAttribute('data-tick');
    expect(Number(tick2)).toBe(Number(tick1) + 1);
  });

  it('fires Play Again and Back to Games', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(props.onPlayAgain).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Back to Games/ }));
    expect(props.onBackToGames).toHaveBeenCalledTimes(1);
  });

  it('handles an empty leaderboard without crashing', () => {
    const props = {
      open: true,
      gameName: 'Most Likely To',
      entries: [] as LeaderboardEntry[],
      totalRounds: 0,
      onPlayAgain: vi.fn(),
      onBackToGames: vi.fn(),
      onClose: vi.fn(),
    };
    render(<WinnerModal {...props} />);
    expect(screen.getByText('No scores yet — play a round to crown a champion.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument();
  });
});
