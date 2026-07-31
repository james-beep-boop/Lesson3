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
    <Link className="btn" href={href} aria-label={label}>
      <span aria-hidden="true">←</span>
      Back
    </Link>
  )
}
