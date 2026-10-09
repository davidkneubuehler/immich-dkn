import { getAssetInfo, updateAssets } from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import { vitest } from 'vitest';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { getAssetActions, getAssetBulkActions, handleDownloadAsset } from '$lib/services/asset.service';
import { setSharedLink } from '$lib/utils';
import { getFormatter } from '$lib/utils/i18n';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

vitest.mock('@immich/ui', () => ({
  modalManager: {
    show: vitest.fn(),
  },
  toastManager: {
    danger: vitest.fn(),
    primary: vitest.fn(),
  },
}));

vitest.mock('$lib/utils/i18n', () => ({
  getFormatter: vitest.fn(),
  getPreferredLocale: vitest.fn(),
}));

vitest.mock('$lib/managers/user-preferences-manager.svelte', () => ({
  userPreferencesManager: {},
}));

vitest.mock('$lib/modals/AssetAddToAlbumModal.svelte', () => ({
  default: 'AssetAddToAlbumModal',
}));

vitest.mock('$lib/modals/AssetTagModal.svelte', () => ({ default: 'AssetTagModal' }));
vitest.mock('$lib/modals/ProfileImageCropperModal.svelte', () => ({ default: 'ProfileImageCropperModal' }));
vitest.mock('$lib/modals/SharedLinkCreateModal.svelte', () => ({ default: 'SharedLinkCreateModal' }));

vitest.mock('@immich/sdk');

vitest.mock('$lib/utils', async () => {
  const originalModule = await vitest.importActual('$lib/utils');
  return {
    ...originalModule,
    sleep: vitest.fn(),
  };
});

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), function () {
  return {
    featureFlagsManager: { init: vi.fn(), loadFeatureFlags: vi.fn(), value: {} } as never,
  };
});

