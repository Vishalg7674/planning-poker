import { expect, test } from '@playwright/test';
import { createRoom, expectStat, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Complete voting flow', () => {
  test('host starts, everyone votes, host reveals, everyone sees results', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    try {
      await startVoting(host.page);

      // Everyone receives the start event: cards unlock + prompt appears.
      await expect(rahul.page.getByText('Choose your estimate')).toBeVisible();
      await expect(priya.page.getByText('Choose your estimate')).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Vote 8', exact: true })).toBeEnabled();

      // Everyone votes exactly once.
      await vote(rahul.page, '8');
      await vote(priya.page, '13');
      await vote(host.page, '5');

      // Live status: 3/3 voted → host gets the reveal button.
      await expect(host.page.getByText('Everyone has voted · 3 / 3')).toBeVisible();

      // Reveal.
      await reveal(host.page);

      // Everyone sees the same results and statistics.
      for (const page of [host.page, rahul.page, priya.page]) {
        await expectStat(page, 'Average', '8.67');
        await expectStat(page, 'Median', '8');
        await expectStat(page, 'Most selected', '5');
        await expectStat(page, 'Votes', '3 / 3');
        const cards = page.getByLabel('Revealed votes');
        await expect(cards.getByText('8')).toBeVisible();
        await expect(cards.getByText('13')).toBeVisible();
        await expect(cards.getByText('5')).toBeVisible();
      }
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });
});
