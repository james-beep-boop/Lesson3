/** Standard / Advanced tools: the one list and the one resolver (2026-10-20, `lib/advancedTools.ts`). */
import { describe, expect, it } from 'vitest'

import { ADVANCED_ACTIONS, resolveMode, showsAction } from '../../src/lib/advancedTools'

describe('resolveMode', () => {
  it('is Standard unless the site switch is explicitly on — absent or unreadable fails to Standard', () => {
    expect(resolveMode(undefined)).toBe('standard')
    expect(resolveMode({ advancedTools: false })).toBe('standard')
    expect(resolveMode({ advancedTools: true })).toBe('advanced')
  })
})

describe('the advanced actions', () => {
  it('are exactly the operator’s list — Insert link deliberately stays everyday', () => {
    expect([...ADVANCED_ACTIONS].sort()).toEqual(
      ['combineVersions', 'downloadJson', 'emailDocuments', 'showDetails'].sort(),
    )
    expect(ADVANCED_ACTIONS as readonly string[]).not.toContain('insertLink')
  })

  it.each(ADVANCED_ACTIONS)('%s is hidden in Standard and shown in Advanced', (action) => {
    expect(showsAction('standard', action)).toBe(false)
    expect(showsAction('advanced', action)).toBe(true)
  })
})
