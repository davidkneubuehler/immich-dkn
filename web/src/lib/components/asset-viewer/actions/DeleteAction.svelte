<script lang="ts">
  import { shortcuts } from '$lib/actions/shortcut';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
  import { showDeleteModal } from '$lib/stores/preferences.store';
  import { deleteAssets as deleteAssetsUtil, type OnUndoDelete } from '$lib/utils/actions';
  import { handleError } from '$lib/utils/handle-error';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { deleteAssets, type AssetResponseDto, type AssetStackResponseDto } from '@immich/sdk';
  import { IconButton, modalManager, toastManager } from '@immich/ui';
  import { mdiDeleteForeverOutline, mdiDeleteOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { OnAction, PreAction } from './action';

  interface Props {
    asset: AssetResponseDto;
    onAction: OnAction;
    preAction: PreAction;
    onUndoDelete?: OnUndoDelete;
    /** The stack of the asset on screen, when the asset itself carries no stack summary. */
    stackSummary?: AssetStackResponseDto;
  }

  let { asset, onAction, preAction, onUndoDelete = undefined, stackSummary }: Props = $props();

  const forceDefault = $derived(asset.isTrashed || !featureFlagsManager.value.trash);
  const stackRef = $derived(asset.stack ?? stackSummary);
  const stackCount = $derived(assetMultiSelectManager.selectWholeStack && stackRef ? stackRef.assetCount : undefined);
  const label = $derived.by(() => {
    const action = forceDefault ? $t('permanently_delete') : $t('delete');
    return stackCount ? $t('whole_stack_action', { values: { action, count: stackCount } }) : action;
  });

  const trashOrDeleteStack = async (forceRequest?: boolean) => {
    const assets = await assetMultiSelectManager.getStackAssetsForAction({
      ...toTimelineAsset(asset),
      stack: stackRef ?? null,
    });
    if (!assets) {
      toastManager.danger($t('errors.unable_to_resolve_selected_stack'));
      return;
    }

    const force = forceDefault || forceRequest || assets.some((member) => member.isTrashed);
    if (force && $showDeleteModal) {
      const confirmed = await modalManager.show(AssetDeleteConfirmModal, { size: assets.length });
      if (!confirmed) {
        return;
      }
    }

    const timelineAsset = toTimelineAsset(asset);
    const assetIds = assets.map(({ id }) => id);
    const type = force ? AssetAction.DELETE : AssetAction.TRASH;
    preAction({ type, asset: timelineAsset, assetIds });
    await deleteAssetsUtil(force, () => onAction({ type, asset: timelineAsset, assetIds }), assets, onUndoDelete);
  };

  const trashOrDelete = async (forceRequest?: boolean) => {
    if (stackCount) {
      return trashOrDeleteStack(forceRequest);
    }

    const timelineAsset = toTimelineAsset(asset);
    const force = forceDefault || forceRequest;

    if (force) {
      if ($showDeleteModal) {
        const confirmed = await modalManager.show(AssetDeleteConfirmModal, { size: 1 });
        if (!confirmed) {
          return;
        }
      }

      try {
        preAction({ type: AssetAction.DELETE, asset: timelineAsset });
        await deleteAssets({ assetBulkDeleteDto: { ids: [asset.id], force: true } });
        onAction({ type: AssetAction.DELETE, asset: timelineAsset });
        toastManager.primary($t('permanently_deleted_asset'));
      } catch (error) {
        handleError(error, $t('errors.unable_to_delete_asset'));
      }

      return;
    }

    preAction({ type: AssetAction.TRASH, asset: timelineAsset });
    await deleteAssetsUtil(
      false,
      () => onAction({ type: AssetAction.TRASH, asset: timelineAsset }),
      [timelineAsset],
      onUndoDelete,
    );
  };
</script>

<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'Delete' }, onShortcut: () => trashOrDelete() },
    { shortcut: { key: 'Delete', shift: true }, onShortcut: () => trashOrDelete(true) },
  ]}
/>

<IconButton
  color="secondary"
  shape="round"
  variant="ghost"
  icon={forceDefault ? mdiDeleteForeverOutline : mdiDeleteOutline}
  aria-label={label}
  onclick={() => trashOrDelete()}
/>
