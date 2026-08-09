import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Vote lock', () => {
  test('a vote cannot be changed or cancelled once cast', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await startVoting(host.page);

      await vote(rahul.page, '8');
      // The card locks with a visible confirmation.
      await expect(rahul.page.getByText(/Vote locked/)).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Vote 8', exact: true })).toHaveAttribute('aria-pressed', 'true');

      // Trying to pick 13 does nothing — every other card is disabled.
      await expect(rahul.page.getByRole('button', { name: 'Vote 13', exact: true })).toBeDisabled();
      await rahul.page.getByRole('button', { name: 'Vote 13', exact: true }).click({ force: true });
      await expect(rahul.page.getByRole('button', { name: 'Vote 8', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(rahul.page.getByRole('button', { name: 'Vote 13', exact: true })).not.toHaveAttribute('aria-pressed', 'true');

      // The reveal proves the original vote stuck: 8, never 13.
      await vote(host.page, '5');
      await reveal(host.page);
      const cards = rahul.page.getByLabel('Revealed votes');
      await expect(cards.getByText('8')).toBeVisible();
      await expect(cards.getByText('13')).toHaveCount(0);
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
