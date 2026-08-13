import { expect, test } from '@playwright/test';
import { createRoom, expectStat, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('New story — multiple rounds in the same room', () => {
  test('round 1 → finalize → New → story form → round 2, same URL, votes reset for everyone', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    const priya = await joinRoom(browser, host.page.url(), 'Priya');
    const amit = await joinRoom(browser, host.page.url(), 'Amit');
    const roomUrl = host.page.url();
    try {
      // ---- Round 1: no story entered, so it falls back to "Round 1" ----
      await startVoting(host.page);
      for (const page of [host.page, rahul.page, priya.page, amit.page]) {
        await expect(page.getByText('Round 1')).toBeVisible();
        await expect(page.getByText('Choose your estimate')).toBeVisible();
      }
      await vote(rahul.page, '5');
      await vote(priya.page, '5');
      await vote(amit.page, '8');
      await vote(host.page, '13');
      await expect(host.page.getByText('Everyone has voted · 4 / 4')).toBeVisible();
      await reveal(host.page);
      await expectStat(host.page, 'Votes', '4 / 4');

      // ---- Host starts the next story in the SAME room ----
      await host.page.getByRole('button', { name: '+ New Story' }).click();
      const dialog = host.page.getByRole('dialog', { name: 'Start a new story?' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

      // The room comes back to the waiting room — URL and participants stay.
      await expect(host.page.getByText('Story', { exact: true })).toBeVisible();
      await expect(host.page.getByLabel('Story ID (optional)')).toBeVisible();
      expect(host.page.url()).toBe(roomUrl);

      // ---- Configure the new story and start round 2 ----
      await host.page.getByLabel('Story ID (optional)').fill('PROJ-143');
      await host.page.getByLabel('Story Title').fill('User Profile');
      await host.page.getByLabel('Description (optional)').fill('As a user, I want to update my profile.');
      await startVoting(host.page);

      // Every client sees the new story with a completely fresh round.
      for (const page of [host.page, rahul.page, priya.page, amit.page]) {
        await expect(page.getByText('PROJ-143')).toBeVisible();
        await expect(page.getByText('User Profile')).toBeVisible();
        await expect(page.getByText('0 / 4 voted')).toBeVisible();
      }
      // Previous votes must not leak: the round-1 voters can pick a card again.
      await expect(rahul.page.getByRole('button', { name: 'Vote 5', exact: true })).toBeEnabled();

      // ---- Everyone votes again; reveal works again ----
      await vote(rahul.page, '5');
      await vote(priya.page, '5');
      await vote(amit.page, '8');
      await vote(host.page, '13');
      await expect(host.page.getByText('Everyone has voted · 4 / 4')).toBeVisible();
      await reveal(host.page);
      await expectStat(host.page, 'Votes', '4 / 4');
      // Results are attributed to the new story, not the old one.
      await expect(host.page.getByText('User Profile')).toBeVisible();
      expect(host.page.url()).toBe(roomUrl);
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
      await amit.context.close();
    }
  });

  test('a participant who refreshes after New returns to the current story, not the old one', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // Round 1: Rahul votes 5, host votes 8 — moderate, no result modal.
      await startVoting(host.page);
      await vote(rahul.page, '5');
      await vote(host.page, '8');
      await reveal(host.page);
      await expect(host.page.getByRole('button', { name: '+ New Story' })).toBeVisible();

      // Start the next story.
      await host.page.getByRole('button', { name: '+ New Story' }).click();
      await host.page.getByRole('dialog', { name: 'Start a new story?' }).getByRole('button', { name: 'Continue', exact: true }).click();
      await host.page.getByLabel('Story Title').fill('Login Flow');
      await startVoting(host.page);
      await expect(host.page.getByText('0 / 2 voted')).toBeVisible();

      // Rahul refreshes mid-round-2: he rejoins the CURRENT round, votes empty.
      await rahul.page.reload();
      await expect(rahul.page.getByText('Login Flow')).toBeVisible();
      await expect(rahul.page.getByText('0 / 2 voted')).toBeVisible();
      await expect(rahul.page.getByRole('button', { name: 'Vote 5', exact: true })).toBeEnabled();

      // He can vote again — round 1's vote did not follow him.
      await vote(rahul.page, '5');
      await expect(host.page.getByText('1 / 2 voted')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });

  test('host refresh after New keeps the new waiting room and host controls', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await startVoting(host.page);
      await vote(rahul.page, '5');
      await vote(host.page, '8');
      await reveal(host.page);

      // New → waiting room.
      await host.page.getByRole('button', { name: '+ New Story' }).click();
      await host.page.getByRole('dialog', { name: 'Start a new story?' }).getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(host.page.getByLabel('Story Title')).toBeVisible();

      // Host refreshes while waiting for the next story: still host, still here.
      await host.page.reload();
      await expect(host.page.getByLabel('Story Title')).toBeVisible();
      await host.page.getByLabel('Story Title').fill('Notifications');
      await startVoting(host.page);
      await expect(host.page.getByText('Notifications')).toBeVisible();
      await expect(host.page.getByText('0 / 2 voted')).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
