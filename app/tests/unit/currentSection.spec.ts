/**
 * The editor jump nav's active-section RULE (`components/LessonControls/currentSection.ts`). This is
 * the risky half of the 2026-07-25 current-lesson indicator. The "which section am I in" decision is
 * pinned here; the DOM plumbing (scroll + ResizeObserver, toolbar measurement) is NOT covered by any
 * automated test and — as of 2026-07-26 — is still awaiting browser verification. Do not read these
 * passing cases as evidence the indicator works on screen; see
 * docs/DESIGN-editor-usability-2026-07-25.md §6 for the scenarios that must be checked by hand.
 *
 * Deliberately DOM-free so it runs in the default node environment. `sectionKeyForFocus` needs a real
 * `closest`, so it lives in `sectionKeyForFocus.spec.ts` under jsdom.
 */
import { describe, it, expect } from 'vitest'

import { pickCurrentSection } from '@/components/LessonControls/currentSection'

const TOOLBAR = 100

describe('pickCurrentSection', () => {
  it('picks the last section whose header crossed the line', () => {
    const positions = [
      { key: 'lessons-row-0', top: -800 },
      { key: 'lessons-row-1', top: -200 },
      { key: 'lessons-row-2', top: 60 }, // crossed (above the 100px toolbar line)
      { key: 'lessons-row-3', top: 400 }, // still below
    ]
    expect(pickCurrentSection(positions, TOOLBAR)).toBe('lessons-row-2')
  })

  it('returns null when nothing has crossed yet (reader still above the first section)', () => {
    const positions = [
      { key: 'lessons-row-0', top: 300 },
      { key: 'lessons-row-1', top: 900 },
    ]
    expect(pickCurrentSection(positions, TOOLBAR)).toBeNull()
  })

  it('returns the final section once everything has scrolled past', () => {
    const positions = [
      { key: 'lessons-row-0', top: -2000 },
      { key: 'field-finalExplanation', top: -900 },
      { key: 'field-summaryTable', top: -120 },
    ]
    expect(pickCurrentSection(positions, TOOLBAR)).toBe('field-summaryTable')
  })

  it('counts a header resting exactly on the line as crossed', () => {
    expect(pickCurrentSection([{ key: 'lessons-row-4', top: TOOLBAR }], TOOLBAR)).toBe('lessons-row-4')
    // ...and one clearly below it as not crossed (beyond the sub-pixel tolerance).
    expect(pickCurrentSection([{ key: 'lessons-row-4', top: TOOLBAR + 5 }], TOOLBAR)).toBeNull()
  })

  it('resolves by position, not input order', () => {
    const shuffled = [
      { key: 'lessons-row-2', top: 20 },
      { key: 'lessons-row-0', top: -500 },
      { key: 'lessons-row-1', top: -240 },
    ]
    expect(pickCurrentSection(shuffled, TOOLBAR)).toBe('lessons-row-2')
  })

  it('handles a run of collapsed short headers sharing the viewport', () => {
    // Collapsed rows are ~40px tall, so several sit above the line at once — the rule must still
    // resolve to the lowest crossed one rather than the first it happens to see.
    const positions = Array.from({ length: 8 }, (_, i) => ({
      key: `lessons-row-${i}`,
      top: -300 + i * 40,
    }))
    // tops: -300,-260,-220,-180,-140,-100,-60,-20 → all crossed; the last is row 7.
    expect(pickCurrentSection(positions, TOOLBAR)).toBe('lessons-row-7')
  })

  it('hands off from the last lesson to the trailing groups', () => {
    const atFinalExplanation = [
      { key: 'lessons-row-7', top: -400 },
      { key: 'field-finalExplanation', top: 30 },
      { key: 'field-summaryTable', top: 700 },
    ]
    expect(pickCurrentSection(atFinalExplanation, TOOLBAR)).toBe('field-finalExplanation')
  })

  it('returns null for an empty list', () => {
    expect(pickCurrentSection([], TOOLBAR)).toBeNull()
  })

  it('treats a non-sticky toolbar (threshold 0) as the viewport top', () => {
    // Below 640px `.doc-controls` is static, so the measured bottom collapses to 0.
    const positions = [
      { key: 'lessons-row-0', top: -10 },
      { key: 'lessons-row-1', top: 10 },
    ]
    expect(pickCurrentSection(positions, 0)).toBe('lessons-row-0')
  })
})

