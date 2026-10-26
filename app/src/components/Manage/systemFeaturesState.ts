import { SAVEABLE_FLAGS, type SaveableFlag } from '../../lib/systemFlagNames'

export type FeatureValues = Record<SaveableFlag, boolean>
/** What one Save sends: the switches that changed and, if it changed, the trimmed school name. */
export type SettingsChanges = Partial<FeatureValues> & { schoolName?: string }

/**
 * The toggles edit pending values only. The persisted values and the freshness token change on Save.
 * One record per saveable flag (2026-10-20: Discussions and Advanced tools), so the panel, the pending
 * summary and the request body all come from `SAVEABLE_FLAGS` rather than naming flags by hand.
 * The school name (Part 2) rides the same Save, so it is held the same way: saved and pending.
 */
export interface FeaturesState {
  saved: FeatureValues
  pending: FeatureValues
  savedName: string
  pendingName: string
  updatedAt: string
}

export type FeaturesAction =
  | { type: 'toggle'; flag: SaveableFlag; enabled: boolean }
  | { type: 'rename'; schoolName: string }
  | { type: 'saved'; features: FeatureValues; schoolName: string; updatedAt: string }

export function featuresReducer(state: FeaturesState, action: FeaturesAction): FeaturesState {
  switch (action.type) {
    case 'toggle':
      return { ...state, pending: { ...state.pending, [action.flag]: action.enabled } }
    case 'rename':
      return { ...state, pendingName: action.schoolName }
    case 'saved':
      return {
        saved: { ...action.features },
        pending: { ...action.features },
        savedName: action.schoolName,
        pendingName: action.schoolName,
        updatedAt: action.updatedAt,
      }
  }
}

/** Only what differs from what is saved, or null when nothing would change. */
export const pendingChanges = (state: FeaturesState): SettingsChanges | null => {
  const changes: SettingsChanges = Object.fromEntries(
    SAVEABLE_FLAGS.filter((flag) => state.pending[flag] !== state.saved[flag]).map((flag) => [
      flag,
      state.pending[flag],
    ]),
  )
  const name = state.pendingName.trim()
  if (name !== state.savedName) changes.schoolName = name
  return Object.keys(changes).length ? changes : null
}
