// @vitest-environment jsdom
/**
 * The compare page opens FILTERED — only areas that differ between the two versions are shown
 * (operator decision 2026-08-23).
 *
 * ⚑ WHY THIS IS PINNED. It is a one-word default (`useState(true)`) carrying a product requirement:
 * a real bundle is forty-odd pages, so opening unfiltered means a two-word edit is unfindable, which
 * is the entire problem the per-area compare view was built to solve. Flipping it costs nothing and
 * breaks nothing else, so nothing but this test would notice.
 *
 * The hiding itself is CSS (`.compare-body--changes-only [data-changed='false']`, pinned in
 * `guideCompareVisual.spec.tsx`) — jsdom cannot evaluate that, so this asserts the two things it
 * can: the class the CSS keys off, and the `aria-pressed` state a screen reader is told.
 *
 * Component test → jsdom. DB-free, runs in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import CompareFilter from '@/app/(frontend)/lessons/[id]/compare/CompareFilter'

afterEach(cleanup)

const renderFilter = () =>
  render(
    <CompareFilter>
      <section data-changed="true">changed area</section>
      <section data-changed="false">untouched area</section>
    </CompareFilter>,
  )

describe('CompareFilter opens showing only the changed areas', () => {
  it('applies the changes-only class and reports the control as pressed', () => {
    const { container } = renderFilter()

    expect(
      container.querySelector('.compare-body--changes-only'),
      'the compare body must open with the changes-only class the CSS filter keys off',
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Changes only' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('still renders every area, so toggling needs no server round trip', () => {
    renderFilter()
    // Both are in the DOM from the first paint — the filter only hides one with CSS.
    expect(screen.getByText('changed area')).toBeTruthy()
    expect(screen.getByText('untouched area')).toBeTruthy()
  })

  it('the control turns the filter off and on again', () => {
    const { container } = renderFilter()
    const button = screen.getByRole('button', { name: 'Changes only' })

    fireEvent.click(button)
    expect(container.querySelector('.compare-body--changes-only')).toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)
    expect(container.querySelector('.compare-body--changes-only')).not.toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
})
