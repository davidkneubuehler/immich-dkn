<script lang="ts">
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import SharedLinkCreateModal from '$lib/modals/SharedLinkCreateModal.svelte';
  import { IconButton, modalManager, toastManager } from '@immich/ui';
  import { mdiShareVariantOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const handleClick = async () => {
    const assets = await assetMultiSelectManager.getAssetsForAction();
    if (!assets) {
      toastManager.danger($t('errors.unable_to_resolve_selected_stack'));
      return;
    }
    await modalManager.show(SharedLinkCreateModal, { assetIds: assets.map(({ id }) => id) });
  };
</script>

<IconButton
  shape="round"
  color="secondary"
  variant="ghost"
  aria-label={$t('share')}
  icon={mdiShareVariantOutline}
  onclick={handleClick}
/>
