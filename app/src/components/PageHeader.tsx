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
 * ⚑ Extraction also retired a DUPLICATE. `.lesson-heading` / `.lesson-heading__actions` had rule
 * bodies byte-identical to `.page-heading` / `.page-heading__actions`, and the lesson and compare
 * pages carried BOTH class names, applying the same declarations twice. There is now one class per
 * element. The only rule `.lesson-heading` did not duplicate was the `h1` treatment, which is now
 * `.page-heading h1` — so a page title is 30px/700 by virtue of BEING a page title, which is what
 * lets the Guide stop declaring its own.
 *
 * The three callers had three near-identical DOM shapes (compare put its `<h1>` straight into the
 * flex row, the Guide wrapped it in an unclassed `<div>`, the lesson page in `.lesson-heading__text`).
 * They are converged on the wrapped form — one shape, not three — which is the point of having a
 * component at all. Verified by measurement to leave geometry unchanged on all three pages.
 *
 * `kicker` and `children` are separate slots on purpose. The Guide's "User guide" label sits ABOVE
 * the title and the lesson page's context line sits BELOW it; folding both into one `children` slot
 * would have forced one of the two pages to move its text, which is a visual change and not this
 * component's business.
 *
 * Back is NOT absorbed. It is one of several possible actions — the lesson page also renders
 * `FavoriteToggle` — so callers keep composing `PageBackLink` themselves.
 */
export default function PageHeader({
  title,
  kicker,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  /** Label rendered ABOVE the title (the Guide's "User guide"). */
  kicker?: React.ReactNode
  /** Right-hand control cluster — Back, and whatever else the page offers. */
  actions?: React.ReactNode
  /** Extra class on the heading row, for page-specific layout. */
  className?: string
  /** Sub-title content rendered BELOW the title (the lesson page's context line). */
  children?: React.ReactNode
}) {
  return (
    <div className={className ? `page-heading ${className}` : 'page-heading'}>
      <div className="page-heading__text">
        {kicker}
        <h1>{title}</h1>
        {children}
      </div>
      {actions ? <div className="page-heading__actions">{actions}</div> : null}
    </div>
  )
}
