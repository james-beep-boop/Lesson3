// @vitest-environment jsdom
/**
 * Guide + Compare visual-system invariants (docs/DESIGN-visual-system-2026-07-31.md, PR 2b).
 *
 * Three things this PR fixed, each of which regresses SILENTLY — no type error, no lint error, and
 * (as the project has now learned twice) no failing test unless one is written for it:
 *
 *  1. **The Guide declared its own page title.** `.guide h1` was `1.4rem`/600 where every other page
 *     title is 30px/700, so the Guide rendered its title a full step small. The fix DELETES that
 *     rule so the shared `.page-heading h1` governs — which only works while no rule re-declares a
 *     competing size at equal specificity.
 *  2. **The compare pickers were outside every system.** Not `.btn`, and absent from the ≤640px
 *     touch list, so no rule lifted them to the project's 44px target: measured 30.59px at 390px.
 *     Same defect class as `.btn--compact` in #179 — a control nobody noticed was uncovered.
 *  3. **`PageHeader` is the one page-heading shape.** The duplicate `.lesson-heading*` rules are
 *     gone; a caller re-introducing hand-rolled heading markup would drift again.
 *
 * Follows `buttonSystem.spec.ts`: mostly asserted against the stylesheet SOURCE with postcss,
 * because jsdom cannot expand shorthands whose value is a `var()`, so a computed-style probe would
 * measure jsdom's limits rather than ours. Geometry itself was verified in a real browser at
 * 390/550/700/1280 before merge — these guards pin the cascade facts that browser pass depends on.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import PageHeader from '@/components/PageHeader'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8')
const adminCss = readFileSync(resolve(here, '../../src/app/(payload)/custom.scss'), 'utf8')

const root = postcss.parse(css)

/** Every rule INCLUDING at-rule children — the shape "can any rule reach this?" questions want. */
const allRules: { selectors: string[]; body: string }[] = []
root.walkRules((r) => {
  allRules.push({
    selectors: r.selectors.map((s) => s.trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
  })
})

const allSelectors = allRules.flatMap((r) => r.selectors)
const rulesFor = (sel: string) => allRules.filter((r) => r.selectors.includes(sel))
const bodyOf = (sel: string) => {
  const hit = rulesFor(sel)[0]
  if (!hit) throw new Error(`no rule for selector "${sel}"`)
  return hit.body
}

describe('Guide + Compare visual system', () => {
  it('gives the page title one owner, reachable from the shared header', () => {
    // `.page-heading h1`, not `.lesson-heading h1` — the latter reached only two pages, which is
    // exactly why the Guide had to declare its own.
    const body = bodyOf('.page-heading h1')
    expect(body).toMatch(/font-size:\s*var\(--app-page-title-size\)/)
    expect(body).toMatch(/font-weight:\s*700/)
  })

  it('lets no rule re-declare a competing page-title size on the Guide', () => {
    // The regression that would undo fix #1. `.guide h1` and `.page-heading h1` are BOTH (0-1-1),
    // so a restated size would not lose loudly — it would win or lose on source order. The
    // invariant is that no such competitor exists at all.
    const competing = allRules.filter(
      (r) =>
        r.selectors.some((s) => /^\.guide\s+h1$/.test(s)) && /font-size|font-weight/.test(r.body),
    )
    expect(
      competing.flatMap((r) => r.selectors),
      '.guide h1 must not declare its own size/weight — it inherits .page-heading h1',
    ).toEqual([])
  })

  it('retires the duplicated .lesson-heading rule set', () => {
    // Byte-identical to `.page-heading` / `.page-heading__actions`, and both were applied together.
    for (const dead of ['.lesson-heading', '.lesson-heading__actions', '.lesson-heading__text']) {
      expect(allSelectors, `${dead} was replaced by the .page-heading equivalent`).not.toContain(
        dead,
      )
    }
    expect(allSelectors).toContain('.page-heading__text')
  })

  it('gives the compare pickers the button system geometry', () => {
    // Geometry only — deliberately NOT appearance. A <select> keeps its native chevron, or it looks
    // like a button and lies about what it does.
    const body = bodyOf('.compare-picker')
    expect(body).toMatch(/min-height:\s*var\(--app-btn-min-height\)/)
    expect(body).toMatch(/border-radius:\s*var\(--app-btn-radius\)/)
    expect(body).toMatch(/font-size:\s*var\(--app-btn-font-size\)/)
    expect(body, 'the picker must not be given a button background').not.toMatch(/appearance:/)
  })

  it('lifts the compare pickers to the touch target at ≤640px', () => {
    // THE shipped defect: measured 30.59px at 390px before this PR. Asserted by reachability rather
    // than by "the rule is in the media block", so a different-but-correct implementation passes —
    // the same correction CodeRabbit made to the `.btn--compact` guard in #179.
    const reached = allRules
      .filter((r) => r.body.includes('--app-btn-touch-min-height'))
      .flatMap((r) => r.selectors)
    expect(reached, 'expected a ≤640px .compare-picker touch-target rule').toContain(
      '.compare-picker',
    )
  })

  it('keeps the picker touch rule at a specificity the base rule cannot outrank', () => {
    // A media query adds NO specificity. Both rules are `.compare-picker` (0-1-0), so the media
    // block wins on source order only — assert it really is later, since that is what carries it.
    const idx = allRules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.selectors.includes('.compare-picker'))
    const base = idx.find(({ r }) => r.body.includes('--app-btn-min-height'))
    const touch = idx.find(({ r }) => r.body.includes('--app-btn-touch-min-height'))
    expect(base, 'base .compare-picker rule missing').toBeDefined()
    expect(touch, 'touch .compare-picker rule missing').toBeDefined()
    expect(
      touch!.i,
      'the ≤640px picker rule must come after the base rule — equal specificity, order decides',
    ).toBeGreaterThan(base!.i)
  })

  it('derives the guide TOC clearance from the tokens that build the bar', () => {
    // Both `scroll-margin-top` values used to be hand-typed magic numbers with no stated link to the
    // sticky bar they cleared, so retokenising the bar would have silently broken anchor landing
    // (the seam DECISIONS 2026-07-27 legislated about after #155). One formula, one consumer.
    expect(bodyOf('.guide')).toMatch(/--guide-toc-height:\s*calc\(/)
    expect(bodyOf('.guide-section')).toMatch(/scroll-margin-top:\s*calc\(.*--guide-toc-height/)
    // Only the ROW COUNT may vary per breakpoint — a second literal offset would re-open the seam.
    const literalOffsets = allRules.filter(
      (r) =>
        r.selectors.includes('.guide-section') &&
        /scroll-margin-top:\s*[\d.]+(rem|px)/.test(r.body),
    )
    expect(
      literalOffsets.flatMap((r) => r.body),
      'guide scroll-margin-top must derive from --guide-toc-height, not a literal',
    ).toEqual([])
  })
})

/**
 * Manage's controls (operator report 2026-08-02: "Delete selected should be a button like all the
 * other standard buttons", then "same with the upload button — review all buttons like that").
 *
 * The admin button system is applied by SCOPE, not by a single class, so a control joins it only if
 * some selector lists its container. That makes "which scopes are covered" the load-bearing fact,
 * and it is invisible in review: three controls sat outside it for months (measured 29.08px against
 * the system's 38px, with `Remove` reading as bare text beside a bordered `Delete`).
 *
 * The geometry block and the ≤640px touch block must list the SAME scopes. If they drift, a control
 * gets desktop geometry and no touch target, or vice versa — which is how this file's compare-picker
 * defect happened on the frontend.
 */
describe('admin button-system scope coverage', () => {
  /**
   * The selector list of the rule that declares `needle`.
   *
   * Scanned as TEXT, not parsed: `custom.scss` is Sass — `//` comments and nesting — and postcss
   * throws on it (`buttonSystem.spec.ts` reads this same file with plain string scanning for the
   * same reason). Walk back from the declaration to the preceding `{`, then take the selector list
   * before it, dropping comment lines.
   */
  const scopeListFor = (token: string): string[] => {
    // Match the USE — `var(--x)` — not the bare token, which also appears in prose comments. The
    // first draft of this helper matched a comment and returned English as a selector list.
    const at = adminCss.indexOf(`var(${token})`)
    if (at === -1) throw new Error(`no rule declares var(${token})`)
    const open = adminCss.lastIndexOf('{', at)
    const prevClose = Math.max(adminCss.lastIndexOf('}', open), adminCss.lastIndexOf(';', open))
    const slice = adminCss.slice(prevClose + 1, open)
    // Drop any at-rule opener the slice swept up (`@media (max-width: 640px) {`), or it glues onto
    // the first selector and no exact match succeeds.
    const selectorText = slice.slice(slice.lastIndexOf('{') + 1)
    return (
      selectorText
        // Comments FIRST, then split — a `//` line containing a comma would otherwise become two
        // bogus selectors and no filter afterwards can tell them from real ones.
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
        .join(' ')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }

  const MANAGE_SCOPES = [
    '.lp-manage__row-actions .btn',
    '.lp-manage__row .btn',
    '.lp-manage__editors-add .btn',
    '.lp-admin-list__bar .btn',
    '.lp-manage__upload .btn',
  ]

  it('covers every Manage action scope with the shared geometry', () => {
    const geometry = scopeListFor('--app-btn-min-height')
    for (const scope of MANAGE_SCOPES) {
      expect(geometry, `${scope} must be in the admin button geometry rule`).toContain(scope)
    }
  })

  it('gives the touch block the same scopes as the geometry block', () => {
    // Not "some 44px rule exists somewhere" — the two lists must agree, or a scope added to one and
    // forgotten in the other ships a control that is 38px on desktop and 38px on a phone.
    const touch = scopeListFor('--app-btn-touch-min-height')
    for (const scope of MANAGE_SCOPES) {
      expect(touch, `${scope} must also reach the ≤640px touch target`).toContain(scope)
    }
    expect(touch, 'the version editor must keep its touch target too').toContain(
      '.collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn',
    )
  })

  it('gives Manage form controls the button geometry and the touch target', () => {
    // A 31px select beside a 38px button was the mismatch left after the buttons were fixed.
    const geometry = scopeListFor('--app-btn-min-height')
    const touch = scopeListFor('--app-btn-touch-min-height')
    for (const sel of ['.lp-manage__select', '.lp-admin-list__search']) {
      expect(touch, `${sel} must reach the ≤640px touch target`).toContain(sel)
    }
    // Their geometry lives in its own rule (they take size, not button paint) — assert it exists.
    expect(adminCss).toMatch(/\.lp-manage__select,\s*\n\.lp-admin-list__search\s*\{/)
    expect(geometry.length, 'the button geometry rule should still be found').toBeGreaterThan(0)
  })
})

describe('PageHeader', () => {
  afterEach(cleanup)

  it('emits the shared heading shape for a title-only caller', () => {
    const { container } = render(<PageHeader title="Compare: Cell Structure" />)
    const row = container.querySelector('.page-heading')
    expect(row).not.toBeNull()
    expect(row!.querySelector('.page-heading__text > h1')?.textContent).toBe(
      'Compare: Cell Structure',
    )
    // No actions passed → no empty action container left behind.
    expect(row!.querySelector('.page-heading__actions')).toBeNull()
    expect(container.querySelector('.lesson-heading')).toBeNull()
  })

  it('renders the kicker ABOVE and the sub-title BELOW the title', () => {
    // The two slots are separate precisely so neither the Guide nor the lesson page has to move its
    // text to share one component. Order is the contract.
    const { container } = render(
      <PageHeader
        title="ARES Lesson Plans"
        kicker={<p className="guide-kicker">User guide</p>}
      >
        <p className="lesson-context">Biology · Grade 10</p>
      </PageHeader>,
    )
    const kids = [...container.querySelectorAll('.page-heading__text > *')]
    expect(kids.map((e) => e.tagName)).toEqual(['P', 'H1', 'P'])
    expect(kids[0].className).toBe('guide-kicker')
    expect(kids[2].className).toBe('lesson-context')
  })

  it('puts every action in the shared action cluster', () => {
    render(
      <PageHeader
        title="Cell Structure"
        actions={
          <>
            <button>Favorite</button>
            {/* Stands in for PageBackLink; a fragment href keeps this a real link without
                pulling next/link (and its router) into a pure DOM-shape test. */}
            <a href="#back">Back</a>
          </>
        }
      />,
    )
    const actions = document.querySelector('.page-heading__actions')!
    expect(actions.children).toHaveLength(2)
    // Both actions live INSIDE the cluster — the thing that keeps the lesson page's Favorite and
    // Back on one row rather than one of them escaping into the title column.
    expect(actions.contains(screen.getByRole('button', { name: 'Favorite' }))).toBe(true)
    expect(actions.contains(screen.getByRole('link', { name: 'Back' }))).toBe(true)
  })

  it('keeps a caller className alongside the shared one', () => {
    const { container } = render(<PageHeader title="X" className="lesson--compare" />)
    const row = container.querySelector('.page-heading')!
    expect([...row.classList].sort()).toEqual(['lesson--compare', 'page-heading'])
  })
})
