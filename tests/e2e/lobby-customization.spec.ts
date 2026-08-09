import { expect, test } from '@playwright/test';
import { createRoom, joinRoom } from './helpers';

test.describe('Lobby customization', () => {
  test('host configures the room and everyone sees the configuration', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada', {
      teamName: 'Frontend Team',
      roomTitle: 'Sprint 24 Planning',
      deck: 'T-Shirt',
      accent: 'Purple',
    });
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // The room title + team name lead the lobby (header + panel both show it).
      await expect(host.page.getByText('Sprint 24 Planning').first()).toBeVisible();
      await expect(host.page.getByText('Frontend Team').first()).toBeVisible();

      // The table configuration summary lists deck, timer and accent.
      const config = host.page.getByLabel('Room configuration');
      await expect(config).toContainText('T-Shirt');
      await expect(config).toContainText('Timer');
      await expect(config).toContainText('purple');

      // Participants see the same configuration but no host controls.
      await expect(rahul.page.getByText('Sprint 24 Planning').first()).toBeVisible();
      await expect(rahul.page.getByLabel('Room configuration')).toContainText('T-Shirt');
      await expect(rahul.page.getByRole('button', { name: 'Start Voting' })).toHaveCount(0);

      // The room root carries the accent so the table re-skins.
      await expect(host.page.locator('[data-accent="purple"]')).toHaveCount(1);
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
