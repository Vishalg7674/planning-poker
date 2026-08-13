import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, startVoting, vote } from './helpers';

test.describe('Host skip — sit the round out, reveal still unlocks', () => {
  test('host skips, everyone else votes, reveal works and results show Skipped', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    try {
      await startVoting(host.page);

      // The host alone sees the skip button while voting.
      await expect(host.page.getByRole('button', { name: 'Skip this round' })).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Skip this round' })).toHaveCount(0);

      // Host skips — their deck locks immediately (no take-backs).
      await host.page.getByRole('button', { name: 'Skip this round' }).click();
      await expect(host.page.getByRole('button', { name: 'Vote 8', exact: true })).toBeDisabled();
      await expect(host.page.getByText(/You skipped this round/)).toBeVisible();
      // The participants panel marks the host as Skipped.
      await expect(host.page.locator('aside').getByText('Skipped')).toBeVisible();

      // One voter in, one still thinking → not everyone yet (host counts via skip).
      await vote(rahul.page, '5');
      await expect(host.page.getByText('2 / 3 voted')).toBeVisible();

      // Everyone done (host skipped) → reveal unlocks.
      await vote(priya.page, '8');
      await expect(host.page.getByText('Everyone has voted · 3 / 3')).toBeVisible();

      // Reveal works; the host's card shows Skipped, stats only count real votes.
      await host.page.getByRole('button', { name: 'Reveal Votes' }).click();
      await expect(host.page.getByLabel('Revealed votes').getByText('Skipped', { exact: true })).toBeVisible();
      await expect(host.page.getByText('Didn’t vote')).toHaveCount(0);
      // Only the two real votes count in the stats row.
      const statsRow = host.page.locator('main').getByText('Votes', { exact: true }).first().locator('..');
      await expect(statsRow).toContainText('2 / 3');
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });
});
