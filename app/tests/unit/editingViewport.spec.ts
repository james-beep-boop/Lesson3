/**
 * `editingAvailableAtWidth` — pins the operator's 2026-07-28 rule: lesson-content editing is a
 * laptop/tablet affordance and is unavailable at or below 640px. This is the exact predicate the
 * LessonControls mount guard runs (`!editingAvailableAtWidth(window.innerWidth)` → force view mode),
 * so these cases cover the shipping decision rather than a parallel copy of it.
 */
import { describe, it, expect } from 'vitest'

import { MOBILE_EDIT_MAX_WIDTH, editingAvailableAtWidth } from '../../src/lib/editingViewport'

describe('editingAvailableAtWidth', () => {
  it('is unavailable below the breakpoint', () => {
    expect(editingAvailableAtWidth(320)).toBe(false)
    expect(editingAvailableAtWidth(639)).toBe(false)
  })

  it('is unavailable AT the breakpoint (matches CSS max-width: 640px)', () => {
    expect(editingAvailableAtWidth(640)).toBe(false)
  })

  it('is available above the breakpoint', () => {
    expect(editingAvailableAtWidth(641)).toBe(true)
    expect(editingAvailableAtWidth(1280)).toBe(true)
  })

  it('exports the breakpoint constant (must match the CSS @media blocks)', () => {
    expect(MOBILE_EDIT_MAX_WIDTH).toBe(640)
  })
})
