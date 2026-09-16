import { getAssetInfo } from '@immich/sdk';
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
  it('fails on purpose to rehearse the review pull request path', () => {
    expect(true).toBe(false);
  });

  describe('getAssetBulkActions', () => {
    beforeEach(() => {
      vitest.clearAllMocks();
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
});
