import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Celebration from '@/components/Celebration';

describe('Celebration (shared confetti)', () => {
  it('renders nothing for tick 0', () => {
    const { container } = render(<Celebration tick={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders confetti pieces for a positive tick', () => {
    const { container } = render(<Celebration tick={1} />);
    // The burst wrapper + dozens of pieces render as spans/divs.
    expect(container.querySelectorAll('span').length).toBeGreaterThan(10);
  });

  it('shows the optional label', () => {
    render(<Celebration tick={2} label="Full Consensus" />);
    expect(screen.getByText('Full Consensus')).toBeInTheDocument();
  });

  it('replays on a new tick', () => {
    const first = render(<Celebration tick={1} />);
    const pieceCount = first.container.querySelectorAll('span').length;
    const second = render(<Celebration tick={2} />);
    expect(second.container.querySelectorAll('span').length).toBe(pieceCount);
  });
});
