<script lang="ts">
  import ControlAppBar from '$lib/components/shared-components/ControlAppBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { Switch, toastManager } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();

  const onClose = () => assetMultiSelectManager.clear();

  const assets = $derived(assetMultiSelectManager.assets);
  const implicitAssetCount = $derived(assetMultiSelectManager.implicitAssetCount);

  const toggleWholeStack = async (checked: boolean) => {
    const resolved = await assetMultiSelectManager.setSelectWholeStack(checked);
    if (!resolved) {
      toastManager.danger($t('errors.unable_to_resolve_selected_stack'));
    }
  };
</script>

<ControlAppBar {onClose} backIcon={mdiClose}>
  {#snippet leading()}
    <div class="font-medium text-primary">
      <p class="block sm:hidden">
        {assets.length}{implicitAssetCount > 0
          ? ` (${$t('selected_stack_members_included', { values: { count: implicitAssetCount } })})`
          : ''}
      </p>
      <p class="hidden sm:block">{$t('selected_count', { values: { count: assets.length } })}</p>
      {#if implicitAssetCount > 0}
        <p class="hidden text-xs text-immich-fg/70 sm:block">
          {$t('selected_stack_members_included', { values: { count: implicitAssetCount } })}
        </p>
      {/if}
    </div>
  {/snippet}
  {#snippet trailing()}
    <label class="flex items-center gap-2 text-xs text-immich-fg sm:text-sm">
      <span>{$t('select_whole_stack')}</span>
      <Switch checked={assetMultiSelectManager.selectWholeStack} onCheckedChange={toggleWholeStack} />
    </label>
    {@render children?.()}
  {/snippet}
</ControlAppBar>
