/**
 * The editor jump nav's active-section RULE (`components/LessonControls/currentSection.ts`). This is
 * the risky half of the 2026-07-25 current-lesson indicator. The "which section am I in" decision is
 * pinned here; the DOM plumbing (scroll + ResizeObserver, toolbar measurement) has NO automated cover and
 * must be checked by hand — docs/DESIGN-editor-usability-2026-07-25.md §6 lists the scenarios. Passing
 * cases here are not evidence the indicator works on screen.
 *
 * Deliberately DOM-free so it runs in the default node environment. `sectionKeyForFocus` needs a real
 * `closest`, so it lives in `sectionKeyForFocus.spec.ts` under jsdom.
 */
import { describe, it, expect } from 'vitest'

import { crossingLine, pickCurrentSection } from '@/components/LessonControls/currentSection'

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
    expect(pickCurrentSection([{ key: 'lessons-row-4', top: TOOLBAR }], TOOLBAR)).toBe(
      'lessons-row-4',
    )
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

describe('crossingLine', () => {
  // The regression this exists to stop: a jump parks its target at `scroll-margin-top`, so if the
  // tracker's line sits ABOVE that, the just-jumped-to section never counts as crossed and the
  // clicked chip lights its neighbour instead. Live on the Rock 2026-07-28 this was 7rem = 105px
  // over a 99px toolbar — only 6px, and 5 of 6 chip jumps were wrong.
  it('takes the landing line when it sits below the toolbar', () => {
    expect(crossingLine(99, 105)).toBe(105)
  })

  // The mirror case, which `max` also has to cover: let the bar wrap to a third row past the margin
  // and preferring the landing line alone would reproduce the same bug from the other side.
  it('takes the toolbar when it wraps past the landing line', () => {
    expect(crossingLine(140, 105)).toBe(140)
  })

  it('is stable when the two already agree', () => {
    expect(crossingLine(105, 105)).toBe(105)
  })

  // Below 640px the bar is `position: static` (bottom collapses to 0) and the margin shrinks to 1rem.
  it('still yields the landing line on mobile, where the toolbar is not sticky', () => {
    expect(crossingLine(0, 16)).toBe(16)
  })

  // No tracked section in the DOM yet, so there was nothing to read the margin from.
  it('falls back to the toolbar alone when the landing line is not measurable', () => {
    expect(crossingLine(99, Number.NaN)).toBe(99)
  })
})
