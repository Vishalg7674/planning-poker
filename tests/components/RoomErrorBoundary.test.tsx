import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import RoomErrorBoundary from '@/components/room/RoomErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div>room content</div>;
}

describe('RoomErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <RoomErrorBoundary>
        <Bomb shouldThrow={false} />
      </RoomErrorBoundary>,
    );
    expect(screen.getByText('room content')).toBeInTheDocument();
  });

  it('shows a friendly fallback instead of crashing the app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RoomErrorBoundary>
        <Bomb shouldThrow />
      </RoomErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/room is still safe/)).toBeInTheDocument();
    expect(screen.queryByText('room content')).not.toBeInTheDocument();
  });

  it('Try Again recovers once the underlying error is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const { rerender } = render(
      <RoomErrorBoundary>
        <Bomb shouldThrow />
      </RoomErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <RoomErrorBoundary>
        <Bomb shouldThrow={false} />
      </RoomErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('room content')).toBeInTheDocument();
  });
});
