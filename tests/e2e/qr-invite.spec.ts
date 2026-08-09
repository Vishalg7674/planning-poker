import { expect, test } from '@playwright/test';
import { createRoom } from './helpers';

test.describe('QR code & invite', () => {
  test('the host lobby renders a QR encoding the actual room URL', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    try {
      // The QR is generated locally as SVG — a <svg> with an aria-label of the URL.
      const qr = host.page.getByRole('img', { name: `QR code for ${host.page.url()}` });
      await expect(qr).toBeVisible();
      await expect(qr.locator('svg')).toBeVisible();

      // Copy-invite button sits next to it.
      await expect(host.page.getByRole('button', { name: /Copy Invite/ })).toBeVisible();
    } finally {
      await host.context.close();
    }
  });

  test('the shared URL is exactly the joinable room URL', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada');
    try {
      // The invite line in the lobby shows the same URL the browser is on.
      await expect(host.page.getByLabel('Room configuration')).toBeVisible();
      const url = host.page.url();
      await expect(host.page.locator(`[title="${url}"]`)).toBeVisible();
    } finally {
      await host.context.close();
    }
  });
});
