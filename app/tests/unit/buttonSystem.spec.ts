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
 *  3. Source ORDER decides several equal-specificity contests, all inside the system:
 *     `.btn:disabled` over `.btn.btn--primary` (0-2-0), so a disabled Save is not still filled;
 *     `.btn.is-active` over `.btn.btn--quiet` (0-2-0), so a selected filter actually looks selected;
 *     and the same pair again at `:hover` (0-3-0), so a hovered selected chip keeps white text
 *     instead of `--quiet`'s blue-on-blue.
 *
 *     ⚑ `.btn` vs the `.fav-toggle` glyph base USED to be on this list and is deliberately not any
 *     more. Order was the wrong instrument: it pinned only the copies the assertion could see, and
 *     a second glyph rule inside `@media (max-width: 640px)` won unseen, shipping "Favorited" at
 *     1.35rem. The glyph rules are now SCOPED (`:not(.btn)`) so they cannot match the labelled
 *     control at all, and the test asserts reachability instead. Where scoping is possible, prefer
 *     it — an order assertion is only as good as its view of the file.
 *
 * Mostly asserted against the stylesheet SOURCE rather than a DOM: jsdom's CSS engine cannot expand
 * shorthands whose value is a `var()`, so a computed-style probe would be measuring jsdom's limits
 * instead of ours. Specificity and order are exactly what is fragile here, and they are decidable
 * from the source. Geometry and colour remain a post-deploy Rock check (§5) — no local server.
 *
 * The exceptions are the REACHABILITY tests (`expectUnreachable`), which use jsdom purely for
 * `Element.matches()` — no computed styles, so the limitation above does not apply. They answer a
 * question source order cannot: "can any rule, at any nesting depth, reach this control?" Getting
 * that from the real selector engine beats re-implementing specificity by hand. Order tests and
 * reachability tests are not redundant — order says who WINS when two rules both match, matching
 * says whether the contest exists at all.
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
const root = postcss.parse(css)

