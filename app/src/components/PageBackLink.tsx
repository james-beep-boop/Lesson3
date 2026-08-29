import React from 'react'
import Link from 'next/link'

/**
 * Shared page-level Back control for the FRONTEND route group (lesson, compare, guide,
 * forgot-password). `next/link` gives a soft client-side navigation: Back is a frequent action and
 * these pages are server-rendered, so a full document reload would cost the bandwidth-constrained
 * audience for no benefit.
 *
 * The version editor deliberately does NOT use this component. It lives in Payload's admin root and
 * its Back crosses into the frontend root — a full-document navigation regardless of link type — so
 * it renders a plain `<a>` with the same `.btn` styling. Routing a guaranteed full reload through
 * `next/link` would buy no speed and only risk the admin router mishandling the cross-root hop.
 * Same appearance (shared `--app-btn-*` tokens), fastest correct navigation per surface.
 *
 * The VISIBLE label is always the single word "Back" (operator decision 2026-07-30): it was the
 * widest control in a narrow action bar, and its old 16px/600 treatment made it read heavier than
 * everything beside it. The destination moves into `aria-label`, where it is still announced — the
 * two surfaces go to different places ("Back to lesson plans" vs "Back to lesson"), and that
 * distinction is load-bearing for anyone who cannot see which page they are on.
 *
 * ⚑ QUIET + COMPACT, AND THE ← IS GONE (operator decision 2026-08-29) — a continuation of that same
 * 2026-07-30 trim, not a new idea. What settled it was measurement rather than taste: the control was
 * proposed as an ICON-ONLY button to save width on a phone, and there was no width to save. At 375px
 * the lesson page's action row uses 191px of 359 with 168px spare, and the editor's Back sits ALONE on
 * its row with 270px unused, so nothing wraps and no line is reclaimed at any size. That left weight,
 * not width, as the real complaint — and `.btn--quiet` is the existing answer to weight, already worn
 * by the catalogue's download pills and the Compare toolbar.
 *
 * ⚑ AND IT STAYED A WORD. An icon-only Back was mocked up and rejected: this is a `next/link` to a
 * FIXED destination, not `history.back()`, and a bare arrow promises browser-back — a promise it does
 * not keep, on phones whose users already have a system back gesture. The word costs nothing here
 * because the row has room. The `←` went with the same reasoning applied to the glyph: it was
 * decorative, `aria-label` carries the real announcement, and it pulled the control toward looking
 * like history navigation.
 *
 * ⚑ `btn--compact` IS SAFE AT PHONE WIDTH because `styles.css` restates `.btn.btn--compact` inside its
 * ≤640px block, lifting it back to the 44px touch target in BOTH dimensions. That restatement is
 * load-bearing (#179/#180) — compact is a desktop density, and without it this control would ship at
 * 26px on the phone it was shortened for.
 */
export default function PageBackLink({
  href,
  label,
}: {
  href: string
  /** The full destination phrase, e.g. "Back to lesson plans". Announced, not displayed. */
  label: string
}) {
  return (
    <Link className="btn btn--quiet btn--compact" href={href} aria-label={label}>
      Back
    </Link>
  )
}
