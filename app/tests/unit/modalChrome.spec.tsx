// @vitest-environment jsdom
/**
 * The shared `Modal`: where it renders, and what its title looks like.
 *
 * ⚑ WHY THE PORTAL IS PINNED. `.modal-backdrop` is `position: fixed; inset: 0`, which means "the
 * viewport" only while no ancestor establishes a containing block. Payload's own document-controls
 * wrapper sets `transform: translateZ(0)` inside `@media (max-width: 1024px)` — an identity
 * transform, but enough — so every dialog opened from the version editor's control bar was laid out
 * inside that ~235px strip: the page behind undimmed, the panel centred in the strip rather than the
 * window, and backdrop-click-to-close working only inside it. Measured 657×235 in a 1227px-tall
 * viewport before the fix; above 1024px nothing reproduced, which is why it survived.
 *
 * Rendering into `document.body` is the structural fix, so the assertion is structural too: no
 * future `transform`, `filter`, `contain` or `will-change` anywhere in the tree can re-break it, and
 * a refactor that "simplifies" the portal away fails here.
 *
 * The second half pins the CHROME on both surfaces — the header bar is the default and
 * `modal--plain` is the opt-out — because a dialog quietly losing its bar, or the two opt-outs
 * quietly gaining one, is invisible to every other test.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import postcss from 'postcss'
import * as sass from 'sass'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import Modal from '@/components/Modal'

afterEach(cleanup)

describe('Modal renders into document.body, not where it is called', () => {
  it('escapes an ancestor that would trap position: fixed', () => {
    // The shape of the real defect: a transformed wrapper around the caller. `render` puts our tree
    // inside its own container div, so the backdrop landing on `body` proves it left BOTH.
    const { container } = render(
      <div style={{ transform: 'translateZ(0)' }}>
        <Modal title="Editing help" onClose={() => {}}>
          <p>rules</p>
        </Modal>
      </div>,
    )

    const backdrop = document.querySelector('.modal-backdrop')
    expect(backdrop, 'the dialog must render at all').not.toBeNull()
    expect(
      backdrop!.parentElement,
      'the backdrop must be a child of <body>, or a transformed ancestor traps position: fixed',
    ).toBe(document.body)
    expect(
      container.querySelector('.modal-backdrop'),
      'and it must NOT also be inside the caller’s subtree',
    ).toBeNull()
  })

  it('still wires the dialog semantics through the portal', () => {
    // The portal must not cost what the in-place version provided.
    render(
      <Modal title="Editing help" onClose={() => {}}>
        <p>rules</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // The title is the accessible name, via aria-labelledby.
    expect(screen.getByRole('dialog', { name: 'Editing help' })).toBeTruthy()
    // The caller's content sits in the padded wrapper the header bar depends on.
    expect(dialog.querySelector('.modal__content')?.textContent).toBe('rules')
  })

  it('removes itself from the body when it closes', () => {
    const { unmount } = render(
      <Modal title="Editing help" onClose={() => {}}>
        <p>rules</p>
      </Modal>,
    )
    expect(document.querySelector('.modal-backdrop')).not.toBeNull()
    unmount()
    expect(
      document.querySelector('.modal-backdrop'),
      'a portalled node is not cleaned up by container teardown — it must unmount itself',
    ).toBeNull()
  })
})

// ── The chrome, on both surfaces ─────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url))
const sheets = {
  frontend: readFileSync(resolve(here, '../../src/app/(frontend)/styles.css'), 'utf8'),
  admin: sass.compile(resolve(here, '../../src/app/(payload)/custom.scss')).css,
}

const rulesOf = (css: string) => {
  const out: { selectors: string[]; body: string }[] = []
  postcss.parse(css).walkRules((r) => {
    out.push({
      selectors: r.selectors.map((s) => s.replace(/\s+/g, ' ').trim()),
      body: r.nodes.map((d) => d.toString()).join(';'),
    })
  })
  return out
}

describe.each(Object.entries(sheets))('%s stylesheet', (_surface, css) => {
  const rules = rulesOf(css)
  /**
   * Matches a selector ENDING in the element, so the frontend's flat `.modal__title` and the admin's
   * nested `.modal .modal__title` (Sass compiles the nesting in) are both found — and the
   * `modal--plain` opt-out is excluded, since it is the thing these cases contrast against.
   */
  const forElement = (element: string) =>
    rules.filter((r) =>
      r.selectors.some(
        (sel) => new RegExp(`(^|\\s)\\${element}$`).test(sel) && !sel.includes('modal--plain'),
      ),
    )

  it('makes the header bar the DEFAULT title treatment', () => {
    // A bar is a background plus the hairline under it. Asserting both keeps this from passing on a
    // rule that merely sets a font size.
    const bar = forElement('.modal__title').filter(
      (r) => /background/.test(r.body) && /border-bottom/.test(r.body),
    )
    expect(bar.length, 'expected a .modal__title rule with a background and a bottom border').toBe(
      1,
    )
  })

  it('gives the caller’s content its own padded wrapper', () => {
    // The panel itself has no padding once the bar is full-bleed, so this is what stops the content
    // touching the edges.
    expect(forElement('.modal__content').some((r) => /padding/.test(r.body))).toBe(true)
  })

  it('lets a dialog OPT OUT of the bar', () => {
    // ⚑ The bar is deliberately not universal: `.lp-confirm` (a destructive confirmation) would read
    // as a panel rather than a warning, and the two-sentence too-narrow notice carries more chrome
    // than content. Both pass `modal--plain`.
    const plain = rules.filter((r) =>
      r.selectors.some((s) => /\.modal--plain\b.*\.modal__title/.test(s)),
    )
    expect(plain.length, 'expected a .modal--plain .modal__title rule').toBeGreaterThan(0)
    // And the opt-out must actually undo the bar, not merely restyle it.
    expect(plain.some((r) => /background:\s*none/.test(r.body))).toBe(true)
    expect(plain.some((r) => /border-bottom:\s*0/.test(r.body))).toBe(true)
  })
})

