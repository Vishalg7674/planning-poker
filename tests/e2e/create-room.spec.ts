import { expect, test } from '@playwright/test';
import { createRoom } from './helpers';

test.describe('Create room', () => {
  test('host creates a room and sees the invite screen', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    try {
      // Room URL is /r/<CODE>.
      await expect(host.page).toHaveURL(/\/r\/[A-Z2-9]{5}$/);
      // Room code is displayed in the header.
      await expect(host.page.getByTitle('Room code')).toHaveText(host.code);
      // Host sees the invite copy + copy-link button.
      await expect(host.page.getByText('Invite your team')).toBeVisible();
      await expect(host.page.getByRole('button', { name: /Copy Invite/ })).toBeVisible();
      // The host row appears in the participant list with the Host badge.
      await expect(host.page.getByText('Ada')).toBeVisible();
      await expect(host.page.getByText('Host').first()).toBeVisible();
      // The deck is visible but locked until the round starts.
      await expect(host.page.getByRole('button', { name: 'Vote 8', exact: true })).toBeDisabled();
    } finally {
      await host.context.close();
    }
  });
});
