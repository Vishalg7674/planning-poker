import { expect, test } from '@playwright/test';
import { createRoom, joinRoom } from './helpers';

test.describe('Join room', () => {
  test('a participant joins through the shared link and both see each other', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    try {
      await expect(host.page.getByLabel('Room configuration')).toBeVisible();

      const guest = await joinRoom(browser, host.page.url(), 'Grace');
      try {
        // Host sees the new participant in real time.
        await expect(host.page.getByText('Grace')).toBeVisible();
        // Participant sees the host and the waiting copy.
        await expect(guest.page.getByText('Ada')).toBeVisible();
        await expect(guest.page.getByText('Waiting for the host…')).toBeVisible();
        // The participant's deck is locked too.
        await expect(guest.page.getByRole('button', { name: 'Vote 5', exact: true })).toBeDisabled();
      } finally {
        await guest.context.close();
      }
    } finally {
      await host.context.close();
    }
  });

  test('a participant sees the room title and team name on the join screen', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada', { teamName: 'Squad', roomTitle: 'Sprint 24' });
    const guest = await joinRoom(browser, host.page.url(), 'Grace');
    try {
      await expect(guest.page.getByText('Sprint 24').first()).toBeVisible();
      await expect(guest.page.getByText('Squad').first()).toBeVisible();
    } finally {
      await host.context.close();
      await guest.context.close();
    }
  });
});
