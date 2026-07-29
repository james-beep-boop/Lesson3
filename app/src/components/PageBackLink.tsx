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
 * it renders a plain `<a>` with the same `.page-back` styling. Routing a guaranteed full reload
 * through `next/link` would buy no speed and only risk the admin router mishandling the cross-root
 * hop. Same appearance (shared `.page-back` tokens), fastest correct navigation per surface.
 */
export default function PageBackLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link className="page-back" href={href}>
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  )
}