describe('AssetService', () => {
  describe('getAssetBulkActions', () => {
    beforeEach(() => {
      vitest.clearAllMocks();
      authManager.setUser(userAdminFactory.build());
    });

    afterEach(() => {
      vitest.restoreAllMocks();
    });

    it('passes the refreshed stack-expanded selection to Add to Album', async () => {
      const assets = timelineAssetFactory.buildList(2);
      vitest.spyOn(assetMultiSelectManager, 'getAssetsForAction').mockResolvedValue(assets);
      const actions = getAssetBulkActions(String);

      await actions.AddToAlbum.onAction?.(undefined as never);

      expect(modalManager.show).toHaveBeenCalledWith('AssetAddToAlbumModal', {
        assetIds: assets.map((asset) => asset.id),
      });
    });

    it('aborts Add to Album when stack resolution fails', async () => {
      vitest.spyOn(assetMultiSelectManager, 'getAssetsForAction').mockResolvedValue(undefined);
      const actions = getAssetBulkActions(String);

      await actions.AddToAlbum.onAction?.(undefined as never);

      expect(toastManager.danger).toHaveBeenCalledWith('errors.unable_to_resolve_selected_stack');
      expect(modalManager.show).not.toHaveBeenCalled();
    });
  });

  describe('getAssetActions', () => {
    beforeEach(() => {
      authManager.setPreferences(preferencesFactory.build());
    });

    it('should allow shared link downloads if the user owns the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: ownerId });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });

    it('should not allow shared link downloads if the user does not own the asset and shared link downloads are disabled', () => {
      const ownerId = 'owner';
      const user = userAdminFactory.build({ id: 'non-owner' });
      const asset = assetFactory.build({ ownerId });
      authManager.setUser(user);
      setSharedLink(sharedLinkFactory.build({ allowDownload: false }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(false);
    });

    it('should allow shared link downloads if shared link downloads are enabled regardless of user', () => {
      const asset = assetFactory.build();
      setSharedLink(sharedLinkFactory.build({ allowDownload: true }));
      const assetActions = getAssetActions(() => '', asset);
      expect(assetActions.SharedLinkDownload.$if?.()).toStrictEqual(true);
    });
  });

  describe('handleDownloadAsset', () => {
    it('should use the asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const asset = assetFactory.build({ originalFileName: 'asset.heic' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });

    it('should use the motion asset originalFileName when showing toasts', async () => {
      const $t = vitest.fn().mockReturnValue('formatter');
      vitest.mocked(getFormatter).mockResolvedValue($t);
      const motionAsset = assetFactory.build({ originalFileName: 'asset.mov' });
      vitest.mocked(getAssetInfo).mockResolvedValue(motionAsset);
      const asset = assetFactory.build({ originalFileName: 'asset.heic', livePhotoVideoId: '1' });
      await handleDownloadAsset(asset, { edited: false });
      expect($t).toHaveBeenNthCalledWith(1, 'downloading_asset_filename', { values: { filename: 'asset.heic' } });
      expect($t).toHaveBeenNthCalledWith(2, 'downloading_asset_filename', { values: { filename: 'asset-motion.mov' } });
      expect(toastManager.primary).toHaveBeenCalledWith('formatter');
    });
  });

  describe('getAssetActions with whole-stack selection', () => {
    const $t = (key: string, options?: { values?: Record<string, unknown> }) =>
      options?.values ? `${key} ${JSON.stringify(options.values)}` : key;
    const stackRef = { id: 'raw-stack', assetCount: 3, primaryAssetId: 'raw' };

    beforeEach(() => {
      vitest.clearAllMocks();
      setSharedLink(undefined as never);
      const user = userAdminFactory.build();
      authManager.setUser(user);
      authManager.setPreferences(preferencesFactory.build({ tags: { enabled: true, sidebarWeb: false } }));
      vitest.mocked(getFormatter).mockResolvedValue(String as never);
    });

    afterEach(() => {
      assetMultiSelectManager.reset();
      vitest.restoreAllMocks();
    });

    it('keeps upstream single-asset behavior while the toggle is off', async () => {
      const asset = assetFactory.build({ stack: stackRef });
      const resolve = vitest.spyOn(assetMultiSelectManager, 'getStackAssetsForAction');
      const actions = getAssetActions($t as never, asset);

      await actions.AddToAlbum.onAction?.(undefined as never);

      expect(actions.AddToAlbum.title).toBe('add_to_album');
      expect(resolve).not.toHaveBeenCalled();
      expect(modalManager.show).toHaveBeenCalledWith('AssetAddToAlbumModal', { assetIds: [asset.id] });
    });

    it('applies album, share and tag actions to every refreshed stack member', async () => {
      const asset = assetFactory.build({ stack: stackRef });
      const members = timelineAssetFactory.buildList(3);
      members[1].id = asset.id;
      assetMultiSelectManager.selectWholeStack = true;
      vitest.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(members);
      const actions = getAssetActions($t as never, asset);
      const assetIds = members.map(({ id }) => id);

      expect(actions.AddToAlbum.title).toBe('whole_stack_action {"action":"add_to_album","count":3}');
      await actions.AddToAlbum.onAction?.(undefined as never);
      await actions.Share.onAction?.(undefined as never);
      await actions.Tag.onAction?.(undefined as never);

      expect(modalManager.show).toHaveBeenCalledWith('AssetAddToAlbumModal', { assetIds });
      expect(modalManager.show).toHaveBeenCalledWith('SharedLinkCreateModal', { assetIds });
      expect(modalManager.show).toHaveBeenCalledWith('AssetTagModal', { assetIds });
    });

    it('favorites every stack member in one request', async () => {
      const user = userAdminFactory.build();
      authManager.setUser(user);
      const asset = assetFactory.build({ ownerId: user.id, isFavorite: false, stack: stackRef });
      const members = timelineAssetFactory.buildList(3);
      assetMultiSelectManager.selectWholeStack = true;
      vitest.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(members);

      await getAssetActions($t as never, asset).Favorite.onAction?.(undefined as never);

      expect(updateAssets).toHaveBeenCalledWith({
        assetBulkUpdateDto: { ids: members.map(({ id }) => id), isFavorite: true },
      });
    });

    it('aborts instead of acting on the asset alone when the stack lookup fails', async () => {
      const asset = assetFactory.build({ stack: stackRef });
      assetMultiSelectManager.selectWholeStack = true;
      vitest.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(undefined);
      const actions = getAssetActions($t as never, asset);

      await actions.AddToAlbum.onAction?.(undefined as never);

      expect(toastManager.danger).toHaveBeenCalledWith('errors.unable_to_resolve_selected_stack');
      expect(modalManager.show).not.toHaveBeenCalled();
    });

    it('keeps single-asset behavior for an unstacked asset while the toggle is on', async () => {
      const asset = assetFactory.build({ stack: null });
      assetMultiSelectManager.selectWholeStack = true;
      const actions = getAssetActions($t as never, asset);

      await actions.Share.onAction?.(undefined as never);

      expect(actions.Share.title).toBe('share');
      expect(modalManager.show).toHaveBeenCalledWith('SharedLinkCreateModal', { assetIds: [asset.id] });
    });
  });
});
