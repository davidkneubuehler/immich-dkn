import { AssetVisibility, getStack } from '@immich/sdk';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { toTimelineAsset } from '$lib/utils/timeline-util';

export type AssetMultiSelectOptions = {
  resetOnNavigate?: boolean;
};

const MAX_CONCURRENT_STACK_RESOLUTIONS = 4;

export class AssetMultiSelectManager {
  #selectedMap = new SvelteMap<string, TimelineAsset>();
  #explicitMap = new SvelteMap<string, TimelineAsset>();
  #stackMembers = new SvelteMap<string, TimelineAsset[]>();
  #stackResolutionGeneration = 0;
  #activeStackResolutions = 0;
  #stackResolutionQueue: (() => void)[] = [];

  selectAll = $state(false);
  selectWholeStack = $state(false);
  startAsset = $state<TimelineAsset | null>(null);

  selectedGroup = new SvelteSet<string>();

  candidates = $state<TimelineAsset[]>([]);

  selectionActive = $derived(this.#selectedMap.size > 0);

  assets = $derived(Array.from(this.#selectedMap.values()));
  implicitAssetCount = $derived(Math.max(0, this.#selectedMap.size - this.#explicitMap.size));
  ownedAssets = $derived(
    authManager.authenticated ? this.assets.filter((asset) => asset.ownerId === authManager.user.id) : this.assets,
  );

  isAllTrashed = $derived(this.assets.every((asset) => asset.isTrashed));
  isAllArchived = $derived(this.assets.every((asset) => asset.visibility === AssetVisibility.Archive));
  isAllFavorite = $derived(this.assets.every((asset) => asset.isFavorite));
  isAllUserOwned = $derived(
    authManager.authenticated && this.assets.every((asset) => asset.ownerId === authManager.user.id),
  );

  #unsubscribe?: () => void;

  constructor(options?: AssetMultiSelectOptions) {
    const { resetOnNavigate = false } = options ?? {};
    if (resetOnNavigate) {
      this.#unsubscribe = eventManager.on({ AppNavigate: () => this.clear() });
    }
  }

  destroy() {
    this.#unsubscribe?.();
  }

  getOwnedAssets() {
    return authManager.authenticated
      ? this.assets.filter((asset) => asset.ownerId === authManager.user.id)
      : this.assets;
  }

  hasSelectedAsset(assetId: string) {
    return this.#selectedMap.has(assetId);
  }

  hasSelectionCandidate(assetId: string) {
    return this.candidates.some((asset) => asset.id === assetId);
  }

  selectAsset(asset: TimelineAsset) {
    this.#explicitMap.set(asset.id, asset);
    this.#invalidateStackMembers();
    if (this.selectWholeStack) {
      void this.#refreshStackMembers();
    }
  }

  selectAssets(assets: TimelineAsset[]) {
    for (const asset of assets) {
      this.#explicitMap.set(asset.id, asset);
    }
    this.#invalidateStackMembers();
    if (this.selectWholeStack) {
      void this.#refreshStackMembers();
    }
  }

  async addAssetsWithStacks(assets: TimelineAsset[]) {
    const existingAssetIds = new SvelteSet(this.#explicitMap.keys());
    for (const asset of assets) {
      this.#explicitMap.set(asset.id, asset);
    }
    this.#invalidateStackMembers();
    if (!this.selectWholeStack) {
      return true;
    }

    const resolved = await this.#refreshStackMembers();
    if (resolved === true) {
      return true;
    }
    if (resolved === undefined) {
      return false;
    }

    for (const asset of assets) {
      if (!existingAssetIds.has(asset.id)) {
        this.#explicitMap.delete(asset.id);
      }
    }
    this.#invalidateStackMembers();
    void this.#refreshStackMembers();
    return false;
  }

  removeAssetFromMultiselectGroup(assetId: string) {
    this.#explicitMap.delete(assetId);
    this.#invalidateStackMembers();
    if (this.selectWholeStack) {
      void this.#refreshStackMembers();
    }
  }

  async addAssetWithStack(asset: TimelineAsset) {
    return this.addAssetsWithStacks([asset]);
  }

  async setSelectWholeStack(enabled: boolean) {
    this.selectWholeStack = enabled;
    this.#invalidateStackMembers();

    if (!enabled) {
      return true;
    }

    const resolved = await this.#refreshStackMembers();
    if (resolved === true) {
      return true;
    }
    if (resolved === undefined) {
      return this.selectWholeStack;
    }
    if (this.selectWholeStack) {
      this.selectWholeStack = false;
      this.#invalidateStackMembers();
    }
    return false;
  }

  async getAssetsForAction() {
    if (!this.selectWholeStack) {
      return [...this.assets];
    }

    if ((await this.#refreshStackMembers()) !== true) {
      return undefined;
    }
    return [...this.assets];
  }

  async getOwnedAssetsForAction() {
    const assets = await this.getAssetsForAction();
    if (!assets) {
      return undefined;
    }
    return authManager.authenticated ? assets.filter((asset) => asset.ownerId === authManager.user.id) : assets;
  }

  addGroupToMultiselectGroup(group: string) {
    this.selectedGroup.add(group);
  }

  removeGroupFromMultiselectGroup(group: string) {
    this.selectedGroup.delete(group);
  }

  setAssetSelectionStart(asset: TimelineAsset | null) {
    this.startAsset = asset;
  }

  setAssetSelectionCandidates(assets: TimelineAsset[]) {
    this.candidates = assets;
  }

  clearCandidates() {
    this.candidates = [];
  }

  clear() {
    this.selectAll = false;
    this.selectWholeStack = false;

    // Multi-selection
    this.#explicitMap.clear();
    this.#invalidateStackMembers();
    this.selectedGroup.clear();

    // Range selection
    this.candidates = [];
    this.startAsset = null;
  }

  async #refreshStackMembers() {
    const generation = ++this.#stackResolutionGeneration;
    const assets = Array.from(this.#explicitMap.values());

    try {
      const assetIdsByStack = new SvelteMap<string, string[]>();
      for (const asset of assets) {
        if (!asset.stack) {
          continue;
        }
        const assetIds = assetIdsByStack.get(asset.stack.id) ?? [];
        assetIds.push(asset.id);
        assetIdsByStack.set(asset.stack.id, assetIds);
      }
      const entries = await this.#resolveStackMembers(assetIdsByStack, generation);

      if (generation !== this.#stackResolutionGeneration || !this.selectWholeStack) {
        return undefined;
      }

      this.#stackMembers.clear();
      for (const [assetId, members] of entries) {
        this.#stackMembers.set(assetId, members);
      }
      this.#rebuildSelection();
      return true;
    } catch {
      if (generation !== this.#stackResolutionGeneration) {
        return undefined;
      }
      this.#stackMembers.clear();
      this.#rebuildSelection();
      return false;
    }
  }

  #invalidateStackMembers() {
    this.#stackResolutionGeneration += 1;
    this.#stackMembers.clear();
    this.#rebuildSelection();
  }

  async #resolveStackMembers(assetIdsByStack: SvelteMap<string, string[]>, generation: number) {
    const requests = Array.from(assetIdsByStack);
    const entries: [string, TimelineAsset[]][] = [];
    let nextRequest = 0;

    const resolveNext = async () => {
      while (nextRequest < requests.length) {
        const [stackId, assetIds] = requests[nextRequest++]!;
        const stack = await this.#getStack(stackId, generation);
        if (!stack) {
          return;
        }
        const members = stack.assets.map((member) => toTimelineAsset(member));
        entries.push(...assetIds.map((assetId) => [assetId, members] as [string, TimelineAsset[]]));
      }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_STACK_RESOLUTIONS, requests.length) }, resolveNext));
    return entries;
  }

  #getStack(stackId: string, generation: number) {
    if (this.#activeStackResolutions < MAX_CONCURRENT_STACK_RESOLUTIONS) {
      this.#activeStackResolutions += 1;
      return this.#requestStack(stackId, generation);
    }
    return new Promise<Awaited<ReturnType<typeof getStack>> | undefined>((resolve, reject) => {
      this.#stackResolutionQueue.push(() => {
        this.#requestStack(stackId, generation).then(resolve, reject);
      });
    });
  }

  #requestStack(stackId: string, generation: number) {
    if (generation !== this.#stackResolutionGeneration || !this.selectWholeStack) {
      this.#releaseStackResolutionSlot();
      return Promise.resolve(undefined);
    }
    return getStack({ id: stackId }).finally(() => this.#releaseStackResolutionSlot());
  }

  #releaseStackResolutionSlot() {
    const next = this.#stackResolutionQueue.shift();
    if (next) {
      next();
      return;
    }
    this.#activeStackResolutions -= 1;
  }

  #rebuildSelection() {
    this.#selectedMap.clear();
    for (const asset of this.#explicitMap.values()) {
      this.#selectedMap.set(asset.id, asset);
    }
    for (const members of this.#stackMembers.values()) {
      for (const asset of members) {
        this.#selectedMap.set(asset.id, asset);
      }
    }
  }
}

export const assetMultiSelectManager = new AssetMultiSelectManager({ resetOnNavigate: true });
