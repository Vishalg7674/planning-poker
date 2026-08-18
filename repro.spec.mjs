import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const hostCtx = await browser.newContext();
const host = await hostCtx.newPage();
const logs = [];
host.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
host.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const bodyPreview = async (p, n = 350) => JSON.stringify((await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, n));

try {
  console.log('1. host → /create');
  await host.goto(`${BASE}/create`);
  await host.getByLabel('Your Name').fill('Ada');
  await host.getByRole('button', { name: 'Create Room' }).click();
  await host.waitForURL(/\/r\/[A-Z2-9]{5}$/, { timeout: 15000 });
  const url = host.url();
  console.log('   room URL:', url);
  await host.getByLabel('Room configuration').waitFor({ timeout: 10000 });
  console.log('   waiting room rendered');

  console.log('2. host → Start Voting');
  await host.getByRole('button', { name: 'Start Voting' }).click();
  await host.getByText('Choose your estimate').waitFor({ timeout: 10000 });
  console.log('   voting started');

  console.log('3. host votes 5');
  await host.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await host.waitForTimeout(2000);

  const urlNow = host.url();
  const isGone = (await host.getByText('The room is gone').count()) > 0;
  const isEnded = (await host.getByText('Voting ended').count()) > 0;
  const isRevealed = (await host.getByText(/Consensus|Most selected|Revealed votes/).count()) > 0;
  console.log('4. after voting:');
  console.log('   URL now:', urlNow);
  console.log('   room gone screen:', isGone);
  console.log('   voting ended screen:', isEnded);
  console.log('   revealed/results visible:', isRevealed);
  console.log('   body:', await bodyPreview(host));

  console.log('5. voter joins the same room');
  const voterCtx = await browser.newContext();
  const voter = await voterCtx.newPage();
  voter.on('console', (m) => logs.push(`[voter console:${m.type()}] ${m.text()}`));
  voter.on('pageerror', (e) => logs.push(`[voter pageerror] ${e.message}`));
  await voter.goto(url);
  await voter.getByLabel('Enter your name').fill('Grace');
  await voter.getByRole('button', { name: 'Join Room' }).click();
  await voter.getByLabel('Room configuration').waitFor({ timeout: 10000 });
  console.log('   voter joined');

  console.log('6. host starts round 2; both vote');
  await host.getByRole('button', { name: 'Start Voting' }).click();
  await host.getByText('Choose your estimate').waitFor({ timeout: 10000 });
  await voter.getByRole('button', { name: 'Vote 8', exact: true }).click();
  await host.getByRole('button', { name: 'Vote 5', exact: true }).click();
  await host.waitForTimeout(1500);
  console.log('   host body:', await bodyPreview(host));
  console.log('   voter body:', await bodyPreview(voter));

  console.log('7. host reveals');
  await host.getByRole('button', { name: 'Reveal Votes' }).click();
  await host.waitForTimeout(1200);
  console.log('   host body:', await bodyPreview(host));
  console.log('   voter body:', await bodyPreview(voter));
  console.log('   host URL:', host.url());
  console.log('   voter URL:', voter.url());
} catch (e) {
  console.log('!!! FAILED at step — body:');
  console.log(await bodyPreview(host).catch(() => 'n/a'));
} finally {
  console.log('--- ALL PAGE/CONSOLE ERRORS ---');
  for (const l of logs) console.log('  ', l);
  await browser.close();
}
