import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Round-result modal', () => {
  test('full consensus opens a dismissible modal that never reappears for the same round', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await startVoting(host.page);
      await vote(host.page, '5');
      await vote(rahul.page, '5');
      await reveal(host.page);

      // Everyone gets the consensus modal — host and participant alike.
      const dialog = host.page.getByRole('dialog', { name: 'Consensus Reached' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Everyone voted');
      await expect(dialog).toContainText('5');
      await expect(rahul.page.getByRole('dialog', { name: 'Consensus Reached' })).toBeVisible();

      // Explicit Close button dismisses it.
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);

      // A genuinely new snapshot (a late joiner broadcasts one) must not
      // resurrect the modal for the same round.
      const zaraCtx = await browser.newContext();
      const zara = await zaraCtx.newPage();
      await zara.goto(host.page.url());
      await zara.getByLabel('Enter your name').fill('Zara');
      await zara.getByRole('button', { name: 'Join Room' }).click();
      // Zara is a fresh client — she legitimately sees the result modal.
      await expect(zara.getByRole('dialog', { name: 'Consensus Reached' })).toBeVisible();
      // The host's dismissed modal stays dismissed.
      await expect(host.page.getByRole('dialog', { name: 'Consensus Reached' })).toHaveCount(0);
      await zaraCtx.close();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });

  test('large disagreement opens the discuss modal and closes cleanly', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    const amit = await joinRoom(browser, host.page.url(), 'Amit');
    try {
      await startVoting(host.page);
      await vote(host.page, '3');
      await vote(rahul.page, '5');
      await vote(priya.page, '8');
      await vote(amit.page, '21');
      await reveal(host.page);

      const dialog = host.page.getByRole('dialog', { name: 'Large Disagreement' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Estimates range widely');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toHaveCount(0);

      // The results panel remains fully visible behind the dismissed modal.
      await expect(host.page.getByText('Average')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
      await amit.context.close();
    }
  });
});
