# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.ts >> Homepage >> a coming-soon game opens its placeholder page and Back to Games works
- Location: tests\e2e\homepage.spec.ts:73:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'This or That' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'This or That' })

```

```yaml
- navigation:
  - button "previous" [disabled]:
    - img "previous"
  - text: 1/1
  - button "next" [disabled]:
    - img "next"
- img
- link "Next.js 15.5.23 (outdated) Webpack":
  - /url: https://nextjs.org/docs/messages/version-staleness
  - img
  - text: Next.js 15.5.23 (outdated) Webpack
- img
- dialog "Runtime Error":
  - text: Runtime Error
  - button "Copy Error Info":
    - img
  - button "No related documentation found" [disabled]:
    - img
  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools":
    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
    - img
  - paragraph: Jest worker encountered 2 child process exceptions, exceeding retry limit
  - paragraph: Call Stack 5
  - button "Show 5 ignore-listed frame(s)":
    - text: Show 5 ignore-listed frame(s)
    - img
- contentinfo:
  - region "Error feedback":
    - paragraph:
      - link "Was this helpful?":
        - /url: https://nextjs.org/telemetry#error-feedback
    - button "Mark as helpful"
    - button "Mark as not helpful"
- button "Open Next.js Dev Tools":
  - img
- button "Open issues overlay": 1 Issue
- button "Collapse issues badge":
  - img
