import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Vote privacy', () => {
  test('the host sees who voted but never the value until reveal', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await startVoting(host.page);
      await vote(rahul.page, '8');

      // Host sees Rahul as "Voted" with a running counter — not the value.
      const rahulRow = host.page.getByText('Rahul').locator('..').locator('..');
      await expect(rahulRow).toContainText('Voted');
      await expect(host.page.getByText('1 / 2 voted')).toBeVisible();
      await expect(rahulRow).not.toContainText('8');

      // Even after everyone voted and reveal is available, values stay hidden
      // until the host actually presses Reveal.
      await vote(host.page, '5');
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toBeVisible();
      await expect(host.page.getByText('Everyone has voted · 2 / 2')).toBeVisible();
      await expect(host.page.getByLabel('Revealed votes')).toHaveCount(0);

      // Reveal flips the cards for everyone at once.
      await reveal(host.page);
      const cards = host.page.getByLabel('Revealed votes');
      await expect(cards.getByText('8')).toBeVisible();
      await expect(cards.getByText('5')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
