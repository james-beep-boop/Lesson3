// @vitest-environment jsdom
/**
 * Button system invariants (docs/DESIGN-button-system-2026-07-30.md).
 *
 * The system collapsed five independently-authored frontend controls (`.compare-link`,
 * `.versions-chip`, `.fav-toggle--labeled`, `.page-back`, `.btn-doc`) onto one `.btn` rule plus
 * emphasis/size modifiers. It holds only because of three CASCADE facts that are invisible in
 * review, survive type-checking, and would each regress as a silent visual defect:
 *
 *  1. `.btn` must DECLARE `background`. The original bug was that it didn't, so `<button class="btn">`
 *     inherited the UA `buttonface` gray while `<a class="btn">` stayed transparent — one class,
 *     two renderings, which is what made the action bar look unfinished.
 *  2. The modifiers must stay DOUBLED (`.btn.btn--quiet`, specificity 0-2-0). The Share menu
 *     deliberately flattens `.btn` via `.share-menu button` (0-1-1); the download pills keep their
 *     look only by outranking it — exactly the contest the former `.btn.btn-doc` won. Demoting a
 *     modifier to a single class (0-1-0) loses it silently.
 *  3. Source ORDER decides two equal-specificity contests: `.btn` over the `.fav-toggle` glyph
 *     base (both 0-1-0), and `.btn:disabled` over `.btn.btn--primary` (both 0-2-0) so a disabled
 *     Save is not still filled.
 *
 * Mostly asserted against the stylesheet SOURCE rather than a DOM: jsdom's CSS engine cannot expand
 * shorthands whose value is a `var()`, so a computed-style probe would be measuring jsdom's limits
 * instead of ours. Specificity and order are exactly what is fragile here, and they are decidable
 * from the source. Geometry and colour remain a post-deploy Rock check (§5) — no local server.
 *
 * The one exception is the opacity check, which uses jsdom purely for `Element.matches()` — no
 * computed styles, so none of the above limitation applies. Selector MATCHING is exactly the
 * question there ("can any dimming rule reach this control?"), and getting it from the real engine
 * beats re-implementing specificity by hand.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8')
const tokens = readFileSync(resolve(here, '../../src/app/app-tokens.scss'), 'utf8')
const adminCss = readFileSync(resolve(here, '../../src/app/(payload)/custom.scss'), 'utf8')

/**
 * Top-level rules in source order, as `{ selectors, body, at }`.
 *
 * Parsed with `postcss` (already a direct dependency) rather than a brace-matching regex: the
 * stylesheet nests rules inside `@media`, and a regex that cannot see nesting silently flattens
 * those into the same list — so `.btn` would appear twice (once real, once from the ≤640px block)
 * and every lookup would depend on an unwritten "the real one happens to come first" invariant.
 * Excluding at-rule children makes that explicit instead of accidental.
 */
