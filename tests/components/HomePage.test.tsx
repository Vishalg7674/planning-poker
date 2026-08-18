import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/app/page';
import { renderWithStore } from '../helpers/store';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => {
  pushMock.mockReset();
  window.sessionStorage.clear();
});

describe('HomePage', () => {
  it('shows the planning poker positioning', () => {
    renderWithStore(<HomePage />, {});
    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero).toHaveTextContent('Estimate together.');
    expect(hero).toHaveTextContent('Reveal together.');
    expect(screen.getByText(/no login required/)).toBeInTheDocument();
    expect(screen.getByText('✓ No signup')).toBeInTheDocument();
    expect(screen.getByText('Planning Poker · no signup')).toBeInTheDocument();
  });

  it('shows the planning poker quick stats', () => {
    renderWithStore(<HomePage />, {});
    const stats = screen.getByLabelText('Planning poker at a glance');
    expect(stats).toHaveTextContent('5');
    expect(stats).toHaveTextContent('10–30s');
    expect(stats).toHaveTextContent('1');
    expect(stats).toHaveTextContent('0');
    expect(stats).toHaveTextContent('decks');
    expect(stats).toHaveTextContent('voting timer');
    expect(stats).toHaveTextContent('click to play');
    expect(stats).toHaveTextContent('logins required');
  });

  it('offers the create-room CTA', () => {
    renderWithStore(<HomePage />, {});
    const createRoom = screen.getAllByRole('link', { name: 'Create a Room' });
    expect(createRoom.length).toBeGreaterThan(0);
    for (const link of createRoom) expect(link).toHaveAttribute('href', '/create');
    expect(screen.getByRole('link', { name: 'Create a room' })).toHaveAttribute('href', '/create');
  });

  it('features Planning Poker prominently', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByText('⭐ Planning Poker')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planning Poker' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play Planning Poker' })).toHaveAttribute('href', '/create');
  });

  it('shows the why-teams and how-it-works steps', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByRole('heading', { name: 'Sprint planning, without the chaos' })).toBeInTheDocument();
    expect(screen.getByText('Votes stay private')).toBeInTheDocument();
    // The CTA button and the how-it-works step both say “Create a room”.
    expect(screen.getAllByText('Create a room').length).toBeGreaterThan(0);
    expect(screen.getByText('Reveal together')).toBeInTheDocument();
    expect(screen.getByText('Next story')).toBeInTheDocument();
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

  it('renders the footer with the planning poker positioning', () => {
    renderWithStore(<HomePage />, {});
    expect(screen.getByText(/Real-time Planning Poker for agile teams/)).toBeInTheDocument();
    expect(screen.getByText('© 2026 Reveal')).toBeInTheDocument();
  });
});
