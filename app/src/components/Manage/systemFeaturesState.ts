import { SAVEABLE_FLAGS, type SaveableFlag } from '../../lib/systemFlagNames'

export type FeatureValues = Record<SaveableFlag, boolean>

/**
 * The toggles edit pending values only. The persisted values and the freshness token change on Save.
 * One record per saveable flag (2026-10-20: Discussions and Advanced tools), so the panel, the pending
 * summary and the request body all come from `SAVEABLE_FLAGS` rather than naming flags by hand.
 */
export interface FeaturesState {
  saved: FeatureValues
  pending: FeatureValues
  updatedAt: string
}

export type FeaturesAction =
  | { type: 'toggle'; flag: SaveableFlag; enabled: boolean }
  | { type: 'saved'; features: FeatureValues; updatedAt: string }

export function featuresReducer(state: FeaturesState, action: FeaturesAction): FeaturesState {
  return action.type === 'toggle'
    ? { ...state, pending: { ...state.pending, [action.flag]: action.enabled } }
    : {
        saved: { ...action.features },
        pending: { ...action.features },
        updatedAt: action.updatedAt,
      }
}

/** Only the flags that differ from what is saved, or null when nothing would change. */
export const pendingChanges = (state: FeaturesState): Partial<FeatureValues> | null => {
  const changed = SAVEABLE_FLAGS.filter((flag) => state.pending[flag] !== state.saved[flag])
  return changed.length
    ? Object.fromEntries(changed.map((flag) => [flag, state.pending[flag]]))
    : null
}
