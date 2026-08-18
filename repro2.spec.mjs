import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const logs = [];
const bodyPreview = async (p, n = 320) => JSON.stringify((await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, n));
const grab = (ctx) => ctx.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`)) ?? ctx;
const ok = (name, cond, extra = '') => console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ' ' + extra}`);

async function createRoom(name) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}/create`);
  await page.getByLabel('Your Name').fill(name);
  await page.getByRole('button', { name: 'Create Room' }).click();
  await page.waitForURL(/\/r\/[A-Z2-9]{5}$/, { timeout: 15000 });
  await page.getByLabel('Room configuration').waitFor({ timeout: 10000 });
  return { ctx, page, url: page.url() };
}

console.log('=== A. SOLO: create → start → vote → reveal → new story → vote again ===');
{
  const { ctx, page, url } = await createRoom('Ada');
  await page.getByRole('button', { name: 'Start Voting' }).click();
  await page.getByText('Choose your estimate').waitFor();
  await page.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await page.waitForTimeout(800);
  ok('solo: room still on same URL after vote', page.url() === url, page.url());
  ok('solo: vote locked', (await page.getByText(/Vote locked/).count()) > 0);
  ok('solo: everyone has voted', (await page.getByText('Everyone has voted · 1 / 1').count()) > 0);
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
  await page.waitForTimeout(900);
  ok('solo: revealed', (await page.getByText(/Consensus|Most selected/).count()) > 0);
  ok('solo: URL unchanged after reveal', page.url() === url);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '+ New Story' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start Voting' }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Start Voting' }).click();
  await page.getByRole('button', { name: 'Vote 8', exact: true }).click();
  await page.waitForTimeout(800);
  ok('solo: round 2 voted, session alive', page.url() === url && (await page.getByText(/Vote locked/).count()) > 0);
  await ctx.close();
}

console.log('=== B. TIMER: create with 10s → start → vote → timer ends round → reveal → session alive ===');
{
  const { ctx, page, url } = await createRoom('Bob');
  await page.getByRole('button', { name: '10s' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Start Voting' }).click();
  await page.getByText('Choose your estimate').waitFor();
  await page.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await page.waitForTimeout(800);
  ok('timer: vote locked', (await page.getByText(/Vote locked/).count()) > 0);
  // wait out the timer
  await page.getByText('Voting ended', { exact: true }).waitFor({ timeout: 12000 });
  ok('timer: round ended by timer, URL unchanged', page.url() === url, page.url());
  await page.getByRole('button', { name: 'Reveal Votes' }).click();
  await page.waitForTimeout(900);
  ok('timer: revealed after timer end', (await page.getByText(/Consensus|Most selected/).count()) > 0);
  ok('timer: session still alive', page.url() === url);
  await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
  await ctx.close();
}

console.log('=== C. TWO USERS: create → join → start → both vote → reveal → new story ===');
{
  const { ctx: hostCtx, page: host, url } = await createRoom('Cara');
  const vctx = await browser.newContext();
  const voter = await vctx.newPage();
  voter.on('console', (m) => logs.push(`[voter console:${m.type()}] ${m.text()}`));
  voter.on('pageerror', (e) => logs.push(`[voter pageerror] ${e.message}`));
  await voter.goto(url);
  await voter.getByLabel('Enter your name').fill('Sam');
  await voter.getByRole('button', { name: 'Join Room' }).click();
  await voter.getByLabel('Room configuration').waitFor({ timeout: 10000 });

  await host.getByRole('button', { name: 'Start Voting' }).click();
  await host.getByText('Choose your estimate').waitFor();
  await voter.getByRole('button', { name: 'Vote 8', exact: true }).click();
  await host.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await host.waitForTimeout(800);
  ok('two-user: everyone voted', (await host.getByText('Everyone has voted · 2 / 2').count()) > 0);
  ok('two-user: host URL stable', host.url() === url);
  await host.getByRole('button', { name: 'Reveal Votes' }).click();
  await host.waitForTimeout(900);
  ok('two-user: voter sees results', (await voter.getByText(/Consensus|Most selected/).count()) > 0);
  ok('two-user: voter URL stable', voter.url() === url);
  await host.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
  await host.getByRole('button', { name: '+ New Story' }).click();
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByRole('button', { name: 'Start Voting' }).waitFor({ timeout: 8000 });
  ok('two-user: back to waiting, session alive', host.url() === url && voter.url() === url);
  await vctx.close();
  await hostCtx.close();
}

console.log('--- ERRORS ---');
for (const l of logs) console.log('  ', l);
await browser.close();
