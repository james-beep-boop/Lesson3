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
import * as sass from 'sass'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import PageHeader from '@/components/PageHeader'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8')
/**
 * The admin stylesheet, COMPILED. `custom.scss` is Sass (nesting + `//` comments), and postcss throws
 * on it as source — so an earlier version of this spec scanned it as text, with a hand-rolled
 * comment strip and a `://` tripwire guarding the strip. Compiling with the `sass` already in
 * node_modules retires all of it and buys three things:
 *
 *  - assertions see REAL selectors (`.lp-manage__row--tight`) instead of authoring syntax
 *    (`&__row--tight`), so they cannot pass while the compiled cascade is broken, nor fail on a
 *    harmless re-nesting;
 *  - the admin half of this spec gets the same postcss treatment `styles.css` already gets, instead
 *    of being a different kind of test;
 *  - "sass compiles" becomes part of `test:unit` rather than a manual verification step.
 */
const adminCss = sass.compile(resolve(here, '../../src/app/(payload)/custom.scss')).css
const adminRoot = postcss.parse(adminCss)

/**
 * Compiled rules, each tagged with the media query it sits under and its source order.
 *
 * Order matters and is recorded deliberately: several guards below turn on which of two
 * equal-specificity rules comes LAST, which is the only thing deciding the winner.
 */
