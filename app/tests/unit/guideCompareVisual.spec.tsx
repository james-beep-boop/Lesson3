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
import { toWidgetUser } from '@/lib/widgetUser'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8')
const adminCss = readFileSync(resolve(here, '../../src/app/(payload)/custom.scss'), 'utf8')
/**
 * `custom.scss` with its `//` comments removed, for structural scanning.
 *
 * Stripping first is what makes a one-regex selector scan safe: this file's comments are long prose
 * that contains `;`, `,` and `{` — a scan over the raw text picks those up as selectors and
 * declaration boundaries. (Both bugs were hit while writing this file: a match landed inside a
 * comment, then a comment's semicolon truncated a selector list mid-sentence.)
 *
 * Safe here because the file contains no `://` — verified, and if a URL is ever added this strip
 * would corrupt it, so the assertion below fails loudly rather than silently scanning garbage.
 */
const adminCssBare = adminCss.replace(/\/\/[^\n]*/g, '')
if (adminCss.includes('://')) {
  throw new Error('custom.scss now contains a URL — the // comment strip in this spec is unsafe')
}

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
   * The selector list of the rule that declares `var(<token>)`.
   *
   * Scanned as TEXT, not parsed: `custom.scss` is Sass — `//` comments and nesting — and postcss
   * throws on it outright (`buttonSystem.spec.ts` reads this same file with string scanning for the
   * same reason). Over the comment-stripped source, `[^{};]*` cannot cross a `}`, a `;`, or an
   * `@media … {` opener, so one capture isolates the selector list.
   */
  const scopeListFor = (token: string): string[] => {
    const m = new RegExp(`([^{};]*)\\{[^{}]*var\\(${token}\\)`).exec(adminCssBare)
    if (!m) throw new Error(`no rule declares var(${token})`)
    return m[1]
      .split(',')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
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
    expect(new Set(touch)).toEqual(
      new Set([...geometry, '.lp-manage__select', '.lp-admin-list__search']),
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
    const compactTouch = adminCssBare
      .split('@media')
      .slice(1)
      .some(
        (block) =>
          /max-width:\s*640px/.test(block) &&
          /\.btn\.lp-btn\.lp-btn--compact[^{]*\{[^}]*var\(--app-btn-touch-min-height\)/.test(block),
      )
    expect(
      compactTouch,
      '.btn.lp-btn.lp-btn--compact must restate the touch target inside the ≤640px block',
    ).toBe(true)
  })

  it('gives Manage form controls the button geometry, without button paint', () => {
    // A 31px select beside a 38px button was the mismatch left after the buttons were fixed. They
    // take SIZE from the button tokens and keep their native appearance, so assert the declarations
    // rather than the shape of the selector list (which says nothing about what the rule does).
    const formRule = /\.lp-manage__select,\s*\.lp-admin-list__search\s*\{([^}]*)\}/.exec(
      adminCssBare,
    )
    expect(formRule, 'the Manage form-control rule is missing').not.toBeNull()
    const body = formRule![1]
    expect(body).toMatch(/min-height:\s*var\(--app-btn-min-height\)/)
    expect(body).toMatch(/border-radius:\s*var\(--app-btn-radius\)/)
    expect(body).toMatch(/font-size:\s*var\(--app-btn-font-size\)/)
    expect(body, 'a select must keep its native chevron').not.toMatch(/appearance:/)
  })
})

/**
 * The Editing-access list shows each person's email so two identical display names can be told
 * apart before granting editing access. `emailReadAccess` is Site-Admin-or-self (SPEC §8; CLAUDE.md
 * "Non–Site-Admins never see others' emails") and this widget ALSO renders for Subject
 * Administrators — so the address must never reach them.
 *
 * The real boundary is server-side and lives in two places in `AdminDashboard/index.tsx`: the
 * `select` that fetches the column, and the projection that builds the client payload. Both are
 * gated on `siteAdmin`. This is a WIRING guard, not a substitute for the authorization tests — but
 * per CLAUDE.md a security-critical invariant gets pinned by a test rather than by review, and the
 * failure mode here (delete one `siteAdmin &&` and every Subject Admin sees the roster's addresses)
 * is silent, invisible in the UI, and would pass every existing test.
 */
describe('editing-access email is Site-Admin only', () => {
  const roster = { id: 7, name: 'Jo Teacher', email: 'jo@example.test', updatedAt: 'T' }

  it('includes the address for a Site Administrator', () => {
    expect(toWidgetUser(roster, { includeEmail: true })).toEqual({
      id: 7,
      name: 'Jo Teacher',
      email: 'jo@example.test',
      updatedAt: 'T',
    })
  })

  it('OMITS the address for a Subject Administrator — the field is absent, not empty', () => {
    // The whole point. An empty string would still cross the wire and could still be rendered;
    // the key must not be there at all.
    const projected = toWidgetUser(roster, { includeEmail: false })
    expect('email' in projected).toBe(false)
    expect(projected).toEqual({ id: 7, name: 'Jo Teacher', updatedAt: 'T' })
  })

  it('omits the key rather than emitting null when a Site Admin views a user with no address', () => {
    const projected = toWidgetUser({ ...roster, email: null }, { includeEmail: true })
    expect('email' in projected).toBe(false)
  })

  it('still falls back to a display name when one is missing', () => {
    expect(toWidgetUser({ id: 9, name: null, updatedAt: 'T' }, { includeEmail: true }).name).toBe(
      'User 9',
    )
  })

  // NOT asserted here: that the widget renders no `.lp-manage__who-email` when the field is
  // absent. Importing `EditorsWidget` pulls `@payloadcms/ui`, which imports CSS the unit config
  // cannot load — and reworking the shared vitest config to render one span is the wrong trade.
  // The markup is a single `{u.email && …}` guard over the field these tests pin, and it was
  // verified in a browser as both roles.
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
