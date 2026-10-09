import type { AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent } from '@testing-library/svelte';
import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { deleteAssets } from '$lib/utils/actions';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import DeleteAction from './DeleteAction.svelte';

vi.mock(import('$lib/utils/actions'), async (importOriginal) => ({
  ...(await importOriginal()),
  deleteAssets: vi.fn(),
}));

vi.mock(import('$lib/managers/feature-flags-manager.svelte'), () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { featureFlagsManager: { init: vi.fn(), loadFeatureFlags: vi.fn(), value: { trash: true } } as any };
});

let asset: AssetResponseDto;

describe('DeleteAction component', () => {
  describe('given an asset which is not trashed yet', () => {
    beforeEach(() => {
      asset = assetFactory.build({ isTrashed: false });
    });

    it('displays a button to move the asset to the trash bin', () => {
      const { getByLabelText, queryByTitle } = renderWithTooltips(DeleteAction, {
        asset,
        onAction: vi.fn(),
        preAction: vi.fn(),
      });
      expect(getByLabelText('delete')).toBeInTheDocument();
      expect(queryByTitle('deletePermanently')).toBeNull();
    });
  });

  describe('but if the asset is already trashed', () => {
    beforeEach(() => {
      asset = assetFactory.build({ isTrashed: true });
    });

    it('displays a button to permanently delete the asset', () => {
      const { getByLabelText, queryByTitle } = renderWithTooltips(DeleteAction, {
        asset,
        onAction: vi.fn(),
        preAction: vi.fn(),
      });
      expect(getByLabelText('permanently_delete')).toBeInTheDocument();
      expect(queryByTitle('delete')).toBeNull();
    });
  });

  describe('with whole-stack selection on', () => {
    const stackRef = { id: 'raw-stack', assetCount: 3, primaryAssetId: 'raw' };

    beforeEach(() => {
      vi.clearAllMocks();
      asset = assetFactory.build({ isTrashed: false, stack: stackRef });
      assetMultiSelectManager.selectWholeStack = true;
    });

    afterEach(() => {
      assetMultiSelectManager.reset();
      vi.restoreAllMocks();
    });

    it('names the number of assets the button affects', () => {
      const { getByLabelText } = renderWithTooltips(DeleteAction, { asset, onAction: vi.fn(), preAction: vi.fn() });
      expect(getByLabelText('whole_stack_action')).toBeInTheDocument();
    });

    it('trashes every refreshed stack member and reports all IDs to the host', async () => {
      const members = timelineAssetFactory.buildList(3);
      vi.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(members);
      const preAction = vi.fn();
      const { getByLabelText } = renderWithTooltips(DeleteAction, { asset, onAction: vi.fn(), preAction });

      await fireEvent.click(getByLabelText('whole_stack_action'));

      const assetIds = members.map(({ id }) => id);
      await vi.waitFor(() => expect(deleteAssets).toHaveBeenCalled());
      expect(vi.mocked(deleteAssets).mock.calls[0][0]).toBe(false);
      expect(vi.mocked(deleteAssets).mock.calls[0][2]).toEqual(members);
      expect(preAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'trash', assetIds }));
    });

    it('uses the loaded stack when an asset update dropped the stack summary', async () => {
      const members = timelineAssetFactory.buildList(3);
      const resolve = vi.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(members);
      const updatedAsset = { ...asset, stack: undefined };
      const { getByLabelText } = renderWithTooltips(DeleteAction, {
        asset: updatedAsset,
        stackSummary: stackRef,
        onAction: vi.fn(),
        preAction: vi.fn(),
      });

      await fireEvent.click(getByLabelText('whole_stack_action'));

      await vi.waitFor(() => expect(deleteAssets).toHaveBeenCalled());
      expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: asset.id, stack: stackRef }));
      expect(vi.mocked(deleteAssets).mock.calls[0][2]).toEqual(members);
    });

    it('deletes nothing when the stack lookup fails', async () => {
      vi.spyOn(assetMultiSelectManager, 'getStackAssetsForAction').mockResolvedValue(undefined);
      const preAction = vi.fn();
      const { getByLabelText } = renderWithTooltips(DeleteAction, { asset, onAction: vi.fn(), preAction });

      await fireEvent.click(getByLabelText('whole_stack_action'));

      await vi.waitFor(() => expect(assetMultiSelectManager.getStackAssetsForAction).toHaveBeenCalled());
      expect(deleteAssets).not.toHaveBeenCalled();
      expect(preAction).not.toHaveBeenCalled();
    });
  });
});
