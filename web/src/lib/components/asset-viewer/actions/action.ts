import type { AssetAction } from '$lib/constants';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

/** Every asset an action removed from view, when it affected more than the asset on screen. */
type MultiAssetAction = { asset: TimelineAsset; assetIds?: string[] };

type ActionMap = {
  [AssetAction.ARCHIVE]: MultiAssetAction;
  [AssetAction.UNARCHIVE]: MultiAssetAction;
  [AssetAction.TRASH]: MultiAssetAction;
  [AssetAction.DELETE]: MultiAssetAction;
  [AssetAction.RESTORE]: { asset: TimelineAsset };
  [AssetAction.SET_VISIBILITY_LOCKED]: { asset: TimelineAsset };
  [AssetAction.SET_VISIBILITY_TIMELINE]: { asset: TimelineAsset };
  [AssetAction.RATING]: { asset: TimelineAsset; rating: number | null };
};

export type Action = {
  [K in AssetAction]: { type: K } & ActionMap[K];
}[AssetAction];
export type OnAction = (action: Action) => void;
export type PreAction = (action: Action) => void;

export const getActionAssetIds = (action: Action) =>
  'assetIds' in action && action.assetIds ? action.assetIds : undefined;
