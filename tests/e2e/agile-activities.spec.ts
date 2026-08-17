import { expect, test, type Page } from '@playwright/test';

/** Click the star rating at row `categoryIndex`, value `value` (1-based). */
async function rate(page: Page, categoryIndex: number, value: number) {
  await page.getByRole('button', { name: `${value} out of 5` }).nth(categoryIndex).click();
}

test.describe('Team Health Check', () => {
  test('host creates, team rates every area, reveal shows averages, New Health Check resets', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/games/team-health');
    await host.getByLabel('Your Name').fill('Ada');
    await host.getByLabel('Title').fill('Sprint 24 Team Health');
    await host.getByRole('button', { name: 'Create Health Check' }).click();
    await host.waitForURL(/room=/);
    await expect(host.getByText('Invite your team')).toBeVisible();
    await expect(host.getByText('Sprint 24 Team Health')).toBeVisible();
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
      // Host starts the check — everyone sees the star rating rows.
      await host.getByRole('button', { name: 'Start Health Check' }).click();
      await expect(host.getByText('Rate each area from 1 to 5')).toBeVisible();
      await expect(rahul.getByText('Rate each area from 1 to 5')).toBeVisible();
      await expect(host.getByText('0 / 3 submitted')).toBeVisible();

      // Rate all six categories (host 4s, Rahul 5s, Priya 3s with one 2).
      for (let i = 0; i < 6; i++) await rate(host, i, 4);
      for (let i = 0; i < 6; i++) await rate(rahul, i, 5);
      for (let i = 0; i < 6; i++) await rate(priya, i, i === 3 ? 2 : 3);

      await host.getByRole('button', { name: 'Submit Health Check' }).click();
      await expect(host.getByRole('heading', { name: 'Submitted' })).toBeVisible();
      await rahul.getByRole('button', { name: 'Submit Health Check' }).click();
      await priya.getByRole('button', { name: 'Submit Health Check' }).click();
      await expect(host.getByText('Everyone has submitted · 3 / 3')).toBeVisible();

      // Reveal — overall + per-category averages, health verdict, bars.
      await host.getByRole('button', { name: 'Reveal Results' }).click();
      await expect(host.getByText('Check 1 · Results')).toBeVisible();
      await expect(host.getByText(/Healthy/)).toBeVisible();
      await expect(host.getByText(/3 responses · anonymous mode/)).toBeVisible();
      await expect(host.getByText('4 / 5').first()).toBeVisible(); // (4+5+3)/3 for most categories
      await expect(rahul.getByText('Check 1 · Results')).toBeVisible();

      // New Health Check — same room, fresh round, no responses.
      await host.getByRole('button', { name: /New Health Check/ }).click();
      await expect(host.getByText('0 / 3 submitted')).toBeVisible();
      expect(host.url()).toBe(url);
    } finally {
      await hostCtx.close();
      await rahulCtx.close();
      await priyaCtx.close();
    }
  });
});

test.describe('Live Poll', () => {
  test('host asks a question, team votes, reveal crowns the winner, New Poll resets', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/games/live-poll');
    await host.getByLabel('Your Name').fill('Ada');
    await host.getByLabel('Question').fill('Ship on Friday?');
    await host.getByRole('button', { name: 'Create Poll' }).click();
    await host.waitForURL(/room=/);
    await expect(host.getByText('Invite your team')).toBeVisible();
    await expect(host.getByText('Ship on Friday?')).toBeVisible();
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
      await host.getByRole('button', { name: 'Start Poll' }).click();
      await expect(host.getByText('Ship on Friday?')).toBeVisible();
      await expect(host.getByText('0 / 3 voted')).toBeVisible();

      // Yes, Yes, No → Yes wins 2:1. Selecting an option is a draft — the
      // vote only lands on Submit Vote (and locks immediately after).
      await host.getByRole('button', { name: /Yes/ }).click();
      await host.getByRole('button', { name: 'Submit Vote' }).click();
      await expect(host.getByRole('heading', { name: 'Vote submitted' })).toBeVisible();
      await rahul.getByRole('button', { name: /Yes/ }).click();
      await rahul.getByRole('button', { name: 'Submit Vote' }).click();
      await priya.getByRole('button', { name: /No/ }).click();
      await priya.getByRole('button', { name: 'Submit Vote' }).click();
      await expect(host.getByText('Everyone has voted · 3 / 3')).toBeVisible();

      await host.getByRole('button', { name: 'Reveal Results' }).click();
      await expect(host.getByText('Poll 1 · Results')).toBeVisible();
      await expect(host.getByText('🏆')).toBeVisible();
      await expect(host.getByText('2 votes · 67% of 3 selections')).toBeVisible();
      await expect(host.getByText('1 · 33%')).toBeVisible(); // No: 1 vote, 33%
      await expect(rahul.getByText('Poll 1 · Results')).toBeVisible();

      await host.getByRole('button', { name: /New Poll/ }).click();
      await expect(host.getByText('0 / 3 voted')).toBeVisible();
      expect(host.url()).toBe(url);
    } finally {
      await hostCtx.close();
      await rahulCtx.close();
      await priyaCtx.close();
    }
  });
});

test.describe('One room → many activities', () => {
  test('host switches the room from Live Poll to Team Health — same code, everyone follows', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/games/live-poll');
    await host.getByLabel('Your Name').fill('Ada');
    await host.getByLabel('Question').fill('Which retro tool?');
    await host.getByRole('button', { name: 'Create Poll' }).click();
    await host.waitForURL(/room=/);
    await expect(host.getByText('Invite your team')).toBeVisible();
    const url = host.url();
    const roomCode = new URL(url).searchParams.get('room');

    const rahulCtx = await browser.newContext();
    const rahul = await rahulCtx.newPage();
    await rahul.goto(url);
    await rahul.getByLabel('Your Name').fill('Rahul');
    await rahul.getByRole('button', { name: 'Join Game' }).click();
    await expect(rahul.getByText('Waiting for the host…')).toBeVisible();

    try {
      // Host switches the SAME room to Team Health from the side panel.
      await host.getByRole('button', { name: '❤️ Team Health' }).click();
      await host.waitForURL(/\/games\/team-health\?room=/);
      await expect(host.getByText('Invite your team')).toBeVisible();
      expect(new URL(host.url()).searchParams.get('room')).toBe(roomCode);

      // The participant follows automatically with their seat preserved.
      await rahul.waitForURL(/\/games\/team-health\?room=/);
      await expect(rahul.getByText('Waiting for the host…')).toBeVisible();
      expect(new URL(rahul.url()).searchParams.get('room')).toBe(roomCode);

      // The room really is team-health now: host starts the check and Rahul
      // can rate — still in the same room.
      await host.getByRole('button', { name: 'Start Health Check' }).click();
      await expect(host.getByText('Rate each area from 1 to 5')).toBeVisible();
      for (let i = 0; i < 6; i++) await rate(host, i, 4);
      await host.getByRole('button', { name: 'Submit Health Check' }).click();
      for (let i = 0; i < 6; i++) await rate(rahul, i, 3);
      await rahul.getByRole('button', { name: 'Submit Health Check' }).click();
      await expect(host.getByText('Everyone has submitted · 2 / 2')).toBeVisible();
    } finally {
      await hostCtx.close();
      await rahulCtx.close();
    }
  });
});
