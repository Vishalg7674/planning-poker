import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RoundResultModal from '@/components/modals/RoundResultModal';
import { renderWithStore } from '../helpers/store';
import { makeParticipant } from '../helpers/fixtures';
import type { Stats } from '@/lib/types';

const fullStats: Stats = {
  count: 3,
  mode: '5',
  modeShare: 1,
  unique: 1,
  numeric: true,
  avg: 5,
  median: 5,
  spread: 0,
  highest: 5,
  lowest: 5,
  range: 0,
  level: 'full',
  counts: [{ value: '5', count: 3 }],
};

const largeStats: Stats = {
  count: 4,
  mode: '8',
  modeShare: 0.25,
  unique: 4,
  numeric: true,
  avg: 11.75,
  median: 10.5,
  spread: 18,
  highest: 21,
  lowest: 3,
  range: 18,
  level: 'large',
  counts: [
    { value: '3', count: 1 },
    { value: '5', count: 1 },
    { value: '8', count: 1 },
    { value: '21', count: 1 },
  ],
};

function preload(stats: Stats | null, votes: Record<string, string>) {
  const participants = Object.keys(votes).map((id, i) =>
    makeParticipant({ id, name: `P${i}`, status: 'voted', hasVoted: true, joinedAt: i, hue: i * 10 }),
  );
  return {
    voting: { phase: 'revealed', stats, votes, votedIds: Object.keys(votes), everyoneHasVoted: true },
    participants: { list: participants },
  } as never;
}

describe('RoundResultModal', () => {
  it('renders nothing when closed', () => {
    renderWithStore(<RoundResultModal open={false} onClose={() => {}} />, {});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no stats yet', () => {
    renderWithStore(<RoundResultModal open onClose={() => {}} />, {
      preloaded: preload(null, {}),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the consensus summary with average/median for a full round', () => {
    renderWithStore(<RoundResultModal open onClose={() => {}} />, {
      preloaded: preload(fullStats, { a: '5', b: '5', c: '5' }),
    });
    const dialog = screen.getByRole('dialog', { name: 'Consensus Reached' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Everyone voted');
    expect(dialog).toHaveTextContent('5');
    expect(dialog).toHaveTextContent('Average');
    expect(dialog).toHaveTextContent('Median');
    // An explicit Close button is always available.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('describes the spread for a large disagreement', () => {
    renderWithStore(<RoundResultModal open onClose={() => {}} />, {
      preloaded: preload(largeStats, { a: '3', b: '5', c: '8', d: '21' }),
    });
    const dialog = screen.getByRole('dialog', { name: 'Large Disagreement' });
    expect(dialog).toHaveTextContent('Estimates range widely');
    expect(dialog).toHaveTextContent('From 3 → 21 across 4 different cards.');
  });

  it('closes when the Close button is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithStore(<RoundResultModal open onClose={onClose} />, {
      preloaded: preload(fullStats, { a: '5', b: '5' }),
    });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
