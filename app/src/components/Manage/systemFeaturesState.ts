/** The toggle edits pending state only. The persisted value and freshness token change on Save. */
export interface FeaturesState {
  saved: boolean
  pending: boolean
  updatedAt: string
}

export type FeaturesAction =
  { type: 'toggle'; enabled: boolean } | { type: 'saved'; enabled: boolean; updatedAt: string }

export function featuresReducer(state: FeaturesState, action: FeaturesAction): FeaturesState {
  return action.type === 'toggle'
    ? { ...state, pending: action.enabled }
    : { saved: action.enabled, pending: action.enabled, updatedAt: action.updatedAt }
}

export const pendingChanges = (state: FeaturesState): { forumEnabled: boolean } | null =>
  state.pending === state.saved ? null : { forumEnabled: state.pending }
