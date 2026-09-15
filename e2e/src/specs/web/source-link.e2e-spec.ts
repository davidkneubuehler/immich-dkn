import { expect, test } from '@playwright/test';
import { utils } from 'src/utils.js';

test.beforeAll(async () => {
  utils.initSdk();
  await utils.resetDatabase();
  await utils.adminSetup();
});

test('shows the configured source link on the unauthenticated login page', async ({ page }) => {
  await page.goto('/auth/login?autoLaunch=0');

  const sourceLink = page.getByRole('link', { name: 'Source', exact: true });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute('href', 'https://example.invalid/immich-source');
});
