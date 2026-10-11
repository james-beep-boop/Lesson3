import { describe, expect, it } from 'vitest'
import { featuresReducer, pendingChanges } from '../../src/components/Manage/systemFeaturesState'

describe('pending System settings', () => {
  const initial = { saved: true, pending: true, updatedAt: 'before-save' }

  it('a toggle changes only the pending value, preserving the Save freshness token', () => {
    const state = featuresReducer(initial, { type: 'toggle', enabled: false })
    expect(state.saved).toBe(true)
    expect(state.updatedAt).toBe('before-save')
    expect(pendingChanges(state)).toEqual({ forumEnabled: false })
    expect(pendingChanges(featuresReducer(state, { type: 'toggle', enabled: true }))).toBeNull()
  })

  it('only a confirmed Save adopts the persisted value and new freshness token', () => {
    const state = featuresReducer(initial, {
      type: 'saved',
      enabled: false,
      updatedAt: 'after-save',
    })
    expect(state).toEqual({ saved: false, pending: false, updatedAt: 'after-save' })
    expect(pendingChanges(state)).toBeNull()
    expect(pendingChanges(featuresReducer(state, { type: 'toggle', enabled: true }))).toEqual({
      forumEnabled: true,
    })
  })
})
