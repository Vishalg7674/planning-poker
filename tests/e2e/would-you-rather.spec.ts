import { expect, test } from '@playwright/test';

test.describe('Would You Rather — pick a side', () => {
  test('host starts a dilemma, everyone chooses, reveal shows the split, next dilemma', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/games/would-you-rather');
    await host.getByLabel('Your Name').fill('Ada');
    await host.getByRole('button', { name: 'Start Game' }).click();
    await host.waitForURL(/room=/);
    await expect(host.getByText('Invite your team')).toBeVisible();
    const url = host.url();

    const rahulCtx = await browser.newContext();
    const rahul = await rahulCtx.newPage();
    await rahul.goto(url);
    await rahul.getByLabel('Your Name').fill('Rahul');
    await rahul.getByRole('button', { name: 'Join Game' }).click();
    await expect(rahul.getByText('Waiting for the host…')).toBeVisible();

    const priyaCtx = await browser.newContext();
    const priya = await priyaCtx.newPage();
    await priya.goto(url);
    await priya.getByLabel('Your Name').fill('Priya');
    await priya.getByRole('button', { name: 'Join Game' }).click();
    await expect(priya.getByText('Waiting for the host…')).toBeVisible();

    try {
      // Host starts the first dilemma — everyone sees the A/B cards.
      await host.getByRole('button', { name: 'Start the First Dilemma' }).click();
      await expect(host.getByText('Would you rather…')).toBeVisible();
      await expect(host.getByRole('button', { name: /^A/ })).toBeVisible();
      await expect(host.getByRole('button', { name: /^B/ })).toBeVisible();
      await expect(rahul.getByText('Would you rather…')).toBeVisible();
      await expect(host.getByText('0 / 3 chosen')).toBeVisible();

      // Everyone picks a side. Host + Priya take A, Rahul takes B → 2:1.
      await host.getByRole('button', { name: /^A/ }).click();
      await expect(host.getByText(/You picked/)).toBeVisible();
      await rahul.getByRole('button', { name: /^B/ }).click();
      await priya.getByRole('button', { name: /^A/ }).click();

      await expect(host.getByText('Everyone has chosen · 3 / 3')).toBeVisible();

      // Reveal — the split is public and A wins.
      await host.getByRole('button', { name: 'Reveal the Split' }).click();
      await expect(host.getByText('Who chose what')).toBeVisible();
      await expect(host.getByLabel('Vote split')).toBeVisible();
      await expect(host.getByText('67% of the table picked this side.')).toBeVisible();
      await expect(rahul.getByText('Who chose what')).toBeVisible();

      // Next dilemma continues in the same room with a fresh round.
      await host.getByRole('button', { name: /Next Dilemma/ }).click();
      await expect(host.getByText('Would you rather…')).toBeVisible();
      await expect(host.getByText('0 / 3 chosen')).toBeVisible();
      expect(host.url()).toBe(url);
    } finally {
      await hostCtx.close();
      await rahulCtx.close();
      await priyaCtx.close();
    }
  });
});
