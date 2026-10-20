import { describe, expect, it } from 'vitest'
import { featuresReducer, pendingChanges } from '../../src/components/Manage/systemFeaturesState'

describe('pending System settings', () => {
  const initial = {
    saved: { forumEnabled: true, advancedTools: false },
    pending: { forumEnabled: true, advancedTools: false },
    updatedAt: 'before-save',
  }

  it('a toggle changes only that pending value, preserving the Save freshness token', () => {
    const state = featuresReducer(initial, { type: 'toggle', flag: 'forumEnabled', enabled: false })
    expect(state.saved).toEqual(initial.saved)
    expect(state.updatedAt).toBe('before-save')
    expect(pendingChanges(state)).toEqual({ forumEnabled: false })
    expect(
      pendingChanges(
        featuresReducer(state, { type: 'toggle', flag: 'forumEnabled', enabled: true }),
      ),
    ).toBeNull()
  })

  it('switching Advanced tools leaves Discussions untouched', () => {
    const state = featuresReducer(initial, { type: 'toggle', flag: 'advancedTools', enabled: true })
    expect(state.pending.forumEnabled).toBe(true)
    expect(pendingChanges(state)).toEqual({ advancedTools: true })
  })

  it('only a confirmed Save adopts the persisted values and new freshness token', () => {
    const state = featuresReducer(initial, {
      type: 'saved',
      features: { forumEnabled: false, advancedTools: true },
      updatedAt: 'after-save',
    })
    expect(state).toEqual({
      saved: { forumEnabled: false, advancedTools: true },
      pending: { forumEnabled: false, advancedTools: true },
      updatedAt: 'after-save',
    })
    expect(pendingChanges(state)).toBeNull()
    expect(
      pendingChanges(
        featuresReducer(state, { type: 'toggle', flag: 'forumEnabled', enabled: true }),
      ),
    ).toEqual({ forumEnabled: true })
  })
})
