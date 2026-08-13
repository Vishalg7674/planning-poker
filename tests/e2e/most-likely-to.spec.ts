import { expect, test } from '@playwright/test';

test.describe('Most Likely To — pick a teammate', () => {
  test('host starts a prompt, everyone picks, reveal crowns the winner, next prompt', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/games/most-likely-to');
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
      // Host starts the first prompt — everyone sees it.
      await host.getByRole('button', { name: 'Start the First Prompt' }).click();
      await expect(host.getByText(/Most likely to/)).toBeVisible();
      await expect(rahul.getByText(/Most likely to/)).toBeVisible();
      await expect(host.getByText('0 / 3 picked')).toBeVisible();

      // Nobody can pick themselves — their own card is disabled.
      await expect(host.getByRole('button', { name: /Ada/ }).first()).toBeDisabled();
      await expect(rahul.getByRole('button', { name: /Rahul/ }).first()).toBeDisabled();

      // Everyone picks someone else. Host: Rahul, Rahul: Priya, Priya: Ada.
      await host.getByRole('button', { name: /Rahul/ }).first().click();
      await expect(host.getByText(/You picked Rahul/)).toBeVisible();
      await rahul.getByRole('button', { name: /Priya/ }).first().click();
      await priya.getByRole('button', { name: /Ada/ }).first().click();

      await expect(host.getByText('Everyone has picked · 3 / 3')).toBeVisible();

      // Reveal — everyone tied at one pick each.
      await host.getByRole('button', { name: 'Reveal the Votes' }).click();
      await expect(host.getByText('It’s a tie at the top!')).toBeVisible();
      await expect(host.getByText('1 pick each.')).toBeVisible();
      // The reveal is public: who picked whom is listed.
      await expect(host.getByText('Who picked whom')).toBeVisible();
      await expect(rahul.getByText('Who picked whom')).toBeVisible();

      // Next prompt continues in the same room with a fresh round.
      await host.getByRole('button', { name: /Next Prompt/ }).click();
      await expect(host.getByText(/Most likely to/)).toBeVisible();
      await expect(host.getByText('0 / 3 picked')).toBeVisible();
      expect(host.url()).toBe(url);
    } finally {
      await hostCtx.close();
      await rahulCtx.close();
      await priyaCtx.close();
    }
  });
});
