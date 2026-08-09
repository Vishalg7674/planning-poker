import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Reusable Playwright helpers. Each user runs in its OWN browser context so
 * identities (sessionStorage) are fully independent, exactly like separate
 * browsers on different machines.
 */

export interface RoomUser {
  page: Page;
  context: BrowserContext;
}

/** Host: open the create page, enter a name, create the room, land in it. */
export async function createRoom(browser: Browser, name: string): Promise<RoomUser & { code: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/create');
  await fillAndSubmit(page, 'Your Name', name, 'Create Room');
  await page.waitForURL(/\/r\/[A-Z2-9]{5}$/);
  const code = page.url().split('/').pop()!;
  // The host is seated: the waiting room should render with invite copy.
  await expect(page.getByText('Invite your team')).toBeVisible();
  return { page, context, code };
}

/** Participant: open the shared room URL, type a name, join immediately. */
export async function joinRoom(browser: Browser, url: string, name: string): Promise<RoomUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await fillAndSubmit(page, 'Enter your name', name, 'Join Room');
  // Joined: the room renders and the participant sees the waiting copy.
  await expect(page.getByText('Waiting for the host…')).toBeVisible();
  return { page, context };
}

/** Host-only: start the round. */
export async function startVoting(page: Page) {
  await page.getByRole('button', { name: 'Start Voting' }).click();
}

/** Cast a vote by card value (e.g. '8'). Exact match so '8' never hits '89'. */
export async function vote(page: Page, value: string) {
  await page.getByRole('button', { name: `Vote ${value}`, exact: true }).click();
}

/** Host-only: reveal the round. */
export async function reveal(page: Page) {
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
}

/** Assert a results headline stat (label + its value). */
export async function expectStat(page: Page, label: string, value: string) {
  const stat = page.getByText(label, { exact: true }).locator('..');
  await expect(stat).toContainText(value);
}

/**
 * Fill a form field and submit, tolerating the brief React hydration window
 * after a server-rendered page loads: if hydration reset the field, the value
 * won't stick, so we retry a few times before giving up.
 */
async function fillAndSubmit(page: Page, label: string, value: string, buttonName: string) {
  const input = page.getByLabel(label);
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.fill(value);
    if ((await input.inputValue()) === value) {
      await page.getByRole('button', { name: buttonName }).click();
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Could not fill "${label}" with "${value}" (hydration race?)`);
}