const rules = root.nodes
  .filter((n): n is import('postcss').Rule => n.type === 'rule')
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
root.walkRules((r) => {
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

/** Build a detached element from markup, so a rule's selector can be tested against a real shape. */
const shape = (html: string): Element => {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild as Element
}

/** The lesson-page favorite: carries BOTH the glyph classes and `.btn`, which is what makes it the
 *  control every collision in this system lands on. One definition, so a markup change moves once. */
const labelledFavorite = (attrs = ''): Element =>
  shape(`<button class="fav-toggle is-favorite btn fav-toggle--labeled"${attrs}></button>`)

/** Assert that nothing in `candidates` can style `el` — the reachability question, not the order one. */
const expectUnreachable = (
  el: Element,
  candidates: { selectors: string[] }[],
  why: (sel: string) => string,
  strip = /$^/,
) => {
  for (const rule of candidates) {
    for (const sel of rule.selectors) {
      expect(el.matches(sel.replace(strip, '')), why(sel)).toBe(false)
    }
  }
}

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

  it('lets no glyph rule reach the labelled favorite, at any width', () => {
    // This replaced a source-ORDER assertion, which was too weak and shipped a real defect. The
    // glyph rules and the button system collide at the SAME specificity (0-1-0), so order decided
    // the winner — and inside `@media (max-width: 640px)` the glyph rule sits AFTER `.btn` and won,
    // rendering "Favorited" at 1.35rem beside 15px siblings. The order test could not see it: it
    // read top-level rules only, and the losing copy was inside the at-rule.
    //
    // Scoping with `:not(.btn)` is the fix, and this is the assertion that matches it — the glyph
    // rules must be UNABLE to match the labelled control, whatever their position or nesting.
    // Only the glyph rules are in question; `.btn*` and the `--labeled` star rules SHOULD match.
    const glyphRules = allRules.filter((r) =>
      r.selectors.some((s) => s.includes('.fav-toggle') && !s.includes('--labeled')),
    )
    expectUnreachable(
      labelledFavorite(),
      glyphRules.map((r) => ({
        selectors: r.selectors.filter((s) => s.includes('.fav-toggle') && !s.includes('--labeled')),
      })),
      (sel) => `"${sel}" reaches the labelled favorite — scope it with :not(.btn)`,
      /:(hover|focus-visible|disabled)\b/g,
    )
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
      expectUnreachable(
        shape(html),
        dimmers,
        (sel) => `${name} is dimmed by "${sel}" — scope it away from .btn`,
      )
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
    // Anchored on the selector WITHOUT a trailing `{`: the block's selector list grew a second
    // entry on 2026-07-31 (`.lp-manage__row-actions .btn`, bringing Manage's row actions into the
    // system), and an anchor that assumed a one-selector list silently matched nothing and passed an
    // empty string to the assertions below. The first occurrence in the file is this block; the only
    // other is the ≤640px touch-target rule further down.
    const anchor = '.collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn'
    const at = adminCss.indexOf(anchor)
    expect(at, 'the scoped admin button block must exist').toBeGreaterThan(-1)
    const scoped = adminCss.slice(at)
    const primary = scoped.slice(
      scoped.indexOf('&.btn--style-primary'),
      scoped.indexOf('&.btn--style-error'),
    )
    expect(primary, 'the scoped primary must set its own --bg-color').toContain('--bg-color:')
    expect(primary, 'the scoped primary must set its own --color').toContain('--color:')
  })

  it('orders the selected fill after --quiet, and keeps it off Favorite', () => {
    // A selected filter chip is `.btn.btn--quiet.is-active`; both modifiers are 0-2-0, so ONLY
    // source order makes the fill win over quiet's neutral border. Reversed, the active subject
    // filter would render identically to the inactive ones — D4's "blue means selected" lost.
    expect(posOf('.btn.is-active')).toBeGreaterThan(posOf('.btn.btn--quiet'))
    // ...and disabled still outranks it, so a disabled selected control is not left filled.
    expect(posOf('.btn:disabled')).toBeGreaterThan(posOf('.btn.is-active'))

    // The selected fill must NOT key off `[aria-pressed]`: the labelled Favorite sets that too, and
    // filling it is exactly the decision §2a rejected. Assert no rule reaches it that way.
    const fillers = allRules.filter(
      (r) => /background:\s*var\(--accent\)/.test(r.body) && !r.selectors.some((x) => x.includes(':hover')),
    )
    expectUnreachable(
      labelledFavorite(' aria-pressed="true"'),
      fillers,
      (sel) => `Favorite must not be filled by "${sel}"`,
    )
  })

  it('centres the mobile nav row rather than top-aligning it', () => {
    // `.app-header` becomes a column at <=640px, so flex-start means left — correct. `.app-nav` stays
    // a ROW containing ~22px text links and a 44px avatar; flex-start top-aligns them and the avatar
    // reads as dropped. Regression guard: the two must not share the flex-start rule again.
    const flexStart = allRules.filter((r) => /align-items:\s*flex-start/.test(r.body))
    for (const rule of flexStart) {
      expect(rule.selectors, 'the mobile nav row must not be top-aligned').not.toContain('.app-nav')
    }
  })

  it('keeps an unavailable control unavailable-looking while focused, in every variant', () => {
    // The hole CodeRabbit found on #170, which actually arrived with the button system itself: each
    // variant's focus rule (`.btn.btn--primary:focus-visible` and friends) is 0-3-0 and outranks the
    // base disabled rule at 0-2-0, so a FOCUSED unavailable control repainted itself as available.
    // Reached via `[aria-disabled='true']` — a native `<button disabled>` is not focusable, but an
    // aria-disabled one is, which is why that attribute is in the system's selector list at all.
    const suppressors = allRules.filter(
      (r) =>
        /background:\s*var\(--app-btn-bg\)/.test(r.body) &&
        r.selectors.some((x) => /:disabled|aria-disabled|aria-busy/.test(x)),
    )
    for (const state of [':hover', ':focus-visible']) {
      for (const flag of [':disabled', "[aria-disabled='true']", "[aria-busy='true']"]) {
        const needed = `.btn${flag}${state}`
        expect(
          suppressors.some((r) => r.selectors.includes(needed)),
          `${needed} must be suppressed, or a variant's ${state} rule (0-3-0) will repaint it`,
        ).toBe(true)
      }
    }
  })

  it('keeps white text on a HOVERED selected chip', () => {
    // Two independent reviewers called `color` on `.btn.is-active:hover` a redundant leftover. It is
    // load-bearing. A selected filter is `.btn.btn--quiet.is-active`, and on hover TWO rules tie at
    // 0-3-0: `.btn.btn--quiet:hover` (blue text, D4's quiet promotion) and `.btn.is-active:hover`.
    // Source order gives it to `is-active` — remove that one declaration and the selected chip
    // renders blue text on its blue fill, i.e. invisible. Pinned because "clean this up" will
    // otherwise be suggested again.
    const activeHover = bodyOf('.btn.is-active:hover')
    expect(activeHover, 'is-active:hover must restate color to beat --quiet:hover').toMatch(
      /color:\s*var\(--accent-ink\)/,
    )
    expect(posOf('.btn.is-active:hover')).toBeGreaterThan(posOf('.btn.btn--quiet:hover'))
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