const rules = postcss
  .parse(css)
  .nodes.filter((n): n is import('postcss').Rule => n.type === 'rule')
  .map((r, i) => ({
    selectors: r.selectors.map((s) => s.trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
    at: i,
  }))

/**
 * EVERY rule, including those nested inside at-rules. `rules` above is top-level only, which is
 * right for source-ORDER assertions (an `@media` rule's position says nothing about the cascade
 * against an unconditional one) — but wrong for "can any rule reach this control?", where a
 * `@media` block counts just as much.
 */
const allRules: { selectors: string[]; body: string }[] = []
postcss.parse(css).walkRules((r) => {
  allRules.push({
    selectors: r.selectors.map((x) => x.trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
  })
})

/** Every top-level rule whose selector list contains `sel` exactly. */
const rulesFor = (sel: string) => rules.filter((r) => r.selectors.includes(sel))

/** The first such rule — the one the cascade reaches first. Throws if the selector is gone. */
const ruleFor = (sel: string) => {
  const hit = rulesFor(sel)[0]
  if (!hit) throw new Error(`no top-level rule for selector "${sel}"`)
  return hit
}

const posOf = (sel: string): number => ruleFor(sel).at
const bodyOf = (sel: string): string => ruleFor(sel).body

describe('button system', () => {
  it('declares a background on .btn, so <a> and <button> cannot diverge', () => {
    // The defect this system exists to fix. Without an explicit background the UA supplies one for
    // <button> and not for <a>.
    expect(bodyOf('.btn')).toMatch(/(^|[\s;])background:/)
  })

  it('keeps every emphasis/size modifier doubled, to outrank the Share-menu flattening', () => {
    // `.share-menu button` is 0-1-1. A single-class modifier (0-1-0) loses; `.btn.btn--x` (0-2-0) wins.
    for (const mod of ['primary', 'danger', 'quiet', 'compact']) {
      const single = rules.filter((r) =>
        r.selectors.some((s) => s.startsWith(`.btn--${mod}`)),
      )
      expect(single, `.btn--${mod} must be written as .btn.btn--${mod}`).toEqual([])
      expect(() => posOf(`.btn.btn--${mod}`)).not.toThrow()
    }
  })

  it('orders .btn after the .fav-toggle glyph base', () => {
    // Both 0-1-0 and both match the lesson page's labelled favorite. If `.fav-toggle` moved below
    // the button block, that control would revert to a borderless muted glyph.
    expect(posOf('.btn')).toBeGreaterThan(posOf('.fav-toggle'))
  })

  it('orders disabled/busy after primary, so a disabled Save is not still filled', () => {
    // Both 0-2-0. Save renders disabled on a pristine form, which is its most common state.
    expect(posOf('.btn:disabled')).toBeGreaterThan(posOf('.btn.btn--primary'))
  })

  it('states disabled explicitly rather than with opacity', () => {
    // Dimming accent-on-gray muddies contrast instead of reading as off. This replaced
    // `.fav-toggle:disabled { opacity: .5 }` and `button[type='submit']:disabled { opacity: .6 }`.
    const body = bodyOf('.btn:disabled')
    expect(body).toMatch(/color:/)
    expect(body).not.toMatch(/opacity:/)
  })

  // Checking `.btn:disabled`'s OWN body is not enough, and this is not hypothetical: the labelled
  // favorite renders `class="fav-toggle ... btn fav-toggle--labeled"`, and the surviving unscoped
  // `.fav-toggle:disabled { opacity: .5 }` kept matching it. `.btn:disabled` declares no `opacity`,
  // so it could not override that — the control got the explicit palette AND 50% opacity, stacked.
  // The whole suite passed. So assert on what the CASCADE sees: for the real disabled shapes this
  // app renders, no rule that dims with `opacity` may match at all.
  it('lets no opacity rule reach any disabled control in the system', () => {
    const shapes: Record<string, string> = {
      'toolbar button (Edit/Save/Share)': '<button class="btn" disabled></button>',
      // The one that actually regressed.
      'lesson-page favorite':
        '<button class="fav-toggle is-favorite btn fav-toggle--labeled" disabled></button>',
      'busy Formatted PDF': '<button class="btn" aria-busy="true"></button>',
      'catalogue download pill': '<button class="btn btn--quiet btn--compact" disabled></button>',
    }
    const dimmers = allRules.filter((r) => /(^|[\s;])opacity:/.test(r.body))

    for (const [name, html] of Object.entries(shapes)) {
      const el = document.createElement('div')
      el.innerHTML = html
      const node = el.firstElementChild as Element
      for (const rule of dimmers) {
        for (const selector of rule.selectors) {
          expect(
            node.matches(selector),
            `${name} is dimmed by "${selector}" — scope it away from .btn`,
          ).toBe(false)
        }
      }
    }
  })

  it('separates keyboard focus from hover', () => {
    // Every control in this file used to pair `:hover, :focus-visible` in ONE rule, so a tabbing
    // user got the hover fill and no other signal. `.btn:focus-visible` still shares that rule (it
    // should fill like hover) — what must also exist is a SEPARATE rule adding the ring on top, so
    // check every rule carrying the selector, not just the first.
    const focusRules = rulesFor('.btn:focus-visible')
    expect(focusRules.length).toBeGreaterThan(1)
    expect(focusRules.some((r) => /outline:/.test(r.body))).toBe(true)
  })

  it('gives the 600 weight to primary only', () => {
    expect(bodyOf('.btn')).toContain('var(--app-btn-font-weight)')
    expect(bodyOf('.btn.btn--primary')).toContain('var(--app-btn-font-weight-primary)')
  })

  it('has no orphaned references to the replaced controls', () => {
    // Rules, not prose: the historical names survive deliberately in explanatory comments.
    const selectors = allRules.flatMap((r) => r.selectors)
    // `.btn-doc` subsumes `.btn.btn-doc` as a substring — one entry covers both forms.
    for (const gone of ['.compare-link', '.page-back', '.btn-doc', '.versions-chip']) {
      expect(selectors.filter((s) => s.includes(gone)), `${gone} should be gone`).toEqual([])
    }
  })

  it('restates the filled palette on the admin primary, which its scope outranks', () => {
    // The site-wide `.btn--style-primary` (0-1-0) does NOT reach a primary inside the editor bar:
    // the scoped `.collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn` rule is
    // (0-3-0) and sets `--color`/`--bg-color` for the STANDARD variant, so it wins and Save renders
    // as a gray outlined button. The nested modifier must restate the fill. Deleted once as
    // "duplication" during a cleanup pass — textually true, cascade-false. Guarded here because it
    // is invisible to tsc, to eslint, and to a reader who greps for the declaration and finds one.
    const scoped = adminCss.slice(
      adminCss.indexOf('.collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn {'),
    )
    const primary = scoped.slice(
      scoped.indexOf('&.btn--style-primary'),
      scoped.indexOf('&.btn--style-error'),
    )
    expect(primary, 'the scoped primary must set its own --bg-color').toContain('--bg-color:')
    expect(primary, 'the scoped primary must set its own --color').toContain('--color:')
  })

  it('resolves every --app-btn-* reference against a real token', () => {
    // A renamed or deleted token leaves a dangling `var()` that renders as nothing — invisible
    // locally, obvious in production.
    const referenced = new Set(
      [...css.matchAll(/var\((--app-btn-[a-z-]+)\)/g)].map((m) => m[1]),
    )
    expect(referenced.size).toBeGreaterThan(5)
    for (const name of referenced) {
      expect(tokens, `${name} is referenced but not defined`).toContain(`${name}:`)
    }
  })
})
