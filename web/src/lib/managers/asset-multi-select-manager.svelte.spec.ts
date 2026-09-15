import { AssetVisibility, getStack, type StackResponseDto } from '@immich/sdk';
import { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getStack: vi.fn(),
}));

vi.mock('@immich/ui', () => ({}));

const getStackMock = vi.mocked(getStack);

const stackResponse = (id: string, assets = assetFactory.buildList(2)): StackResponseDto => ({
  id,
  primaryAssetId: assets[0].id,
  assets,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('AssetMultiSelectManager', () => {
  let sut: AssetMultiSelectManager;

  beforeEach(() => {
    sut = new AssetMultiSelectManager();
    getStackMock.mockReset();
  });

  it('calculates derived values from selection', () => {
    sut.selectAsset(
      timelineAssetFactory.build({ isFavorite: true, visibility: AssetVisibility.Archive, isTrashed: true }),
    );
    sut.selectAsset(
      timelineAssetFactory.build({ isFavorite: true, visibility: AssetVisibility.Timeline, isTrashed: false }),
    );

    expect(sut.selectionActive).toBe(true);
    expect(sut.isAllTrashed).toBe(false);
    expect(sut.isAllArchived).toBe(false);
    expect(sut.isAllFavorite).toBe(true);
  });

  it('updates isAllUserOwned when the active user changes', () => {
    const [user1, user2] = userAdminFactory.buildList(2);
    sut.selectAsset(timelineAssetFactory.build({ ownerId: user1.id }));

    const cleanup = $effect.root(() => {
      expect(sut.isAllUserOwned).toBe(false);

      authManager.setUser(user1);
      authManager.setPreferences(preferencesFactory.build());
      expect(sut.isAllUserOwned).toBe(true);

      authManager.setUser(user2);
      expect(sut.isAllUserOwned).toBe(false);
    });

    cleanup();
    authManager.reset();
  });

  it('keeps a stack primary-only until whole-stack selection is enabled', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'jpg-raw-stack', assetCount: 2, primaryAssetId: 'jpg' },
    });

    await sut.addAssetWithStack(asset);

    expect(sut.assets.map(({ id }) => id)).toEqual([asset.id]);
    expect(getStackMock).not.toHaveBeenCalled();
  });

  it('selects every member of a JPG/RAW stack when enabled', async () => {
    const asset = timelineAssetFactory.build({
      id: 'jpg',
      stack: { id: 'jpg-raw-stack', assetCount: 2, primaryAssetId: 'jpg' },
    });
    const members = [
      assetFactory.build({ id: asset.id, originalMimeType: 'image/jpeg' }),
      assetFactory.build({ originalMimeType: 'image/x-adobe-dng' }),
    ];
    getStackMock.mockResolvedValue(stackResponse('jpg-raw-stack', members));

    await sut.setSelectWholeStack(true);
    await sut.addAssetWithStack(asset);

    expect(sut.assets.map(({ id }) => id)).toEqual([asset.id, members[1].id]);
    expect(sut.implicitAssetCount).toBe(1);
  });

  it('recomputes implicit members when the toggle changes without removing ordinary assets', async () => {
    const stacked = timelineAssetFactory.build({
      stack: { id: 'large-stack', assetCount: 4, primaryAssetId: 'primary' },
    });
    const ordinary = timelineAssetFactory.build();
    const initialMembers = assetFactory.buildList(4);
    const refreshedMembers = assetFactory.buildList(3);
    getStackMock.mockResolvedValueOnce(stackResponse('large-stack', initialMembers));

    sut.selectAsset(stacked);
    sut.selectAsset(ordinary);
    await sut.setSelectWholeStack(true);
    expect(sut.assets.map(({ id }) => id)).toEqual([stacked.id, ordinary.id, ...initialMembers.map(({ id }) => id)]);

    await sut.setSelectWholeStack(false);
    expect(sut.assets.map(({ id }) => id)).toEqual([stacked.id, ordinary.id]);

    getStackMock.mockResolvedValueOnce(stackResponse('large-stack', refreshedMembers));
    await sut.setSelectWholeStack(true);
    expect(sut.assets.map(({ id }) => id)).toEqual([stacked.id, ordinary.id, ...refreshedMembers.map(({ id }) => id)]);
  });

  it('deduplicates members shared by multiple selected stacks', async () => {
    const first = timelineAssetFactory.build({
      stack: { id: 'stack-one', assetCount: 2, primaryAssetId: 'one' },
    });
    const second = timelineAssetFactory.build({
      stack: { id: 'stack-two', assetCount: 2, primaryAssetId: 'two' },
    });
    const shared = assetFactory.build();
    const firstMembers = [shared, assetFactory.build()];
    const secondMembers = [shared, assetFactory.build()];
    getStackMock.mockImplementation(({ id }) =>
      Promise.resolve(stackResponse(id, id === 'stack-one' ? firstMembers : secondMembers)),
    );

    await sut.setSelectWholeStack(true);
    await sut.addAssetWithStack(first);
    await sut.addAssetWithStack(second);

    expect(sut.assets.filter(({ id }) => id === shared.id)).toHaveLength(1);
  });

  it('expands multiple stacks and ordinary assets at the common action boundary', async () => {
    const [first, second, ordinary] = [
      timelineAssetFactory.build({ stack: { id: 'first-stack', assetCount: 2, primaryAssetId: 'first' } }),
      timelineAssetFactory.build({ stack: { id: 'second-stack', assetCount: 2, primaryAssetId: 'second' } }),
      timelineAssetFactory.build(),
    ];
    const firstMembers = assetFactory.buildList(2);
    const secondMembers = assetFactory.buildList(2);
    getStackMock.mockImplementation(({ id }) =>
      Promise.resolve(stackResponse(id, id === 'first-stack' ? firstMembers : secondMembers)),
    );

    await sut.setSelectWholeStack(true);
    await sut.addAssetsWithStacks([first, second, ordinary]);

    await expect(sut.getAssetsForAction()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id }),
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: ordinary.id }),
        ...firstMembers.map(({ id }) => expect.objectContaining({ id })),
        ...secondMembers.map(({ id }) => expect.objectContaining({ id })),
      ]),
    );
  });

  it('returns an action snapshot that is not changed by later selection updates', async () => {
    const first = timelineAssetFactory.build();
    const second = timelineAssetFactory.build();
    sut.selectAsset(first);

    const actionAssets = await sut.getAssetsForAction();
    sut.selectAsset(second);

    expect(actionAssets?.map(({ id }) => id)).toEqual([first.id]);
  });

  it('limits concurrent stack lookups across a large selection', async () => {
    const assets = Array.from({ length: 6 }, (_, index) =>
      timelineAssetFactory.build({
        stack: { id: `stack-${index}`, assetCount: 2, primaryAssetId: `primary-${index}` },
      }),
    );
    const pending = new Map(assets.map((asset) => [asset.stack!.id, deferred<StackResponseDto>()]));
    let active = 0;
    let maximumActive = 0;
    getStackMock.mockImplementation(({ id }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      return pending.get(id)!.promise.finally(() => (active -= 1));
    });

    await sut.setSelectWholeStack(true);
    const selection = sut.addAssetsWithStacks(assets);

    await vi.waitFor(() => expect(getStackMock).toHaveBeenCalledTimes(4));
    for (const [id, request] of pending) {
      request.resolve(stackResponse(id));
    }
    await selection;

    expect(getStackMock).toHaveBeenCalledTimes(6);
    expect(maximumActive).toBeLessThanOrEqual(4);
  });

  it('cancels an action snapshot when its stack resolution is superseded', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'pending-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    const pending = deferred<StackResponseDto>();
    getStackMock.mockReturnValue(pending.promise);

    await sut.setSelectWholeStack(true);
    const selection = sut.addAssetWithStack(asset);
    const action = sut.getAssetsForAction();
    sut.removeAssetFromMultiselectGroup(asset.id);
    pending.resolve(stackResponse('pending-stack'));

    await expect(action).resolves.toBeUndefined();
    await expect(selection).resolves.toBe(false);
  });

  it('removes the primary when stack resolution fails instead of selecting it alone', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'stale-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    getStackMock.mockRejectedValueOnce(new Error('stack no longer exists'));

    await sut.setSelectWholeStack(true);

    await expect(sut.addAssetWithStack(asset)).resolves.toBe(false);
    expect(sut.assets).toEqual([]);
  });

  it('aborts a stack-aware action when refreshing members fails', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'stale-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    getStackMock.mockResolvedValueOnce(stackResponse('stale-stack'));
    await sut.setSelectWholeStack(true);
    await sut.addAssetWithStack(asset);
    getStackMock.mockRejectedValueOnce(new Error('permission denied'));

    await expect(sut.getAssetsForAction()).resolves.toBeUndefined();
  });

  it('does not apply members that resolve after the selected stack is deselected', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'pending-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    const pending = deferred<StackResponseDto>();
    getStackMock.mockReturnValueOnce(pending.promise);

    await sut.setSelectWholeStack(true);
    const selection = sut.addAssetWithStack(asset);
    sut.removeAssetFromMultiselectGroup(asset.id);
    pending.resolve(stackResponse('pending-stack'));

    await expect(selection).resolves.toBe(false);
    expect(sut.assets).toEqual([]);
  });

  it('does not apply members that resolve after whole-stack selection is disabled', async () => {
    const asset = timelineAssetFactory.build({
      stack: { id: 'pending-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    const pending = deferred<StackResponseDto>();
    getStackMock.mockReturnValueOnce(pending.promise);

    await sut.setSelectWholeStack(true);
    const selection = sut.addAssetWithStack(asset);
    await sut.setSelectWholeStack(false);
    pending.resolve(stackResponse('pending-stack'));

    await expect(selection).resolves.toBe(false);
    expect(sut.selectWholeStack).toBe(false);
    expect(sut.assets.map(({ id }) => id)).toEqual([asset.id]);
  });

  it('does not apply a late stack response when another stack resolution fails', async () => {
    const first = timelineAssetFactory.build({
      stack: { id: 'failing-stack', assetCount: 2, primaryAssetId: 'first' },
    });
    const second = timelineAssetFactory.build({
      stack: { id: 'late-stack', assetCount: 2, primaryAssetId: 'second' },
    });
    const late = deferred<StackResponseDto>();
    getStackMock.mockImplementation(({ id }) =>
      id === 'failing-stack' ? Promise.reject(new Error('permission denied')) : late.promise,
    );

    await sut.setSelectWholeStack(true);
    await expect(sut.addAssetsWithStacks([first, second])).resolves.toBe(false);
    late.resolve(stackResponse('late-stack'));
    await Promise.resolve();

    expect(sut.assets).toEqual([]);
  });

  it('does not apply a late action refresh response after another stack refresh fails', async () => {
    const [first, second] = [
      timelineAssetFactory.build({ stack: { id: 'first-stack', assetCount: 2, primaryAssetId: 'first' } }),
      timelineAssetFactory.build({ stack: { id: 'second-stack', assetCount: 2, primaryAssetId: 'second' } }),
    ];
    getStackMock.mockImplementation(({ id }) => Promise.resolve(stackResponse(id)));
    await sut.setSelectWholeStack(true);
    await sut.addAssetsWithStacks([first, second]);

    const late = deferred<StackResponseDto>();
    getStackMock.mockImplementation(({ id }) =>
      id === 'first-stack' ? Promise.reject(new Error('permission denied')) : late.promise,
    );
    await expect(sut.getAssetsForAction()).resolves.toBeUndefined();
    late.resolve(stackResponse('second-stack'));
    await Promise.resolve();

    expect(sut.assets.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  it('does not roll back a newer selection when an older stack request rejects', async () => {
    const first = timelineAssetFactory.build({
      stack: { id: 'first-stack', assetCount: 2, primaryAssetId: 'first' },
    });
    const second = timelineAssetFactory.build({
      stack: { id: 'second-stack', assetCount: 2, primaryAssetId: 'second' },
    });
    const olderRequest = deferred<StackResponseDto>();
    getStackMock
      .mockReturnValueOnce(olderRequest.promise)
      .mockImplementation(({ id }) => Promise.resolve(stackResponse(id)));

    await sut.setSelectWholeStack(true);
    const olderSelection = sut.addAssetWithStack(first);
    await sut.addAssetWithStack(second);
    olderRequest.reject(new Error('permission denied'));

    await expect(olderSelection).resolves.toBe(false);
    expect(sut.assets.map(({ id }) => id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(sut.selectWholeStack).toBe(true);
  });

  it('keeps whole-stack mode enabled when its initial resolution is superseded', async () => {
    const stacked = timelineAssetFactory.build({
      stack: { id: 'pending-stack', assetCount: 2, primaryAssetId: 'primary' },
    });
    const ordinary = timelineAssetFactory.build();
    const initialRequest = deferred<StackResponseDto>();
    getStackMock
      .mockReturnValueOnce(initialRequest.promise)
      .mockImplementation(({ id }) => Promise.resolve(stackResponse(id)));

    sut.selectAsset(stacked);
    const enableWholeStack = sut.setSelectWholeStack(true);
    sut.selectAsset(ordinary);
    initialRequest.resolve(stackResponse('pending-stack'));

    await expect(enableWholeStack).resolves.toBe(true);
    expect(sut.selectWholeStack).toBe(true);
  });
});
