import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, startVoting, vote } from './helpers';

test.describe('Participant presence', () => {
  test('statuses move from Joined → Thinking → Voted for everyone, in realtime', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    try {
      // Waiting room: everyone is "Joined".
      await expect(host.page.getByText('Joined')).toHaveCount(3);

      await startVoting(host.page);

      // Voting: everyone is "Thinking" until they pick a card.
      await expect(rahul.page.getByText('Thinking')).toHaveCount(3);
      await expect(host.page.getByText('3 people')).toBeVisible();

      await vote(host.page, '5');
      await vote(rahul.page, '8');

      // Host sees 2 Voted + 1 Thinking in the participant panel (the reveal
      // bar's "N / M voted" counter also contains "voted", so scope there).
      const hostPanel = host.page.getByText('Participants').locator('..');
      await expect(hostPanel.getByText('Voted')).toHaveCount(2);
      await expect(hostPanel.getByText('Thinking')).toHaveCount(1);

      // Participant count stays live.
      await expect(host.page.getByText('3 people')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });

  test('closing a tab marks that participant disconnected for everyone', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await rahul.context.close();
      // The host's participant list reflects the drop.
      await expect(host.page.getByText('Disconnected')).toBeVisible({ timeout: 10_000 });
    } finally {
      await host.context.close();
    }
  });
});