- alert
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | 
  3   | /** The catalog card for a game — exact aria-label match avoids substring clashes. */
  4   | function card(page: Page, name: string, status: 'live' | 'soon' = 'soon') {
  5   |   return page.getByRole('link', { name: `${name} — ${status === 'live' ? 'Play now' : 'Coming soon'}`, exact: true });
  6   | }
  7   | 
  8   | test.describe('Homepage', () => {
  9   |   test('loads with the new platform positioning', async ({ page }) => {
  10  |     await page.goto('/');
  11  |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Break the ice.');
  12  |     await expect(page.getByText('✓ No signup')).toBeVisible();
  13  |     // Nav CTA is present.
  14  |     await expect(page.getByRole('link', { name: 'Create a room' })).toBeVisible();
  15  |   });
  16  | 
  17  |   test('features Planning Poker and Would You Rather as the live games', async ({ page }) => {
  18  |     await page.goto('/');
  19  |     await expect(page.getByText('⭐ Featured')).toBeVisible();
  20  |     await expect(page.getByRole('heading', { name: 'Planning Poker' }).first()).toBeVisible();
  21  |     // The three live games carry a LIVE badge; everything else says COMING SOON.
  22  |     await expect(page.getByText('LIVE', { exact: true })).toHaveCount(3);
  23  |     await expect(card(page, 'Planning Poker', 'live')).toBeVisible();
  24  |     await expect(card(page, 'Would You Rather', 'live')).toBeVisible();
  25  |     await expect(card(page, 'Most Likely To', 'live')).toBeVisible();
  26  |   });
  27  | 
  28  |   test('renders all 110 game cards across the category sections', async ({ page }) => {
  29  |     await page.goto('/');
  30  |     // All category sections are present.
  31  |     for (const title of ['Retrospective & Team Icebreakers', 'Fast Reaction & Speed', 'Guessing Games', 'Estimation Games', 'Funny & Social', 'Developer Games', 'Creative Games', 'Word Games', 'Competitive Games']) {
  32  |       await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible();
  33  |     }
  34  |     // Spot-check games from different categories.
  35  |     await expect(card(page, 'Most Likely To', 'live')).toBeVisible();
  36  |     await expect(card(page, 'Fastest Finger')).toBeVisible();
  37  |     await expect(card(page, 'Draw & Guess')).toBeVisible();
  38  |     await expect(card(page, 'Trivia Battle')).toBeVisible();
  39  |   });
  40  | 
  41  |   test('search filters the catalog instantly', async ({ page }) => {
  42  |     await page.goto('/');
  43  |     const search = page.getByRole('searchbox', { name: 'Search games' });
  44  |     await search.fill('poker');
  45  |     await expect(card(page, 'Planning Poker', 'live')).toBeVisible();
  46  |     await expect(card(page, 'Most Likely To', 'live')).toBeHidden();
  47  | 
  48  |     await search.fill('zzzzzz');
  49  |     await expect(page.getByText('No games found.')).toBeVisible();
  50  | 
  51  |     await search.fill('');
  52  |     await expect(card(page, 'Most Likely To', 'live')).toBeVisible();
  53  |   });
  54  | 
  55  |   test('category filter chips narrow the catalog', async ({ page }) => {
  56  |     await page.goto('/');
  57  |     await page.getByRole('button', { name: 'Icebreakers', exact: true }).click();
  58  |     await expect(card(page, 'Most Likely To', 'live')).toBeVisible();
  59  |     await expect(card(page, 'Planning Poker', 'live')).toBeHidden();
  60  |     await expect(card(page, 'Guess the Error')).toBeHidden();
  61  | 
  62  |     await page.getByRole('button', { name: 'All', exact: true }).click();
  63  |     await expect(card(page, 'Guess the Error')).toBeVisible();
  64  |   });
  65  | 
  66  |   test('CTA "Create a Game" leads to the room creation flow', async ({ page }) => {
  67  |     await page.goto('/');
  68  |     await page.getByRole('link', { name: 'Create a Game' }).first().click();
  69  |     await expect(page).toHaveURL(/\/create$/);
  70  |     await expect(page.getByRole('heading', { name: 'Create Room' })).toBeVisible();
  71  |   });
  72  | 
  73  |   test('a coming-soon game opens its placeholder page and Back to Games works', async ({ page }) => {
  74  |     await page.goto('/');
  75  |     await page.getByRole('link', { name: /This or That/ }).first().click();
  76  |     await expect(page).toHaveURL(/\/games\/this-or-that$/);
> 77  |     await expect(page.getByRole('heading', { name: 'This or That' })).toBeVisible();
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
  78  |     await expect(page.getByText("We're building this game!")).toBeVisible();
  79  |     await expect(page.getByText('COMING SOON')).toBeVisible();
  80  | 
  81  |     await page.getByRole('link', { name: /Back to Games/ }).click();
  82  |     await expect(page).toHaveURL(/\/games$/);
  83  |     await expect(page.getByRole('heading', { name: 'Explore Games' })).toBeVisible();
  84  |   });
  85  | 
  86  |   test('the live Would You Rather card leads to its create page', async ({ page }) => {
  87  |     await page.goto('/');
  88  |     await card(page, 'Would You Rather', 'live').click();
  89  |     await expect(page).toHaveURL(/\/games\/would-you-rather$/);
  90  |     await expect(page.getByRole('heading', { name: 'Would You Rather' })).toBeVisible();
  91  |     await expect(page.getByRole('button', { name: 'Create Room' })).toBeVisible();
  92  |   });
  93  | 
  94  |   test('the /games page respects a category from the URL', async ({ page }) => {
  95  |     await page.goto('/games?cat=developer');
  96  |     await expect(page.getByRole('heading', { name: 'Explore Games' })).toBeVisible();
  97  |     await expect(card(page, 'Guess the Error')).toBeVisible();
  98  |     await expect(card(page, 'Most Likely To')).toBeHidden();
  99  |   });
  100 | 
  101 |   test('mobile viewport: no horizontal overflow and cards are usable', async ({ browser }) => {
  102 |     const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  103 |     const page: Page = await context.newPage();
  104 |     try {
  105 |       await page.goto('/');
  106 |       await expect(page.getByRole('heading', { level: 1 })).toContainText('Break the ice.');
  107 |       await expect(card(page, 'Most Likely To', 'live')).toBeVisible();
  108 |       const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  109 |       expect(overflow).toBe(true);
  110 |       // Mobile nav hides the "Games" link but keeps the create CTA.
  111 |       await expect(page.getByRole('link', { name: 'Create a room' })).toBeVisible();
  112 |     } finally {
  113 |       await context.close();
  114 |     }
  115 |   });
  116 | 
  117 |   test('scroll CTA "Explore Games" jumps to the catalog', async ({ page }) => {
  118 |     await page.goto('/');
  119 |     await page.getByRole('link', { name: 'Explore Games' }).first().click();
  120 |     await expect(page.getByRole('heading', { name: 'Something for every meeting' })).toBeInViewport();
  121 |   });
  122 | });
  123 | 
```