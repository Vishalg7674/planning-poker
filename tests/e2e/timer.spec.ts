import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Optional timer', () => {
  test('defaults to Off — voting stays open until everyone votes', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // Off is the selected default.
      await expect(host.page.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');

      await startVoting(host.page);
      // No countdown badge is rendered with the timer off.
      await expect(host.page.locator('[title="Countdown synced across the room"]')).toHaveCount(0);

      // Voting stays open indefinitely — the counter only moves with votes.
      await vote(rahul.page, '8');
      await expect(host.page.getByText('1 / 2 voted')).toBeVisible();
      await vote(host.page, '5');
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });

  test('10s timer ends voting automatically and rejects late votes', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await host.page.getByRole('button', { name: '10s' }).click();
      await expect(host.page.getByRole('button', { name: '10s' })).toHaveAttribute('aria-pressed', 'true');

      await startVoting(host.page);
      // The synced countdown is on screen.
      await expect(host.page.locator('[title="Countdown synced across the room"]')).toBeVisible();

      // Rahul votes before the buzzer; the host stays thinking.
      await vote(rahul.page, '8');
      await expect(host.page.getByText('1 / 2 voted')).toBeVisible();

      // The server ends the round when the countdown hits zero.
      await expect(host.page.getByText('Voting ended', { exact: true })).toBeVisible({ timeout: 15_000 });

      // No new votes can be cast afterwards.
      await expect(rahul.page.getByRole('button', { name: 'Vote 8', exact: true })).toBeDisabled();

      // The host can still reveal (non-voters are marked, not invented).
      await reveal(host.page);
      await expect(rahul.page.getByText('Average')).toBeVisible();
      await expect(rahul.page.getByLabel('Revealed votes').getByText('8')).toBeVisible();
      await expect(host.page.getByLabel('Revealed votes').getByText(/Didn.t vote/)).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });

  test('15s and 30s presets are offered and drive a countdown', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    try {
      await host.page.getByRole('button', { name: '15s' }).click();
      await expect(host.page.getByRole('button', { name: '15s' })).toHaveAttribute('aria-pressed', 'true');
      await host.page.getByRole('button', { name: '30s' }).click();
      await expect(host.page.getByRole('button', { name: '30s' })).toHaveAttribute('aria-pressed', 'true');

      await startVoting(host.page);
      await expect(host.page.locator('[title="Countdown synced across the room"]')).toBeVisible();
      // Countdown is in mm:ss form (00:30 at start, ticking down).
      await expect(host.page.getByText(/^00:\d{2}$/)).toBeVisible();
    } finally {
      await host.context.close();
    }
  });
});
