import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Most Likely To — full multiplayer flow on the shared /r/CODE room
 * architecture. Each user gets its own browser context (independent
 * sessionStorage identity), exactly like separate devices.
 */

const P1 = 'Forget their laptop at home on the day of the big demo';
const P2 = 'Reply-all to the entire company by accident';

interface MltUser {
  page: Page;
  context: BrowserContext;
}

/** Host: create an MLT room with exactly the two custom prompts above. */
async function createMltRoom(browser: Browser, name: string): Promise<MltUser & { code: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/games/most-likely-to');
  await page.getByRole('button', { name: 'Clear' }).click();
  await addPrompt(page, P1);
  await addPrompt(page, P2);
  await fillAndSubmit(page, 'Your Name', name, 'Create Room');
  await page.waitForURL(/\/r\/[A-Z2-9]{5}$/);
  const code = page.url().split('/').pop()!;
  await expect(page.getByText('2 prompts ready · 1 person is at the table.')).toBeVisible();
  return { page, context, code };
}

/** Participant: open the shared link, type a name, join the MLT room. */
async function joinMlt(browser: Browser, url: string, name: string): Promise<MltUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await fillAndSubmit(page, 'Enter your name', name, 'Join Room');
  await expect(page.getByText(/prompts ready/)).toBeVisible();
  return { page, context };
}

/** Add one custom prompt on the create page. */
async function addPrompt(page: Page, prompt: string) {
  // The group wrapper is also labelled "Add a custom prompt" — exact role avoids the clash.
  await page.getByRole('textbox', { name: 'Custom prompt' }).fill(prompt);
  await page.getByRole('button', { name: 'Add prompt' }).click();
}

