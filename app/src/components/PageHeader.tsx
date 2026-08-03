import React from 'react'

/**
 * The shared page-level heading for the FRONTEND route group: a title column on the left, an action
 * cluster on the right, stacking to a column at ≤640px.
 *
 * Deferred deliberately in visual-system PR 1 (`docs/DESIGN-visual-system-2026-07-31.md` §4.2) —
 * it had potential consumers but PR 1 declared frontend restructuring out of scope, so extracting it
 * there would have meant editing pages that PR promised not to touch. It is extracted here, in the
 * first visual PR that touches a second page, with its API taken from three live callers rather than
 * guessed: the Guide, the version-compare view and the lesson page.
 *
 * ⚑ Extraction also retired a DUPLICATE: `.lesson-heading` / `.lesson-heading__actions` had rule
 * bodies byte-identical to the `.page-heading` pair, and two pages applied both. The one rule they
 * did NOT duplicate was the `h1` treatment, and that is the load-bearing part — scoped to
 * `.lesson-heading h1` it reached only those two pages, so the Guide had to declare its own title
 * size (and rendered it 22.4px against everyone else's 30px). See `styles.css` for the CSS side.
 *
 * The three callers had three near-identical DOM shapes (compare put its `<h1>` straight into the
 * flex row, the Guide wrapped it in an unclassed `<div>`, the lesson page in `.lesson-heading__text`).
 * They are converged on the wrapped form — one shape, not three — which is the point of having a
 * component at all. CSS could not have done this: it can only accumulate selectors tolerating each
 * variant, which is how the duplicate class arose in the first place. Verified by measurement to
 * leave geometry unchanged on all three pages.
 *
 * `kicker` and `children` are separate slots on purpose. The Guide's "User guide" label sits ABOVE
 * the title and the lesson page's context line sits BELOW it; folding both into one `children` slot
 * would have forced one of the two pages to move its text, which is a visual change and not this
 * component's business.
 *
 * Back is NOT absorbed. It is one of several possible actions — the lesson page also renders
 * `FavoriteToggle` — so callers keep composing `PageBackLink` themselves. There is deliberately no
 * `className` escape hatch: no caller needs one, and it would re-open the per-page heading override
 * this extraction closed. Add it with the caller that needs it, not before.
 */
export default function PageHeader({
  title,
  kicker,
  actions,
  children,
}: {
  title: React.ReactNode
  /** Label rendered ABOVE the title (the Guide's "User guide"). */
  kicker?: React.ReactNode
  /** Right-hand control cluster — Back, and whatever else the page offers. */
  actions?: React.ReactNode
  /** Sub-title content rendered BELOW the title (the lesson page's context line). */
  children?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div className="page-heading__text">
        {kicker}
        <h1>{title}</h1>
        {children}
      </div>
      {actions ? <div className="page-heading__actions">{actions}</div> : null}
    </div>
  )
}
