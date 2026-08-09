import { expect, test } from '@playwright/test';
import { createRoom, expectStat, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Results & statistics', () => {
  test('average, median, mode and distribution are computed from real votes', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    const amit = await joinRoom(browser, host.page.url(), 'Amit');
    try {
      await startVoting(host.page);
      await vote(host.page, '5');
      await vote(rahul.page, '8');
      await vote(priya.page, '8');
      await vote(amit.page, '13');
      await reveal(host.page);

      // Headline stats: (5+8+8+13)/4 = 8.5, median 8, mode 8.
      await expectStat(host.page, 'Average', '8.5');
      await expectStat(host.page, 'Median', '8');
      await expectStat(host.page, 'Most selected', '8');
      await expectStat(host.page, 'Votes', '4 / 4');

      // Every submitted vote is visible on the table.
      const cards = rahul.page.getByLabel('Revealed votes');
      await expect(cards.getByText('5')).toBeVisible();
      await expect(cards.getByText('8')).toHaveCount(2);
      await expect(cards.getByText('13')).toBeVisible();

      // Vote distribution renders counts per value.
      await expect(rahul.page.getByText('Vote distribution')).toBeVisible();
      const distribution = rahul.page.getByText('Vote distribution').locator('..');
      await expect(distribution).toContainText('2');
      await expect(distribution).toContainText('1');
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
      await amit.context.close();
    }
  });

  test('a participant who did not vote is excluded from the math and shown clearly', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    try {
      // 10s timer so the round can end with Priya still thinking.
      await host.page.getByRole('button', { name: '10s' }).click();
      await startVoting(host.page);
      await vote(host.page, '5');
      await vote(rahul.page, '8');

      await expect(host.page.getByText('Voting ended', { exact: true })).toBeVisible({ timeout: 15_000 });
      await reveal(host.page);

      // Stats come from the 2 submitted votes only: (5+8)/2 = 6.5.
      await expectStat(priya.page, 'Average', '6.5');
      await expectStat(priya.page, 'Votes', '2 / 3');
      await expect(priya.page.getByLabel('Revealed votes').getByText(/Didn.t vote/)).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });
});