/** Nominate a teammate on the voting chips. */
async function nominate(page: Page, name: string) {
  await page.getByRole('button', { name: `Nominate ${name}`, exact: true }).click();
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

test.describe('Most Likely To', () => {
  test('host creates, everyone nominates, crown + totals are revealed, finish crowns a champion, play again restarts', async ({ browser }) => {
    const host = await createMltRoom(browser, 'Ada');
    const rahul = await joinMlt(browser, host.page.url(), 'Rahul');
    const priya = await joinMlt(browser, host.page.url(), 'Priya');
    try {
      // Everyone at the table in realtime.
      await expect(host.page.getByText('2 prompts ready · 3 people are at the table.')).toBeVisible();

      // Host starts the game.
      await host.page.getByRole('button', { name: 'Start Game' }).click();

      // Everyone receives the prompt and sees chips for both teammates — never a self-chip.
      const everyone = [
        { page: host.page, self: 'Ada' },
        { page: rahul.page, self: 'Rahul' },
        { page: priya.page, self: 'Priya' },
      ];
      for (const { page, self } of everyone) {
        await expect(page.getByText(`Who is most likely to ${P1}?`)).toBeVisible();
        for (const other of ['Ada', 'Rahul', 'Priya'].filter((n) => n !== self)) {
          await expect(page.getByRole('button', { name: `Nominate ${other}`, exact: true })).toBeEnabled();
        }
      }

      // Round 1: Rahul gets two nominations, Priya one → Rahul crowned.
      await nominate(host.page, 'Rahul');
      await nominate(rahul.page, 'Priya');
      await nominate(priya.page, 'Rahul');
      // A nomination locks: Rahul can't change his pick.
      await expect(rahul.page.getByRole('button', { name: 'Nominate Priya', exact: true })).toBeDisabled();
      await expect(rahul.page.getByText(/Nomination locked/)).toBeVisible();
      // Everyone nominated; the host reveals.
      await expect(host.page.getByText('Everyone nominated · 3 / 3')).toBeVisible();
      await host.page.getByRole('button', { name: 'Reveal Nominations' }).click();

      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByRole('heading', { name: '👑 Rahul takes the crown!' })).toBeVisible();
        await expect(page.getByText('Total scores')).toBeVisible();
      }

      // Next prompt — nominations reset, everyone can pick again.
      await host.page.getByRole('button', { name: 'Next Prompt →' }).click();
      for (const { page, self } of everyone) {
        await expect(page.getByText(`Who is most likely to ${P2}?`)).toBeVisible();
        for (const other of ['Ada', 'Rahul', 'Priya'].filter((n) => n !== self)) {
          await expect(page.getByRole('button', { name: `Nominate ${other}`, exact: true })).toBeEnabled();
        }
      }

      // Round 2: Priya gets two nominations, Ada one → Priya crowned.
      await nominate(host.page, 'Priya');
      await nominate(rahul.page, 'Priya');
      await nominate(priya.page, 'Ada');
      await expect(host.page.getByText('Everyone nominated · 3 / 3')).toBeVisible();
      await host.page.getByRole('button', { name: 'Reveal Nominations' }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByRole('heading', { name: '👑 Priya takes the crown!' })).toBeVisible();
      }

      // Last prompt → the host finishes; the WinnerModal crowns the champion.
      await host.page.getByRole('button', { name: /Finish Game/ }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByRole('dialog', { name: 'Game Complete!' })).toBeVisible();
        // Priya: 100 crown (round 1) + 100 crown (round 2) = 200 — the champion.
        await expect(page.getByRole('status', { name: 'Winner: Priya with 200 points' })).toBeVisible();
      }

      // Play Again returns everyone to the waiting room (session scores kept).
      await host.page.getByRole('button', { name: 'Play Again' }).click();
      for (const page of [host.page, rahul.page, priya.page]) {
        await expect(page.getByText('2 prompts ready · 3 people are at the table.')).toBeVisible();
      }
      await expect(host.page.getByRole('button', { name: 'Start Game' })).toBeEnabled();
    } finally {
      await host.context.close();
      await rahul.context.close();
      await priya.context.close();
    }
  });

  test('a participant who does not nominate appears in the reveal', async ({ browser }) => {
    const host = await createMltRoom(browser, 'Ada');
    const noel = await joinMlt(browser, host.page.url(), 'Noel');
    try {
      await host.page.getByRole('button', { name: 'Start Game' }).click();
      await nominate(host.page, 'Noel');
      // Host reveals while Noel is still thinking (MLT is host-paced).
      await host.page.getByRole('button', { name: 'Reveal Nominations' }).click();

      await expect(host.page.getByText('Noel didn’t nominate')).toBeVisible();
      await expect(noel.page.getByText('Noel didn’t nominate')).toBeVisible();
      await expect(host.page.getByRole('heading', { name: '👑 Noel takes the crown!' })).toBeVisible();
    } finally {
      await host.context.close();
      await noel.context.close();
    }
  });

  test('participants never see host controls and cannot nominate themselves', async ({ browser }) => {
    const host = await createMltRoom(browser, 'Ada');
    const rahul = await joinMlt(browser, host.page.url(), 'Rahul');
    try {
      // Waiting: no start control for the participant.
      await expect(rahul.page.getByRole('button', { name: 'Start Game' })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: /Copy Invite/ })).toHaveCount(0);

      await host.page.getByRole('button', { name: 'Start Game' }).click();

      // Voting: no self chip, and no reveal control for the participant.
      await expect(rahul.page.getByRole('button', { name: 'Nominate Rahul', exact: true })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: 'Reveal Nominations' })).toHaveCount(0);
      await nominate(rahul.page, 'Ada');
      await nominate(host.page, 'Rahul');

      await host.page.getByRole('button', { name: 'Reveal Nominations' }).click();
      // Revealed: no next-prompt control for the participant.
      await expect(rahul.page.getByRole('button', { name: /Next Prompt/ })).toHaveCount(0);
      await expect(rahul.page.getByRole('button', { name: /Finish Game/ })).toHaveCount(0);
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