type AdminRule = { selectors: string[]; body: string; media: string | null; index: number }
const adminRules: AdminRule[] = []
adminRoot.walkRules((r) => {
  const parent = r.parent as { type?: string; params?: string } | undefined
  adminRules.push({
    selectors: r.selectors.map((x) => x.replace(/\s+/g, ' ').trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
    media: parent?.type === 'atrule' ? (parent.params ?? null) : null,
    index: adminRules.length,
  })
})

/** Rules inside a ≤640px media query — the phone layer. */
const mobileRules = adminRules.filter((r) => r.media && /max-width:\s*640px/.test(r.media))

const root = postcss.parse(css)

/**
 * Every rule INCLUDING at-rule children — the shape "can any rule reach this?" questions want.
 * `media` carries the enclosing at-rule params (as `adminRules` above already does), so a guard can
 * assert WHICH breakpoint a rule lives under instead of inferring it from source order.
 */
const allRules: { selectors: string[]; body: string; media: string | null }[] = []
root.walkRules((r) => {
  const parent = r.parent as { type?: string; params?: string } | undefined
  allRules.push({
    selectors: r.selectors.map((s) => s.trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
    media: parent?.type === 'atrule' ? (parent.params ?? null) : null,
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
  it('centers the guide partnership credit and gives both donation links equal treatment', () => {
    expect(bodyOf('.guide-footer')).toMatch(/text-align:\s*center/)
    expect(bodyOf('.guide-footer__credit')).toMatch(/flex-direction:\s*column/)
    expect(bodyOf('.guide-footer__actions')).toMatch(/justify-content:\s*center/)
    expect(bodyOf('.guide-footer__donate')).toMatch(/min-width:\s*13rem/)
  })

  it('gives the version editor the shared centered page shell', () => {
    const selector = '.collection-edit--lesson-bundle-versions'
    const rule = adminRules.find((r) => r.media === null && r.selectors.includes(selector))
    expect(rule, `${selector} needs a desktop shell rule`).toBeTruthy()
    expect(rule!.body).toMatch(/max-width:\s*var\(--app-content-width\)/)
    expect(rule!.body).toMatch(/margin-inline:\s*auto/)
    expect(rule!.body).toMatch(/--gutter-h:\s*var\(--app-content-pad\)/)

    const fields = adminRules.find(
      (r) => r.media === null && r.selectors.includes(`${selector} .document-fields`),
    )
    expect(fields, 'the editor field gutters must match the shared page gutter').toBeTruthy()
    expect(fields!.body).toMatch(/--main-gutter-h-left:\s*var\(--app-content-pad\)/)
    expect(fields!.body).toMatch(/--main-gutter-h-right:\s*var\(--app-content-pad\)/)

    const mobileShell = mobileRules.find((r) => r.selectors.includes(selector))
    expect(mobileShell, 'the editor needs the shared small-screen gutter').toBeTruthy()
    expect(mobileShell!.body).toMatch(/--gutter-h:\s*var\(--app-content-pad-sm\)/)

    const mobileFields = mobileRules.find((r) =>
      r.selectors.includes(`${selector} .document-fields`),
    )
    expect(mobileFields, 'the editor fields need the shared small-screen gutter').toBeTruthy()
    expect(mobileFields!.body).toMatch(/--main-gutter-h-left:\s*var\(--app-content-pad-sm\)/)
    expect(mobileFields!.body).toMatch(/--main-gutter-h-right:\s*var\(--app-content-pad-sm\)/)
  })

  it('gives every shared-header page title one owner', () => {
    // `.page-heading h1`, not `.lesson-heading h1` — the latter reached only two pages, which is
    // exactly why the Guide had to declare its own.
    //
    // Scoped claim on purpose: the catalogue (`.lp-title`) and Messages (`.msg-title`) still
    // declare the same size/weight independently, because neither uses the shared header yet.
    // Converting them is a later PR; until then "a page title is 30px/700 by virtue of BEING one"
    // is true of `.page-heading` callers, not of the whole app.
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

  // ---- Per-area compare (2026-08-23) --------------------------------------------------------
  it('scopes the "Changes only" filter so it can never hide content outside the compare body', () => {
    // `[data-changed]` is a plain attribute, and `display: none` on it unscoped would be a page-wide
    // content eraser the moment any other view adopted the attribute. Every hiding rule must carry
    // the `.compare-body--changes-only` ancestor.
    const hiders = allRules.filter(
      (r) => r.selectors.some((s) => s.includes('[data-changed')) && /display:\s*none/.test(r.body),
    )
    expect(hiders.length, 'expected the changes-only hiding rule').toBeGreaterThan(0)
    for (const r of hiders) {
      for (const s of r.selectors) {
        expect(
          s,
          'a [data-changed] display:none rule must be scoped to the compare body',
        ).toContain('.compare-body--changes-only')
      }
    }
  })

  it('gives the jumped-to area a VISIBLE indicator, for mouse and keyboard alike', () => {
    // The regression: this rule once said `outline: none`, which removed the only signal that an
    // index link (or Phase 2's Next/Previous) had moved you — landing on one of 28 rows unmarked.
    // `:target` covers the index links including for mouse users; `:focus-visible` covers keyboard
    // and programmatic focus on the `tabindex="-1"` row.
    const indicators = allRules.filter((r) =>
      r.selectors.some((s) => /^\.compare-group:(target|focus-visible)$/.test(s)),
    )
    const covered = indicators.flatMap((r) => r.selectors)
    expect(covered, 'expected a :target indicator on an area row').toContain(
      '.compare-group:target',
    )
    expect(covered, 'expected a :focus-visible indicator on an area row').toContain(
      '.compare-group:focus-visible',
    )
    for (const r of indicators) {
      expect(r.body, 'the indicator must actually draw something').toMatch(/outline:\s*\d/)
    }
    // And nothing may suppress it again.
    const suppressors = allRules.filter(
      (r) =>
        r.selectors.some((s) => s.startsWith('.compare-group')) && /outline:\s*none/.test(r.body),
    )
    expect(
      suppressors.flatMap((r) => r.selectors),
      'no .compare-group rule may set outline: none — that was the defect',
    ).toEqual([])
  })

  it('styles the "not present in this version" pane so a one-sided area is not a blank half-row', () => {
    // A whole lesson added or removed leaves one pane empty. The label needs to read as a statement.
    expect(allSelectors).toContain('.compare-pane__absent')
  })

  it('gives an area row scroll clearance, so an index link does not land under the header', () => {
    // The change index links to `#cmp-…` anchors. Without `scroll-margin-top` the browser puts the
    // target flush against the viewport top, behind the sticky chrome — the same reason
    // `.doc-section` already carries one.
    expect(bodyOf('.compare-group')).toMatch(/scroll-margin-top:/)
  })

  it('stacks each area PAIR at ≤640px, rather than one whole version above the other', () => {
    // The ordering guarantee of the per-area layout on a phone: because both panes live inside one
    // `.compare-group`, collapsing the grid puts a change directly above its counterpart. The old
    // two-pane page put the entire "from" document above the entire "to" document.
    const grids = allRules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.selectors.includes('.compare-grid'))
    const wide = grids.find(({ r }) => /grid-template-columns:\s*1fr 1fr/.test(r.body))
    const narrow = grids.find(({ r }) => /grid-template-columns:\s*1fr(?!\s+1fr)/.test(r.body))
    expect(wide, 'base two-column .compare-grid rule missing').toBeDefined()
    expect(narrow, 'expected a single-column .compare-grid rule for narrow screens').toBeDefined()
    // The BREAKPOINT, not just the ordering: identifying the stacking rule by "a `1fr` body later in
    // the file" would also be satisfied by a single-column rule added at base width, which would
    // stack the panes on DESKTOP — the opposite of this test's name.
    expect(wide!.r.media, 'the two-column rule is the base, so it is in no media query').toBeNull()
    expect(narrow!.r.media ?? '', 'the stacking rule must live under the ≤640px query').toMatch(
      /max-width:\s*640px/,
    )
    expect(
      narrow!.i,
      'the stacking rule must come after the two-column rule — equal specificity, order decides',
    ).toBeGreaterThan(wide!.i)
  })

  it('pins the TOC link count that --guide-toc-rows was measured against', () => {
    // `--guide-toc-rows` is the one hand-measured input in the clearance formula — CSS cannot count
    // flex lines. It is 2 at ≤640px because FIVE links wrap to two rows at 390px. Add a sixth, or
    // lengthen "Subject-grade administrators", and the bar wraps to three while the formula still
    // says two: the anchor under-clears and the heading lands behind the sticky bar. Nothing else
    // would fail. This converts "re-measure" from a note-to-a-human into a failing test.
    const guide = readFileSync(resolve(here, '../../src/app/(frontend)/guide/page.tsx'), 'utf8')
    const toc = /<nav className="guide-toc"[\s\S]*?<\/nav>/.exec(guide)
    expect(toc, 'the guide TOC nav is missing').not.toBeNull()
    const links = toc![0].match(/<a href="#/g) ?? []
    expect(
      links.length,
      'TOC link count changed — re-measure --guide-toc-rows at 390px and update the ≤640px override',
    ).toBe(5)
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
 * Manage's controls opt in with `.lp-btn`. That replaced a list of container scopes which had grown
 * to one entry per control across THREE rules — and the list-tracking discipline demonstrably did
 * not hold: two operator reports found controls outside it, and the fix for the second left the
 * `a.btn` paint rule un-extended. The class makes a missed control visible in the diff of the
 * component being written instead of in a stylesheet nobody opens.
 *
 * What still has to hold, and is asserted below: every rule that styles Manage's buttons reaches
 * them through the SAME selector, so geometry and the ≤640px touch target cannot drift apart —
 * the drift that shipped a 26px `.btn--compact` on phones in #179.
 */
describe('admin button-system scope coverage', () => {
  /**
   * The selector list of the SHARED rule declaring `var(<token>)` — the one whose list both callers
   * are about.
   *
   * Media queries are NOT excluded: the touch token exists only inside the ≤640px block, so the two
   * callers below deliberately resolve to a base rule and a media rule respectively.
   *
   * ⚑ THIS USED TO TAKE THE FIRST RULE IN SOURCE ORDER, and that made the guard fail OPEN. Three
   * rules declare the touch token (the shared list plus compact's height and width), so "first" was
   * positional luck — and when Manage's accordion trigger was added in its own block earlier in the
   * file, that block silently became the one inspected, and the set-equality assertion below started
   * comparing a one-selector rule against the geometry list. Worse, the stylesheet was then edited to
   * suit the helper: a comment in `custom.scss` briefly justified where a rule lived by what this test
   * reads. A test that dictates where CSS may be written is at the wrong altitude.
   *
   * Anchoring on `.btn.lp-btn` — the opt-in class the whole button system is built on — names the
   * shared rule by INTENT and is immune to source order. It matches exactly one rule per token:
   * compact's selector is `.btn.lp-btn.lp-btn--compact`, a different string, so it cannot collide.
   */
  const SHARED_ANCHOR = '.btn.lp-btn'
  const scopeListFor = (token: string): string[] => {
    const hits = adminRules.filter(
      (r) => r.body.includes(`var(${token})`) && r.selectors.includes(SHARED_ANCHOR),
    )
    if (hits.length === 0) throw new Error(`no shared rule declares var(${token})`)
    if (hits.length > 1) {
      throw new Error(
        `${hits.length} rules declare var(${token}) alongside ${SHARED_ANCHOR} — the shared list has ` +
          `been split, which is exactly the drift this guard exists to catch`,
      )
    }
    return hits[0]!.selectors
  }

  const EDITOR_SCOPE = '.collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn'

  it('styles Manage buttons through the opt-in class, not per-control scopes', () => {
    // The altitude fix. If someone re-adds a `.lp-manage__<thing> .btn` entry, the list is growing
    // again and this catches it — that regrowth is what put four controls outside the system.
    const geometry = scopeListFor('--app-btn-min-height')
    expect(geometry).toContain('.btn.lp-btn')
    expect(
      geometry.filter((s) => s.startsWith('.lp-manage__') || s.startsWith('.lp-admin-list__')),
      'Manage controls opt in with .lp-btn — do not add container scopes back',
    ).toEqual([])
  })

  it('gives the touch block exactly the geometry block’s selectors, plus the form controls', () => {
    // Set equality, not "contains" — a selector added to one block and forgotten in the other is
    // the whole failure mode, and a per-item `toContain` loop cannot see an extra entry.
    const geometry = scopeListFor('--app-btn-min-height')
    const touch = scopeListFor('--app-btn-touch-min-height')
    // The extras are the controls that take the phone touch target WITHOUT being button-system
    // controls: three form controls, and (2026-08-17) Manage's accordion disclosure heading, which is
    // the primary control on that page at 375px but must not look like an action.
    //
    // ⚑ `.lp-users__input` was added here when the Users panel's inputs JOINED the shared form-control
    // rule. They shipped with a private copy of both the geometry and the touch declaration, which
    // this guard could not see — it watches the shared lists, so a control that opts out of them is
    // invisible to it. That is not a hole to plug here: the answer is that controls join the list.
    expect(new Set(touch)).toEqual(
      new Set([
        ...geometry,
        '.lp-manage__select',
        '.lp-admin-list__search',
        '.lp-users__input',
        '.lp-accordion__trigger',
      ]),
    )
    expect(geometry, 'the version editor keeps a container scope — see the rule comment').toContain(
      EDITOR_SCOPE,
    )
  })

  it('lifts the admin compact size to the touch target, outranking its own base rule', () => {
    // #179 EXACTLY, on the surface that had not implemented compact yet. `.btn.lp-btn--compact`
    // sets 26px at (0-3-0); the shared touch rule is (0-2-0) and a MEDIA QUERY ADDS NO SPECIFICITY,
    // so without a restatement at ≥(0-3-0) the compact Remove stays 26px on a phone while the
    // stylesheet claims 44px. Measured after the fix: 26px at 1280, 44px at 390.
    const compact = mobileRules.find((r) => r.selectors.includes('.btn.lp-btn.lp-btn--compact'))
    expect(
      compact,
      '.btn.lp-btn.lp-btn--compact must restate the touch target inside the ≤640px block',
    ).toBeDefined()
    expect(compact!.body).toMatch(/min-height:\s*var\(--app-btn-touch-min-height\)/)
    // BOTH dimensions — 2.5.5 asks for 44 square, and `min-height` alone leaves the width riding on
    // the label (#180). The frontend's compact override sets both; this one omitted min-width while
    // its comment claimed parity with it.
    expect(
      compact!.body,
      'the admin compact override must set min-width too, like the frontend it claims parity with',
    ).toMatch(/min-width:\s*var\(--app-btn-touch-min-height\)/)
  })

  it('keeps a one-line Manage row horizontal at ≤640px', () => {
    // `.lp-manage__row` stacks to a column at ≤640, which is right for the candidate row (title +
    // metadata + two named actions). Applied to the editors list it put a FULL-WIDTH Remove under
    // every name — 98px per editor, and a destructive control with more visual weight than anything
    // else on the page. `--tight` opts back out.
    //
    // ⚑ Found by SCREENSHOT, not by measurement: every control still met its 44px target, so the
    // geometry table passed while the layout was wrong. That is the standing argument for requiring
    // both forms of evidence (DESIGN-visual-system §6.1).
    // Asserted on the COMPILED cascade, not on `&__row--tight` authoring syntax: a source-text regex
    // cannot see which rule actually wins, so it would stay green through a re-ordering that ships a
    // broken phone layout.
    //
    // The invariant is SPECIFICITY, not source order. The override uses the doubled selector
    // `.lp-manage__row.lp-manage__row--tight` (0-2-0) so it beats the column rule (0-1-0) wherever
    // either sits in the file. Written single-class it won only by being later — an order coupling
    // nothing recorded. Asserting the doubled form is what stops that regressing.
    const base = mobileRules.filter((r) => r.selectors.includes('.lp-manage__row'))
    const tight = mobileRules.filter((r) =>
      r.selectors.includes('.lp-manage__row.lp-manage__row--tight'),
    )
    expect(base, 'the ≤640px column rule for .lp-manage__row is missing').not.toHaveLength(0)
    expect(
      tight,
      'the ≤640px tight override must use the DOUBLED selector, so it wins on specificity rather than on source order',
    ).not.toHaveLength(0)
    expect(tight.map((r) => r.body).join(';')).toMatch(/flex-direction:\s*row/)
  })

  it('gives Manage form controls the button geometry, without button paint', () => {
    // A 31px select beside a 38px button was the mismatch left after the buttons were fixed. They
    // take SIZE from the button tokens and keep their native appearance, so assert the declarations
    // rather than the shape of the selector list (which says nothing about what the rule does).
    const formRule = adminRules.find(
      (r) =>
        !r.media &&
        r.selectors.includes('.lp-manage__select') &&
        r.selectors.includes('.lp-admin-list__search'),
    )
    expect(formRule, 'the Manage form-control rule is missing').toBeDefined()
    const body = formRule!.body
    expect(body).toMatch(/min-height:\s*var\(--app-btn-min-height\)/)
    expect(body).toMatch(/border-radius:\s*var\(--app-btn-radius\)/)
    expect(body).toMatch(/font-size:\s*var\(--app-btn-font-size\)/)
    expect(body, 'a select must keep its native chevron').not.toMatch(/appearance:/)
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
      <PageHeader title="ARES Lesson Plans" kicker={<p className="guide-kicker">User guide</p>}>
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
})
