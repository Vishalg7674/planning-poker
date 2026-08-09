import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Everyone voted (timer off)', () => {
  test('reveal is unavailable until the last participant votes', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    try {
      await startVoting(host.page);

      // One vote in: counter updates, no reveal button.
      await vote(rahul.page, '8');
      await expect(host.page.getByText('1 / 3 voted')).toBeVisible();
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toHaveCount(0);
      await expect(host.page.getByText('Reveal unlocks once everyone has voted.')).toBeVisible();

      // Second vote in.
      await vote(priya.page, '13');
      await expect(host.page.getByText('2 / 3 voted')).toBeVisible();
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toHaveCount(0);

      // Last vote unlocks it.
      await vote(host.page, '5');
      await expect(host.page.getByText('Everyone has voted · 3 / 3')).toBeVisible();
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toBeVisible();

      await reveal(host.page);
      await expect(host.page.getByText('Average')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });
});
