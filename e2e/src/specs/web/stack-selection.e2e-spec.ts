import { AssetVisibility, type LoginResponseDto } from '@immich/sdk';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { testAssetDir, utils } from 'src/utils.js';

type Fixture = {
  stackOne: string[];
  stackTwo: string[];
  ordinary: string;
};

const jpgOne = readFileSync(`${testAssetDir}/formats/jpg/el_torcal_rocks.jpg`);
const rawOne = readFileSync(`${testAssetDir}/formats/raw/Nikon/D80/glarus.nef`);
const jpgTwo = readFileSync(`${testAssetDir}/metadata/gps-position/thompson-springs.jpg`);
const rawTwo = readFileSync(`${testAssetDir}/formats/raw/Nikon/D700/philadelphia.nef`);
const ordinaryJpg = readFileSync(`${testAssetDir}/metadata/faces/portrait.jpg`);

const createFixture = async (admin: LoginResponseDto): Promise<Fixture> => {
  const assets = await Promise.all([
    utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2024-01-01T10:00:00.000Z',
      assetData: { bytes: jpgOne, filename: 'stack-one.jpg' },
    }),
    utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2024-01-01T10:00:01.000Z',
      assetData: { bytes: rawOne, filename: 'stack-one-raw.nef' },
    }),
    utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2024-01-02T10:00:00.000Z',
      assetData: { bytes: jpgTwo, filename: 'stack-two.jpg' },
    }),
    utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2024-01-02T10:00:01.000Z',
      assetData: { bytes: rawTwo, filename: 'stack-two-raw.nef' },
    }),
    utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2024-01-03T10:00:00.000Z',
      assetData: { bytes: ordinaryJpg, filename: 'ordinary.jpg' },
    }),
  ]);

  await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');
  const [stackOne, stackTwo] = await Promise.all([
    utils.createStack(admin.accessToken, [assets[0].id, assets[1].id]),
    utils.createStack(admin.accessToken, [assets[2].id, assets[3].id]),
  ]);

  return {
    stackOne: [stackOne.primaryAssetId, assets[1].id],
    stackTwo: [stackTwo.primaryAssetId, assets[3].id],
    ordinary: assets[4].id,
  };
};

const selectAsset = async (page: Page, id: string) => {
  const asset = page.locator(`[data-asset="${id}"]`).first();
  await asset.scrollIntoViewIfNeeded();
  await asset.hover();
  await asset.getByRole('checkbox').click();
};

const setup = async ({
  context,
  page,
  enableTags = false,
}: {
  context: BrowserContext;
  page: Page;
  enableTags?: boolean;
}) => {
  utils.initSdk();
  await utils.resetDatabase();
  const admin = await utils.adminSetup();
  if (enableTags) {
    await utils.updateMyPreferences(admin.accessToken, { tags: { enabled: true, sidebarWeb: false } });
  }
  const fixture = await createFixture(admin);
  await utils.setAuthCookies(context, admin.accessToken);
  await page.goto('/photos');
  await page.waitForLoadState('networkidle');
  await page.locator(`[data-asset="${fixture.stackOne[0]}"]`).waitFor();
  return { admin, fixture };
};

const selectExpandedStack = async (page: Page, fixture: Fixture) => {
  await selectAsset(page, fixture.stackOne[0]);
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.getByText('Select whole stack').locator('..').getByRole('switch').click();
  await expect(page.getByText('2 selected')).toBeVisible();
};

const openMenu = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
};

const clearSelection = async (page: Page) => {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('navigation').last().getByRole('button', { name: 'Close' }).click();
};

const getRequestBody = async (requestPromise: Promise<Request>) => {
  const request = await requestPromise;
  return JSON.parse(request.postData() || '{}');
};

const getSelectedAssetInfo = (accessToken: string, ids: string[]) =>
  Promise.all(ids.map((id) => utils.getAssetInfo(accessToken, id)));

const getFavoriteStates = async (accessToken: string, ids: string[]) => {
  const assets = await getSelectedAssetInfo(accessToken, ids);
  return assets.map((asset) => asset.isFavorite);
};

