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

export interface CreateRoomOptions {
  teamName?: string;
  roomTitle?: string;
  /** Radio label, e.g. 'T-Shirt' or 'Powers of 2'. */
  deck?: string;
  /** Radio label, e.g. 'Purple'. */
  accent?: string;
}

/** Host: open the create page, configure (optional) and create the room. */
export async function createRoom(browser: Browser, name: string, options: CreateRoomOptions = {}): Promise<RoomUser & { code: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/create');
  if (options.teamName) await page.getByLabel('Team Name').fill(options.teamName);
  if (options.roomTitle) await page.getByLabel('Room Title').fill(options.roomTitle);
  if (options.deck) await page.getByRole('radio', { name: new RegExp(`^${options.deck}`) }).click();
  if (options.accent) await page.getByRole('radio', { name: new RegExp(`^${options.accent}`) }).click();
  await fillAndSubmit(page, 'Your Name', name, 'Create Room');
  await page.waitForURL(/\/r\/[A-Z2-9]{5}$/);
  const code = page.url().split('/').pop()!;
  // The host is seated: the waiting room should render (a room title replaces
  // the default "Invite your team" headline).
  await expect(page.getByLabel('Room configuration')).toBeVisible();
  return { page, context, code };
}

/** Participant: open the shared room URL, type a name, join immediately. */
export async function joinRoom(browser: Browser, url: string, name: string): Promise<RoomUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await fillAndSubmit(page, 'Enter your name', name, 'Join Room');
  // Joined: the room renders — the config summary is shown to everyone (a
  // custom room title replaces the default "Waiting for the host…" headline).
  await expect(page.getByLabel('Room configuration')).toBeVisible();
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

/**
 * Assert a results headline stat (label + its value). 'Highest'/'Lowest'
 * also appear on the vote-card highlight tags, so we scope to the stats row.
 */
export async function expectStat(page: Page, label: string, value: string) {
  const statsRow = page.locator('main').getByText(label, { exact: true }).first().locator('..');
  await expect(statsRow).toContainText(value);
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
