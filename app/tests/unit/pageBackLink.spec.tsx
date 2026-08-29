import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import PageBackLink from '../../src/components/PageBackLink'

describe('PageBackLink', () => {
  it('renders the shared prominent Back control', () => {
    const html = renderToStaticMarkup(<PageBackLink href="/lessons/12" label="Back to lesson" />)

    // Class MEMBERSHIP, not the whole attribute: the control carries variant classes beside `btn`.
    expect(html).toMatch(/class="[^"]*\bbtn\b/)
    expect(html).toContain('href="/lessons/12"')
    // The visible label is always the bare word; the destination lives in the accessible name
    // (DESIGN-button-system-2026-07-30 §2), so a screen-reader user still hears where it goes.
    // ⚑ NO GLYPH, AND QUIET+COMPACT (2026-08-29). The `←` was decorative — `aria-label` carries the
    // destination — and it pulled a fixed-destination link toward looking like browser-back. Asserting
    // its ABSENCE is the point: re-adding it would undo a deliberate decision silently.
    expect(html).toContain('>Back<')
    expect(html).not.toContain('←')
    expect(html).toContain('btn--quiet')
    expect(html).toContain('btn--compact')
    expect(html).toContain('aria-label="Back to lesson"')
    expect(html).not.toContain('>Back to lesson<')
  })
})