const getVisibilityStates = async (accessToken: string, ids: string[]) => {
  const assets = await getSelectedAssetInfo(accessToken, ids);
  return assets.map((asset) => asset.visibility);
};

const getTrashStates = async (accessToken: string, ids: string[]) => {
  const assets = await getSelectedAssetInfo(accessToken, ids);
  return assets.map((asset) => asset.isTrashed);
};

const getTagStates = async (accessToken: string, ids: string[]) => {
  const assets = await getSelectedAssetInfo(accessToken, ids);
  return assets.map((asset) => (asset.tags ?? []).map((tag) => tag.id));
};

const getMissingStates = async (accessToken: string, ids: string[]) =>
  Promise.all(
    ids.map(async (id) => {
      try {
        await utils.getAssetInfo(accessToken, id);
        return false;
      } catch {
        return true;
      }
    }),
  );

test.describe('Stack selection', () => {
  test.beforeAll(() => utils.initSdk());

  test('is primary-only by default and expands multiple stacks without duplicates', async ({ context, page }) => {
    const { fixture } = await setup({ context, page });

    await selectAsset(page, fixture.stackOne[0]);
    await expect(page.getByText('1 selected')).toBeVisible();
    await selectAsset(page, fixture.stackTwo[0]);
    await selectAsset(page, fixture.ordinary);
    await expect(page.getByText('3 selected')).toBeVisible();

    await page.getByText('Select whole stack').locator('..').getByRole('switch').click();
    await expect(page.getByText('5 selected')).toBeVisible();
    await expect(page.getByText('2 hidden stack members included', { exact: true })).toBeVisible();

    await page.getByText('Select whole stack').locator('..').getByRole('switch').click();
    await expect(page.getByText('3 selected')).toBeVisible();

    await page.getByText('Select whole stack').locator('..').getByRole('switch').click();
    await expect(page.getByText('5 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByText('5 selected')).toBeVisible();
  });

  test('passes expanded IDs to Add to Album, shared links, and downloads', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page });
    await selectExpandedStack(page, fixture);

    const album = await utils.createAlbum(admin.accessToken, { albumName: 'Expanded stack album' });
    const albumRequest = page.waitForRequest((request) => request.url().endsWith(`/api/albums/${album.id}/assets`));
    await page.getByRole('button', { name: 'Add to album' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: `${album.albumName} 0 items` })
      .first()
      .click();
    expect(await getRequestBody(albumRequest)).toEqual({ ids: fixture.stackOne });
    await clearSelection(page);

    await selectExpandedStack(page, fixture);
    const sharedLinkRequest = page.waitForRequest((request) => request.url().endsWith('/api/shared-links'));
    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: 'Create link' }).click();
    expect(await getRequestBody(sharedLinkRequest)).toMatchObject({ assetIds: fixture.stackOne });
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await clearSelection(page);

    await selectExpandedStack(page, fixture);
    const downloadResponse = page.waitForResponse((response) => response.url().endsWith('/api/download/info'));
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Download' }).click();
    const downloadInfo = await downloadResponse;
    expect(await downloadInfo.json()).toMatchObject({ archives: [{ assetIds: fixture.stackOne }] });
  });

  test('passes expanded IDs to favorite, archive, and tag actions', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page, enableTags: true });
    await selectExpandedStack(page, fixture);
    const favoriteRequest = page.waitForRequest(
      (request) => request.url().endsWith('/api/assets') && request.method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Favorite' }).click();
    expect(await getRequestBody(favoriteRequest)).toEqual({ ids: fixture.stackOne, isFavorite: true });
    await expect.poll(() => getFavoriteStates(admin.accessToken, fixture.stackOne)).toEqual([true, true]);

    await selectExpandedStack(page, fixture);
    await page.getByRole('button', { name: 'Remove from favorites' }).click();
    await expect.poll(() => getFavoriteStates(admin.accessToken, fixture.stackOne)).toEqual([false, false]);

    const [tag] = await utils.upsertTags(admin.accessToken, ['expanded-stack-tag']);
    await selectExpandedStack(page, fixture);
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Tag' }).click();
    const tagInput = page.getByRole('combobox', { name: 'Tag' });
    await tagInput.click();
    await tagInput.fill(tag.value);
    await page.getByRole('option', { name: tag.value }).click();
    const tagRequest = page.waitForRequest((request) => request.url().endsWith('/api/tags/assets'));
    await page.getByRole('button', { name: 'Tag assets' }).click();
    expect(await getRequestBody(tagRequest)).toEqual({ tagIds: [tag.id], assetIds: fixture.stackOne });
    await expect.poll(() => getTagStates(admin.accessToken, fixture.stackOne)).toEqual([[tag.id], [tag.id]]);

    await selectExpandedStack(page, fixture);
    const archiveRequest = page.waitForRequest(
      (request) => request.url().endsWith('/api/assets') && request.method() === 'PUT',
    );
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    expect(await getRequestBody(archiveRequest)).toEqual({
      ids: fixture.stackOne,
      visibility: AssetVisibility.Archive,
    });
    await expect
      .poll(() => getVisibilityStates(admin.accessToken, fixture.stackOne))
      .toEqual([AssetVisibility.Archive, AssetVisibility.Archive]);

    await page.goto('/archive');
    await selectAsset(page, fixture.stackOne[0]);
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Unarchive' }).click();
    await expect
      .poll(() => getVisibilityStates(admin.accessToken, fixture.stackOne))
      .toEqual([AssetVisibility.Timeline, AssetVisibility.Timeline]);
  });

  test('trashes every expanded member', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page });
    await selectExpandedStack(page, fixture);
    const trashRequest = page.waitForRequest(
      (request) => request.url().endsWith('/api/assets') && request.method() === 'DELETE',
    );
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    expect(await getRequestBody(trashRequest)).toEqual({ ids: fixture.stackOne, force: false });
    await expect.poll(() => getTrashStates(admin.accessToken, fixture.stackOne)).toEqual([true, true]);

    await page.goto('/trash');
    await selectAsset(page, fixture.stackOne[0]);
    await selectAsset(page, fixture.stackOne[1]);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect.poll(() => getTrashStates(admin.accessToken, fixture.stackOne)).toEqual([false, false]);
  });

  test('uses primary-only action behavior after whole-stack selection is disabled', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page });
    await selectAsset(page, fixture.stackOne[0]);
    const switchControl = page.getByText('Select whole stack').locator('..').getByRole('switch');
    await switchControl.click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await switchControl.click();
    await expect(page.getByText('1 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Favorite' }).click();
    await expect.poll(() => getFavoriteStates(admin.accessToken, fixture.stackOne)).toEqual([true, false]);
  });

  test('permanently deletes individually selected trashed stack members', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page });
    await selectExpandedStack(page, fixture);
    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(() => getTrashStates(admin.accessToken, fixture.stackOne)).toEqual([true, true]);

    await page.goto('/trash');
    await selectAsset(page, fixture.stackOne[0]);
    await selectAsset(page, fixture.stackOne[1]);
    await page.getByRole('button', { name: 'Permanently delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => getMissingStates(admin.accessToken, fixture.stackOne)).toEqual([true, true]);
  });

  test('aborts bulk actions on stack-resolution failure', async ({ context, page }) => {
    const { admin, fixture } = await setup({ context, page });
    await selectExpandedStack(page, fixture);
    await page.route('**/api/stacks/*', (route) => route.fulfill({ status: 500, body: 'stack unavailable' }));

    let deleteRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/assets') && request.method() === 'DELETE') {
        deleteRequests++;
      }
    });

    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByText('Unable to resolve selected stack members', { exact: true })).toBeVisible();
    expect(deleteRequests).toBe(0);
    await expect.poll(() => getTrashStates(admin.accessToken, fixture.stackOne)).toEqual([false, false]);
    await expect(page.getByText('1 selected')).toBeVisible();
  });
});
