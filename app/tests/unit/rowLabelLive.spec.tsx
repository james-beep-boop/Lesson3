// @vitest-environment jsdom
/**
 * RowLabel stays live while typing (docs/PLAN-editing-typing-speed-2026-10-23.md §4.3). The patched
 * `RowLabelProvider` no longer re-renders on every keystroke, so the label reads the one field it
 * shows from form state. A field present in form state wins even when empty (clearing a title shows
 * "Lesson N", never the old title); the provider's `data` is used only when the field is absent.
 * The browser suite covers the same rules end to end.
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  row: { data: {} as Record<string, unknown>, path: 'lessons.2', rowNumber: 2 },
  fields: {} as Record<string, { value: unknown } | undefined>,
}))

vi.mock('@payloadcms/ui', () => ({
  useRowLabel: () => state.row,
  useFormFields: (selector: (ctx: [typeof state.fields]) => unknown) => selector([state.fields]),
}))

import RowLabel from '@/components/RowLabel'

afterEach(cleanup)

const label = () => screen.getByText(/^Lesson 3/).textContent

describe('RowLabel reads its field live from form state', () => {
  it('shows the live value from form state, not the provider’s older data', () => {
    state.row.data = { title: 'Old title' }
    state.fields = { 'lessons.2.title': { value: 'New title' } }
    render(<RowLabel field="title" noun="Lesson" />)
    expect(label()).toBe('Lesson 3 — New title')
  })

  it('a cleared title shows "Lesson N", never the old title', () => {
    state.row.data = { title: 'Old title' }
    state.fields = { 'lessons.2.title': { value: '' } }
    render(<RowLabel field="title" noun="Lesson" />)
    expect(label()).toBe('Lesson 3')
  })

  it('falls back to the provider’s data only when the field is absent from form state', () => {
    state.row.data = { title: 'From data' }
    state.fields = {}
    render(<RowLabel field="title" noun="Lesson" />)
    expect(label()).toBe('Lesson 3 — From data')
  })

  it('reads the field under the row’s current path (after a reorder)', () => {
    state.row = { data: {}, path: 'lessons.0', rowNumber: 2 }
    state.fields = {
      'lessons.0.title': { value: 'Moved here' },
      'lessons.2.title': { value: 'Not this one' },
    }
    render(<RowLabel field="title" noun="Lesson" />)
    expect(label()).toBe('Lesson 3 — Moved here')
  })
})
