import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, startVoting, vote } from './helpers';

test.describe('Permissions', () => {
  test('a participant never sees host controls', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // No start button, no invite link, no timer picker for participants.
      await expect(rahul.page.getByText('Waiting for the host…')).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Start Voting' })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: /Copy Invite/ })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: '10s' })).toHaveCount(0);

      await startVoting(host.page);
      await vote(host.page, '5');
      await vote(rahul.page, '8');

      // Everyone voted, but only the host gets the reveal button.
      await expect(host.page.getByRole('button', { name: 'Reveal Votes' })).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Reveal Votes' })).toHaveCount(0);
      await expect(rahul.page.getByText('Votes stay hidden until the host reveals.')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
