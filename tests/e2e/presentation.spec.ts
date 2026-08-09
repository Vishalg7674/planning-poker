import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, vote } from './helpers';

test.describe('Presentation mode', () => {
  test('host enters presentation mode and drives the round from the big view', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada', { teamName: 'Squad', roomTitle: 'Sprint 24' });
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      // Enter presentation mode from the waiting lobby.
      await host.page.getByRole('button', { name: '📺 Presentation Mode' }).click();
      await expect(host.page.getByRole('button', { name: 'Exit Presentation' })).toBeVisible();
      // Simplified big view: title + room code, no side panels.
      await expect(host.page.getByRole('heading', { name: 'Sprint 24' })).toBeVisible();
      await expect(host.page.getByText('Room ' + host.code)).toBeVisible();

      // Host starts from presentation mode.
      await host.page.getByRole('button', { name: 'Start Voting' }).click();
      await expect(host.page.getByText(/0 \/ 2/)).toBeVisible();

      // Realtime status updates in the big counter.
      await vote(rahul.page, '8');
      await expect(host.page.getByText(/1 \/ 2/)).toBeVisible();

      await vote(host.page, '5');
      await expect(host.page.getByText('✓ Everyone has voted')).toBeVisible();

      // Reveal from presentation mode → big results.
      await host.page.getByRole('button', { name: 'Reveal Votes' }).click();
      await expect(host.page.getByText('Median')).toBeVisible();
      await expect(host.page.getByText(/Moderate Disagreement|Strong Consensus|Full Consensus/)).toBeVisible();

      // Exit presentation mode returns to the normal layout.
      await host.page.getByRole('button', { name: 'Exit Presentation' }).click();
      await expect(host.page.getByRole('button', { name: '📺 Presentation' })).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
