<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import type { OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { archiveAssets, toggleArchive } from '$lib/utils/asset-utils';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, getAssetInfo, type AssetResponseDto } from '@immich/sdk';
  import { toastManager } from '@immich/ui';
  import { mdiArchiveArrowDownOutline, mdiArchiveArrowUpOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    onAction: OnAction;
    preAction: PreAction;
  }

  let { asset, onAction, preAction }: Props = $props();

  const stackCount = $derived(
    assetMultiSelectManager.selectWholeStack && asset.stack ? asset.stack.assetCount : undefined,
  );
  const text = $derived.by(() => {
    const action = asset.isArchived ? $t('unarchive') : $t('to_archive');
    return stackCount ? $t('whole_stack_action', { values: { action, count: stackCount } }) : action;
  });

  const onArchiveStack = async () => {
    const assets = await assetMultiSelectManager.getStackAssetsForAction(toTimelineAsset(asset));
    if (!assets) {
      toastManager.danger($t('errors.unable_to_resolve_selected_stack'));
      return;
    }

    const timelineAsset = toTimelineAsset(asset);
    const assetIds = assets.map(({ id }) => id);
    const type = asset.isArchived ? AssetAction.UNARCHIVE : AssetAction.ARCHIVE;
    if (type === AssetAction.ARCHIVE) {
      preAction({ type, asset: timelineAsset, assetIds });
    }
    await archiveAssets(assets, asset.isArchived ? AssetVisibility.Timeline : AssetVisibility.Archive);
    const updatedAsset = await getAssetInfo({ ...authManager.params, id: asset.id });
    eventManager.emit('AssetUpdate', updatedAsset);
    onAction({ type, asset: toTimelineAsset(updatedAsset), assetIds });
  };

  const onArchive = async () => {
    if (stackCount) {
      return onArchiveStack();
    }

    if (!asset.isArchived) {
      preAction({ type: AssetAction.ARCHIVE, asset: toTimelineAsset(asset) });
    }
    const updatedAsset = await toggleArchive(asset);
    if (updatedAsset) {
      onAction({ type: asset.isArchived ? AssetAction.ARCHIVE : AssetAction.UNARCHIVE, asset: toTimelineAsset(asset) });
    }
  };
</script>

<svelte:document use:shortcut={{ shortcut: { key: 'a', shift: true }, onShortcut: onArchive }} />

<MenuOption
  icon={asset.isArchived ? mdiArchiveArrowUpOutline : mdiArchiveArrowDownOutline}
  {text}
  onClick={onArchive}
/>
