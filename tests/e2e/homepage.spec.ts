import { expect, test, type Page } from '@playwright/test';

/** The catalog card for a game — exact aria-label match avoids substring clashes. */
function card(page: Page, name: string) {
  return page.getByRole('link', { name: `${name} — Play now`, exact: true });
}

test.describe('Homepage', () => {
  test('loads with the new platform positioning', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Break the ice.');
    await expect(page.getByText('✓ No signup')).toBeVisible();
    // Nav CTA is present.
    await expect(page.getByRole('link', { name: 'Create a room' })).toBeVisible();
  });

  test('features Planning Poker as the live game', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('⭐ Featured')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Planning Poker' }).first()).toBeVisible();
    // Every catalog game carries the LIVE badge.
    await expect(page.getByText('LIVE', { exact: true })).toHaveCount(112);
  });

  test('renders all 112 game cards across the category sections', async ({ page }) => {
    await page.goto('/');
    // All category sections are present.
    for (const title of ['Retrospective & Team Icebreakers', 'Fast Reaction & Speed', 'Guessing Games', 'Estimation Games', 'Funny & Social', 'Developer Games', 'Creative Games', 'Word Games', 'Competitive Games', 'Agile Activities']) {
      await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
    }
    // Spot-check games from different categories.
    await expect(card(page, 'Most Likely To')).toBeVisible();
    await expect(card(page, 'Fastest Finger')).toBeVisible();
    await expect(card(page, 'Draw & Guess')).toBeVisible();
    await expect(card(page, 'Team Health Check')).toBeVisible();
    await expect(card(page, 'Live Poll')).toBeVisible();
    // Trivia Battle went live with the engine rollout — expect the live badge.
    await expect(card(page, 'Trivia Battle')).toBeVisible();
  });

  test('search filters the catalog instantly', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'Search games' });
    await search.fill('poker');
    await expect(card(page, 'Planning Poker')).toBeVisible();
    await expect(card(page, 'Most Likely To')).toBeHidden();

    await search.fill('zzzzzz');
    await expect(page.getByText('No games found.')).toBeVisible();

    await search.fill('');
    await expect(card(page, 'Most Likely To')).toBeVisible();
  });

  test('category filter chips narrow the catalog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Icebreakers', exact: true }).click();
    await expect(card(page, 'Most Likely To')).toBeVisible();
    await expect(card(page, 'Planning Poker')).toBeHidden();
    await expect(card(page, 'Fastest Finger')).toBeHidden();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(card(page, 'Fastest Finger')).toBeVisible();
  });

  test('CTA "Create a Game" leads to the room creation flow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Create a Game' }).first().click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByRole('heading', { name: 'Create Room' })).toBeVisible();
  });

  test('a live game opens its real room page and Back to Games works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Fastest Finger/ }).first().click();
    await expect(page).toHaveURL(/\/games\/fastest-finger$/);
    // Fastest Finger is a live quiz — the shared GameRoom entry screen shows.
    await expect(page.getByRole('heading', { name: 'Fastest Finger' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

    await page.getByRole('link', { name: /Back to games/i }).click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(page.getByRole('heading', { name: 'Explore Games' })).toBeVisible();
  });

  test('the /games page respects a category from the URL', async ({ page }) => {
    await page.goto('/games?cat=developer');
    await expect(page.getByRole('heading', { name: 'Explore Games' })).toBeVisible();
    await expect(card(page, 'Guess the Error')).toBeVisible();
    await expect(card(page, 'Most Likely To')).toBeHidden();
  });

  test('mobile viewport: no horizontal overflow and cards are usable', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page: Page = await context.newPage();
    try {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Break the ice.');
    await expect(card(page, 'Most Likely To')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(overflow).toBe(true);
      // Mobile nav hides the "Games" link but keeps the create CTA.
      await expect(page.getByRole('link', { name: 'Create a room' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('scroll CTA "Explore Games" jumps to the catalog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Explore Games' }).first().click();
    await expect(page.getByRole('heading', { name: 'Something for every meeting' })).toBeInViewport();
  });
});
