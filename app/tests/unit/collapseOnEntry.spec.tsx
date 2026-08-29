// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const collapsible = { isCollapsed: undefined as boolean | undefined, toggle: vi.fn() }
const documentInfo = { id: undefined as number | string | undefined }

vi.mock('@payloadcms/ui', () => ({
  useCollapsible: () => collapsible,
  useDocumentInfo: () => documentInfo,
}))

import CollapseOnEntry from '@/components/CollapseOnEntry'

beforeEach(() => {
  collapsible.isCollapsed = true
  collapsible.toggle = vi.fn()
  documentInfo.id = 42
})
afterEach(cleanup)

describe('the panel entry rule', () => {
  it('collapses a panel a stored preference reopened', () => {
    collapsible.isCollapsed = false
    render(<CollapseOnEntry />)

    expect(collapsible.toggle).toHaveBeenCalledTimes(1)
  })

  it('leaves an already-compact panel alone', () => {
    render(<CollapseOnEntry />)

    expect(collapsible.toggle).not.toHaveBeenCalled()
  })

  /**
   * ⚑ THE RULE IS "STARTS COMPACT", NOT "STAYS COMPACT". The visit is marked settled on the first
   * run whether or not anything was collapsed, so a reader opening the panel afterwards keeps it
   * open. Latching on the toggle instead would re-fire when `isCollapsed` flipped and snap the panel
   * shut the moment they opened it.
   */
  it('does not fight the reader who opens the panel during the visit', () => {
    const { rerender } = render(<CollapseOnEntry />)
    collapsible.isCollapsed = false
    rerender(<CollapseOnEntry />)

    expect(collapsible.toggle).not.toHaveBeenCalled()
  })

  it('applies again on the next document', () => {
    collapsible.isCollapsed = false
    const { rerender } = render(<CollapseOnEntry />)
    expect(collapsible.toggle).toHaveBeenCalledTimes(1)

    documentInfo.id = 43
    rerender(<CollapseOnEntry />)

    expect(collapsible.toggle).toHaveBeenCalledTimes(2)
  })

  // The panel renders `null` until its preference fetch resolves, so an unsettled state must not
  // consume the one action this visit gets.
  it('waits for a settled disclosure state instead of spending the visit on it', () => {
    collapsible.isCollapsed = undefined
    const { rerender } = render(<CollapseOnEntry />)
    expect(collapsible.toggle).not.toHaveBeenCalled()

    collapsible.isCollapsed = false
    rerender(<CollapseOnEntry />)

    expect(collapsible.toggle).toHaveBeenCalledTimes(1)
  })
})
