import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DistributionChart from '@/components/DistributionChart';

describe('DistributionChart', () => {
  it('renders one row per value with counts and percentages', () => {
    render(<DistributionChart data={[{ label: '5', count: 1 }, { label: '8', count: 2 }]} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('renders the title when provided', () => {
    render(<DistributionChart data={[{ label: '8', count: 1 }]} title="Vote distribution" />);
    expect(screen.getByText('Vote distribution')).toBeInTheDocument();
  });

  it('shows an empty state for zero votes', () => {
    render(<DistributionChart data={[]} />);
    expect(screen.getByText(/No estimates yet/)).toBeInTheDocument();
  });
});
