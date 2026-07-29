import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import PageBackLink from '../../src/components/PageBackLink'

describe('PageBackLink', () => {
  it('renders the shared prominent Back control', () => {
    const html = renderToStaticMarkup(
      <PageBackLink href="/lessons/12">Back to lesson</PageBackLink>,
    )

    expect(html).toContain('class="page-back"')
    expect(html).toContain('href="/lessons/12"')
    expect(html).toContain('<span aria-hidden="true">←</span>Back to lesson')
  })
})
