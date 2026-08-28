// @vitest-environment jsdom
/**
 * `sectionKeyForFocus` — the focus-beats-scroll half of the editor jump nav's active-section tracking
 * (2026-07-25) — plus a live check that `SECTION_SELECTOR` really matches a generated lesson-row id.
 * Needs a real `Element.closest`/`matches`, hence jsdom; the pure rule is in `currentSection.spec.ts`.
 *
 * Fixtures reproduce payload@3.85.1's real row-id shapes — see the module header in
 * `currentSection.ts` for the verification and why the nested shapes must not match.
 */
import { describe, it, expect } from 'vitest'

import {
  lessonRowId,
  ownCollapsedToggle,
  sectionKeyForFocus,
  SECTION_SELECTOR,
} from '@/components/LessonControls/currentSection'

const build = (html: string) => {
  document.body.innerHTML = html
  return document.getElementById('probe')
}

describe('SECTION_SELECTOR', () => {
  it('matches an element carrying a generated lesson-row id', () => {
    // A real drift guard: ties the selector to `lessonRowId`, the same builder the component's chips
    // use. If either side's id shape moves, this fails.
    document.body.innerHTML = `<div id="${lessonRowId(2)}"></div>`
    expect(document.getElementById(lessonRowId(2))?.matches(SECTION_SELECTOR)).toBe(true)
  })

  it('does not match a nested array row that merely contains the prefix', () => {
    document.body.innerHTML = `<div id="summaryTable-lessons-row-0"></div>`
    expect(document.getElementById('summaryTable-lessons-row-0')?.matches(SECTION_SELECTOR)).toBe(
      false,
    )
  })
})

describe('sectionKeyForFocus', () => {
  it('resolves a focused field to its enclosing lesson row', () => {
    expect(
      sectionKeyForFocus(
        build(`<div id="lessons-row-2"><div><textarea id="probe"></textarea></div></div>`),
      ),
    ).toBe('lessons-row-2')
  })

  it('does NOT mistake the nested Summary-Table array for a lesson row', () => {
    expect(
      sectionKeyForFocus(
        build(
          `<div id="field-summaryTable"><div id="summaryTable-lessons-row-0">` +
            `<textarea id="probe"></textarea></div></div>`,
        ),
      ),
    ).toBe('field-summaryTable')
  })

  it('resolves a phase field to its lesson, not to the phase row', () => {
    expect(
      sectionKeyForFocus(
        build(
          `<div id="lessons-row-1"><div id="lessons-1-framework-row-3">` +
            `<textarea id="probe"></textarea></div></div>`,
        ),
      ),
    ).toBe('lessons-row-1')
  })

  it('resolves a field in the Final Explanation group', () => {
    expect(
      sectionKeyForFocus(
        build(`<div id="field-finalExplanation"><textarea id="probe"></textarea></div>`),
      ),
    ).toBe('field-finalExplanation')
  })

  it('returns null for focus outside every section (e.g. a toolbar button)', () => {
    // This is what hands control back to scroll position when the user clicks Preview.
    expect(
      sectionKeyForFocus(
        build(`<div class="doc-controls"><button id="probe">Preview</button></div>`),
      ),
    ).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(sectionKeyForFocus(null)).toBeNull()
    expect(sectionKeyForFocus(undefined)).toBeNull()
  })
})

/**
 * Regression cover for a defect found in review (2026-07-25): the jump nav used to search a target's
 * WHOLE subtree for a collapsed toggle. Harmless while nested arrays rendered expanded — but every
 * nested array now starts collapsed, so jumping to an already-open lesson expanded its first phase,
 * and jumping to Final Explanation expanded its first section.
 *
 * DOM per payload@3.85.1 `ArrayRow.js` + `elements/Collapsible`: `<div id={rowId}><div
 * class="collapsible [collapsible--collapsed]"><div class="collapsible__toggle-wrap"><button
 * class="collapsible__toggle">`. Nested collapsibles additionally carry `collapsible--nested`.
 */
const row = (id: string, collapsed: boolean, inner = '') =>
  `<div id="${id}"><div class="collapsible collapsible--style-default${
    collapsed ? ' collapsible--collapsed' : ''
  }"><div class="collapsible__toggle-wrap"><button class="collapsible__toggle" data-own="${id}">t</button></div>` +
  `<div class="collapsible__content">${inner}</div></div></div>`

describe('ownCollapsedToggle', () => {
  it('returns the row’s own toggle when the row is collapsed', () => {
    document.body.innerHTML = row(lessonRowId(0), true)
    const toggle = ownCollapsedToggle(document.getElementById(lessonRowId(0)))
    expect(toggle?.dataset.own).toBe(lessonRowId(0))
  })

  it('returns null for an already-open lesson holding a collapsed PHASE row', () => {
    // The defect: this used to return the nested phase toggle, so revisiting an open lesson silently
    // expanded its first phase.
    document.body.innerHTML = row(
      lessonRowId(1),
      false,
      `<div id="lessons-1-framework-row-0"><div class="collapsible collapsible--nested collapsible--collapsed">` +
        `<div class="collapsible__toggle-wrap"><button class="collapsible__toggle" data-own="phase">t</button></div></div></div>`,
    )
    expect(ownCollapsedToggle(document.getElementById(lessonRowId(1)))).toBeNull()
  })

  it('returns Final Explanation’s own toggle without selecting a nested section row', () => {
    document.body.innerHTML =
      `<div id="field-finalExplanation"><div class="group-field__wrap"><div class="render-fields"><div class="collapsible-field">` +
      `<div class="collapsible collapsible--collapsed"><button class="collapsible__toggle" data-own="final-explanation">t</button>` +
      `<div id="finalExplanation-sections-row-0"><div class="collapsible collapsible--nested collapsible--collapsed">` +
      `<button class="collapsible__toggle" data-own="section">t</button></div></div></div></div></div></div></div>`
    const toggle = ownCollapsedToggle(document.getElementById('field-finalExplanation'))
    expect(toggle?.dataset.own).toBe('final-explanation')
  })

  it('does not mistake a nested section row for a group’s own collapsible', () => {
    document.body.innerHTML =
      `<div id="field-summaryTable"><div class="group-field__wrap"><div class="render-fields">` +
      `<div class="collapsible collapsible--nested collapsible--collapsed">` +
      `<button class="collapsible__toggle" data-own="nested">t</button></div></div></div></div>`
    expect(ownCollapsedToggle(document.getElementById('field-summaryTable'))).toBeNull()
  })

  it('returns null for an expanded row and for a missing target', () => {
    document.body.innerHTML = row(lessonRowId(2), false)
    expect(ownCollapsedToggle(document.getElementById(lessonRowId(2)))).toBeNull()
    expect(ownCollapsedToggle(null)).toBeNull()
  })
})
