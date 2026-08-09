import { expect, test } from '@playwright/test';
import { createRoom, joinRoom } from './helpers';

test.describe('Room lock', () => {
  test('host locks the room; a new joiner is refused and can join after unlock', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // Lock the room from the waiting lobby.
      await host.page.getByRole('button', { name: '🔒 Lock Room' }).click();
      await expect(host.page.getByRole('button', { name: '🔓 Unlock Room' })).toBeVisible();
      // The header badge appears and existing participants see the locked note.
      await expect(host.page.getByText('🔒 Locked')).toBeVisible();
      await expect(rahul.page.getByText(/room is locked/)).toBeVisible();

      // A brand-new visitor cannot join.
      const strangerContext = await browser.newContext();
      const stranger = await strangerContext.newPage();
      await stranger.goto(host.page.url());
      await stranger.getByLabel('Enter your name').fill('Stranger');
      await stranger.getByRole('button', { name: 'Join Room' }).click();
      await expect(stranger.getByText('This room is locked. Ask the host for access.')).toBeVisible();
      await strangerContext.close();

      // Unlock and the same visitor joins instantly.
      await host.page.getByRole('button', { name: '🔓 Unlock Room' }).click();
      const visitor = await joinRoom(browser, host.page.url(), 'Visitor');
      await expect(host.page.getByText('Visitor')).toBeVisible();
      await visitor.context.close();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
