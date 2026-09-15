<script lang="ts">
  import { PUBLIC_IMMICH_SOURCE_URL } from '$env/static/public';
  import { t } from 'svelte-i18n';

  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

{#if PUBLIC_IMMICH_SOURCE_URL}
  <a
    class={`text-sm font-medium text-primary underline ${className}`}
    href={PUBLIC_IMMICH_SOURCE_URL}
    target="_blank"
    rel="noreferrer"
  >
    {$t('source')}
  </a>
{/if}
