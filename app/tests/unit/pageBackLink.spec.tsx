import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import PageBackLink from '../../src/components/PageBackLink'

describe('PageBackLink', () => {
  it('renders the shared prominent Back control', () => {
    const html = renderToStaticMarkup(<PageBackLink href="/lessons/12" label="Back to lesson" />)

    expect(html).toContain('class="btn"')
    expect(html).toContain('href="/lessons/12"')
    // The visible label is always the bare word; the destination lives in the accessible name
    // (DESIGN-button-system-2026-07-30 §2), so a screen-reader user still hears where it goes.
    expect(html).toContain('<span aria-hidden="true">←</span>Back')
    expect(html).toContain('aria-label="Back to lesson"')
    expect(html).not.toContain('>Back to lesson<')
  })
})
