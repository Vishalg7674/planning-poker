import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Would You Rather — full multiplayer flow on the shared /r/CODE room
 * architecture. Each user gets its own browser context (independent
 * sessionStorage identity), exactly like separate devices.
 */

const Q1 = { a: 'Have the ability to fly', b: 'Have the ability to be invisible' };
const Q2 = { a: 'Always be 10 minutes early', b: 'Always be 10 minutes late' };

interface WyrUser {
  page: Page;
  context: BrowserContext;
}

/** Host: create a WYR room with exactly the two custom questions above. */
async function createWyrRoom(browser: Browser, name: string): Promise<WyrUser & { code: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/games/would-you-rather');
  await page.getByRole('button', { name: 'Clear' }).click();
  await addQuestion(page, Q1.a, Q1.b);
  await addQuestion(page, Q2.a, Q2.b);
  await fillAndSubmit(page, 'Your Name', name, 'Create Room');
  await page.waitForURL(/\/r\/[A-Z2-9]{5}$/);
  const code = page.url().split('/').pop()!;
  await expect(page.getByText('2 questions ready · 1 person is at the table.')).toBeVisible();
  return { page, context, code };
}

/** Participant: open the shared link, type a name, join the WYR room. */
async function joinWyr(browser: Browser, url: string, name: string): Promise<WyrUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await fillAndSubmit(page, 'Enter your name', name, 'Join Room');
  await expect(page.getByText(/questions ready/)).toBeVisible();
  return { page, context };
}

/** Add one custom A/B question on the create page. */
async function addQuestion(page: Page, a: string, b: string) {
  await page.getByLabel('Custom option A').fill(a);
  await page.getByLabel('Custom option B').fill(b);
  await page.getByRole('button', { name: 'Add question' }).click();
}

/** Vote for a side on the physical A/B cards. */
async function pick(page: Page, side: 'A' | 'B', option: string) {
  await page.getByRole('button', { name: `Vote ${side}: ${option}`, exact: true }).click();
}

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

test.describe('Would You Rather', () => {
  test('host creates, everyone votes A/B, reveal shows the split, next question resets', async ({ browser }) => {
    const host = await createWyrRoom(browser, 'Ada');
    const rahul = await joinWyr(browser, host.page.url(), 'Rahul');
    const priya = await joinWyr(browser, host.page.url(), 'Priya');
    try {
      // Everyone at the table in realtime.
      await expect(host.page.getByText('2 questions ready · 3 people are at the table.')).toBeVisible();
      await expect(rahul.page.getByText('Waiting for the host…')).toBeVisible();

      // Host starts the game.
      await host.page.getByRole('button', { name: 'Start Game' }).click();

      // Everyone receives the question.
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByText(`Would you rather ${Q1.a} or ${Q1.b}?`)).toBeVisible();
        await expect(page.getByRole('button', { name: `Vote A: ${Q1.a}`, exact: true })).toBeEnabled();
      }

      // Rahul picks A — the pick locks permanently.
      await pick(rahul.page, 'A', Q1.a);
      await expect(rahul.page.getByRole('button', { name: `Vote B: ${Q1.b}`, exact: true })).toBeDisabled();
      await expect(rahul.page.getByRole('button', { name: `Vote A: ${Q1.a}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(rahul.page.getByText(/Vote locked/)).toBeVisible();

      // Host sees live status — who voted, never what they picked.
      await expect(host.page.getByText('1 / 3 picked')).toBeVisible();
      await expect(host.page.locator('aside')).toContainText('Voted');
      await expect(host.page.locator('aside')).not.toContainText(Q1.a);

      // Everyone else votes.
      await pick(priya.page, 'B', Q1.b);
      await pick(host.page, 'A', Q1.a);
      await expect(host.page.getByText('Everyone picked · 3 / 3')).toBeVisible();

      // Reveal → the split is public for everyone.
      await host.page.getByRole('button', { name: 'Reveal Picks' }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByText('2 picks · 67%')).toBeVisible();
        await expect(page.getByText('1 pick · 33%')).toBeVisible();
      }

      // Next question — votes reset, everyone can pick again.
      await host.page.getByRole('button', { name: /Next Question/ }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByText(`Would you rather ${Q2.a} or ${Q2.b}?`)).toBeVisible();
        await expect(page.getByRole('button', { name: `Vote A: ${Q2.a}`, exact: true })).toBeEnabled();
      }

      // Everyone votes again on question 2.
      await pick(rahul.page, 'B', Q2.b);
      await pick(priya.page, 'A', Q2.a);
      await pick(host.page, 'B', Q2.b);
      await expect(host.page.getByText('Everyone picked · 3 / 3')).toBeVisible();
      await host.page.getByRole('button', { name: 'Reveal Picks' }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByText('2 picks · 67%')).toBeVisible();
      }

      // Last question → host ends the session; everyone is disconnected.
      await expect(host.page.getByText('That was the last question.')).toBeVisible();
      await host.page.getByRole('button', { name: 'End Session' }).click();
      await host.page.getByRole('button', { name: 'End session & clear memory' }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByRole('heading', { name: 'The room is gone' })).toBeVisible();
      }
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });

  test('a participant who does not pick appears as a non-voter in the reveal', async ({ browser }) => {
    const host = await createWyrRoom(browser, 'Ada');
    const noel = await joinWyr(browser, host.page.url(), 'Noel');
    try {
      await host.page.getByRole('button', { name: 'Start Game' }).click();
      await pick(host.page, 'A', Q1.a);
      // Host reveals while Noel is still thinking (WYR is host-paced).
      await host.page.getByRole('button', { name: 'Reveal Picks' }).click();

      await expect(host.page.getByText('Noel didn’t pick')).toBeVisible();
      await expect(noel.page.getByText('Noel didn’t pick')).toBeVisible();
      await expect(host.page.getByText('1 pick · 100%')).toBeVisible();
    } finally {
      await host.context.close();
      await noel.context.close();
    }
  });

  test('participants never see host controls', async ({ browser }) => {
    const host = await createWyrRoom(browser, 'Ada');
    const rahul = await joinWyr(browser, host.page.url(), 'Rahul');
    try {
      // Waiting: no start button for the participant.
      await expect(rahul.page.getByRole('button', { name: 'Start Game' })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: /Copy Invite/ })).toHaveCount(0);

      await host.page.getByRole('button', { name: 'Start Game' }).click();
      await pick(rahul.page, 'A', Q1.a);
      // Voting: no reveal button for the participant.
      await expect(rahul.page.getByRole('button', { name: 'Reveal Picks' })).toHaveCount(0);
      await pick(host.page, 'B', Q1.b);

      await host.page.getByRole('button', { name: 'Reveal Picks' }).click();
      // Revealed: no next-question control for the participant.
      await expect(rahul.page.getByRole('button', { name: /Next Question/ })).toHaveCount(0);
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