/**
 * The dialog-button mechanism, asserted at BOTH ends.
 *
 * ⚑ THE DEFECT THIS PINS. #289 portalled the panel to `document.body`, which moved dialog buttons out
 * of `.collection-edit--lesson-bundle-versions .lesson-controls-wrap` — the container scope that had
 * been styling them for free. Nothing errored and nothing failed; the buttons silently fell back to
 * Payload's treatment, and `Discard the changes` rendered transparent-on-transparent with black ink.
 * Two dialogs shipped that way in two weeks, both past review.
 *
 * The first fix added `className="lp-btn"` to each button and a regex test policing future call
 * sites. Wrong altitude twice over: it enforced the REMEDY rather than the invariant, and the scanner
 * could not see a raw `<button>`, a `<Link className="btn">`, or a button inside a helper component.
 * `Modal` now emits `lp-modal` itself, so nothing is left to remember — and the two halves of that
 * mechanism are what these cases pin, because either half alone is silent.
 *
 * ⚑ ADMIN ONLY, deliberately. `(frontend)/styles.css` styles a bare `.btn` globally, so no ancestry
 * can be escaped there and no scope is needed — which is why this is not part of the per-surface
 * `describe.each` above.
 */
describe('every dialog button is in the button system by construction', () => {
  it('has the component emit the scope class', () => {
    render(
      <Modal title="Editing help" onClose={() => {}}>
        <p>rules</p>
      </Modal>,
    )
    expect(
      document.querySelector('.modal')?.classList.contains('lp-modal'),
      'Modal must emit lp-modal itself — that is the half no call site can forget',
    ).toBe(true)
  })

  it('keeps the caller’s own class alongside it', () => {
    // `lp-restore`, `lesson-edit-help` and `lp-confirm` all style themselves through this channel,
    // so the scope class must be additive rather than a replacement.
    render(
      <Modal title="x" onClose={() => {}} className="lp-restore">
        <p>rules</p>
      </Modal>,
    )
    const cls = document.querySelector('.modal')?.className ?? ''
    expect(cls).toContain('lp-modal')
    expect(cls).toContain('lp-restore')
  })

  it('has the admin stylesheet key the button system on it', () => {
    // ⚑ Asserted against the rule that CARRIES the button system, found by the `.btn.lp-btn` opt-in
    // that identifies it — not against "some rule mentioning .lp-modal". The looser form passed while
    // the scope was missing from this rule, because the ≤640px touch-target list also names
    // `.lp-modal .btn` and satisfied it on its own. Caught by mutation.
    // The invariant: WHEREVER the `.lp-btn` opt-in is listed, the dialog scope must be listed beside
    // it — otherwise dialogs get that rule only when an author remembers the class.
    //
    // ⚑ Matched as a CLASS TOKEN, not by exact selector string, because there are four opt-in
    // families and an exact match saw only two: `.btn.lp-btn` and the ≤640px list, but not
    // `a.btn.lp-btn` (the anchor paint block) or `.btn.lp-btn.lp-btn--compact`. Deleting either of
    // those modal selectors left this test green. The negative lookahead is what keeps
    // `.lp-btn--compact` from counting as `.lp-btn`.
    //
    // (Two earlier forms were worse: `toBe(1)` failed on the second site, and "some rule mentions
    // .lp-modal" passed while the base rule had lost it. Every version has been mutation-tested.)
    const OPT_IN = /\.lp-btn(?![\w-])/
    const optIn = rulesOf(sheets.admin).filter((r) => r.selectors.some((s) => OPT_IN.test(s)))
    expect(optIn.length, 'expected to find the .lp-btn opt-in rules at all').toBeGreaterThanOrEqual(
      4,
    )
    const unscoped = optIn
      .filter((r) => !r.selectors.some((sel) => /^\.lp-modal\b/.test(sel)))
      .map((r) => r.selectors.join(', '))
    expect(
      unscoped,
      'every rule carrying the .lp-btn opt-in must also carry a .lp-modal dialog scope',
    ).toEqual([])
  })
})
