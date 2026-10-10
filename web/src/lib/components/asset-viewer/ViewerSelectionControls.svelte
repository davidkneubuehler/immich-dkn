<script lang="ts">
  import { shortcuts } from '$lib/actions/shortcut';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import type { OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import AssetDeleteConfirmModal from '$lib/modals/AssetDeleteConfirmModal.svelte';
  import { getAssetBulkActions, handleDownloadAsset } from '$lib/services/asset.service';
  import { showDeleteModal } from '$lib/stores/preferences.store';
  import { deleteAssets, type OnUndoDelete } from '$lib/utils/actions';
  import { downloadArchive } from '$lib/utils/asset-utils';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { getAssetInfo, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { IconButton, modalManager, Switch, toastManager } from '@immich/ui';
  import {
    mdiCheckboxBlankCircleOutline,
    mdiCheckCircle,
    mdiClose,
    mdiDeleteForeverOutline,
    mdiDeleteOutline,
    mdiDotsVertical,
    mdiDownload,
  } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    album?: AlbumResponseDto;
    preAction: PreAction;
    onAction: OnAction;
    onUndoDelete?: OnUndoDelete;
    selectionActions?: Snippet;
  }

  let { asset, album, preAction, onAction, onUndoDelete, selectionActions }: Props = $props();

  const isMarked = $derived(assetMultiSelectManager.hasSelectedAsset(asset.id));
  const selectionActive = $derived(assetMultiSelectManager.selectionActive);
  const selectedCount = $derived(assetMultiSelectManager.assets.length);
  const implicitAssetCount = $derived(assetMultiSelectManager.implicitAssetCount);
  const forceDelete = $derived(
    !featureFlagsManager.value.trash || assetMultiSelectManager.assets.some((selected) => selected.isTrashed),
  );
  const BulkActions = $derived(getAssetBulkActions($t, album));

  const showStackError = () => toastManager.danger($t('errors.unable_to_resolve_selected_stack'));

  const toggleMark = async () => {
    const timelineAsset = toTimelineAsset(asset);
    if (isMarked) {
      assetMultiSelectManager.removeAssetWithStack(timelineAsset);
      return;
    }
    if (!(await assetMultiSelectManager.addAssetWithStack(timelineAsset))) {
      showStackError();
    }
  };

  const toggleWholeStack = async (checked: boolean) => {
    if (!(await assetMultiSelectManager.setSelectWholeStack(checked))) {
      showStackError();
    }
  };

  const trashOrDeleteSelected = async (forceRequest?: boolean) => {
    if (!selectionActive) {
      return;
    }
    const assets = await assetMultiSelectManager.getAssetsForAction();
    if (!assets) {
      showStackError();
      return;
    }

    const force = forceRequest || !featureFlagsManager.value.trash || assets.some((selected) => selected.isTrashed);
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
    await deleteAssets(
      force,
      () => {
        onAction({ type, asset: timelineAsset, assetIds });
        assetMultiSelectManager.clear();
      },
      assets,
      onUndoDelete,
    );
  };

  const downloadSelected = async () => {
    const assets = await assetMultiSelectManager.getAssetsForAction();
    if (!assets) {
      showStackError();
      return;
    }
    assetMultiSelectManager.clear();
    if (assets.length === 1) {
      await handleDownloadAsset(await getAssetInfo({ ...authManager.params, id: assets[0].id }), { edited: true });
      return;
    }
    await downloadArchive('immich', { assetIds: assets.map(({ id }) => id) });
  };
</script>

<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'x' }, onShortcut: () => toggleMark() },
    {
      shortcut: { key: 's', shift: true },
      onShortcut: () => toggleWholeStack(!assetMultiSelectManager.selectWholeStack),
    },
    ...(selectionActive
      ? [
          { shortcut: { key: 'd', ctrl: true }, onShortcut: () => assetMultiSelectManager.clear() },
          { shortcut: { key: 'Delete', ctrl: true }, onShortcut: () => trashOrDeleteSelected() },
          { shortcut: { key: 'Delete', ctrl: true, shift: true }, onShortcut: () => trashOrDeleteSelected(true) },
        ]
      : []),
  ]}
/>

<div class="flex items-center gap-1 text-white" data-testid="asset-viewer-selection">
  <IconButton
    color="secondary"
    shape="round"
    variant="ghost"
    icon={isMarked ? mdiCheckCircle : mdiCheckboxBlankCircleOutline}
    aria-label={isMarked ? $t('deselect_asset') : $t('select_asset')}
    aria-pressed={isMarked}
    onclick={() => toggleMark()}
  />

  {#if selectionActive}
    <div class="flex flex-col px-1 text-sm/tight" role="status">
      <span class="font-medium">{$t('selected_count', { values: { count: selectedCount } })}</span>
      {#if implicitAssetCount > 0}
        <span class="hidden text-xs text-white/70 sm:block">
          {$t('selected_stack_members_included', { values: { count: implicitAssetCount } })}
        </span>
      {/if}
    </div>
    <IconButton
      color="secondary"
      shape="round"
      variant="ghost"
      icon={mdiClose}
      aria-label={$t('deselect_all')}
      onclick={() => assetMultiSelectManager.clear()}
    />
    <IconButton
      color="secondary"
      shape="round"
      variant="ghost"
      icon={forceDelete ? mdiDeleteForeverOutline : mdiDeleteOutline}
      aria-label={forceDelete
        ? $t('permanently_delete_count', { values: { count: selectedCount } })
        : $t('trash_count', { values: { count: selectedCount } })}
      onclick={() => trashOrDeleteSelected()}
    />
    <ButtonContextMenu
      direction="right"
      align="top-left"
      color="secondary"
      title={$t('selection_actions')}
      icon={mdiDotsVertical}
    >
      <MenuOption text={$t('download')} icon={mdiDownload} onClick={() => downloadSelected()} />
      <ActionMenuItem action={BulkActions.AddToAlbum} />
      <ActionMenuItem action={BulkActions.RemoveFromAlbum} />
      <ActionMenuItem action={BulkActions.CreateSharedLink} />
      <ActionMenuItem action={BulkActions.Tag} />
      {@render selectionActions?.()}
    </ButtonContextMenu>
  {/if}

  {#if selectionActive || asset.stack}
    <label class="ms-1 flex items-center gap-2 text-xs sm:text-sm">
      <span class="hidden sm:inline">{$t('select_whole_stack')}</span>
      <Switch
        aria-label={$t('select_whole_stack')}
        checked={assetMultiSelectManager.selectWholeStack}
        onCheckedChange={toggleWholeStack}
      />
    </label>
  {/if}
</div>
