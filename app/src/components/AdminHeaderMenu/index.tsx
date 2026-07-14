import React from 'react'

import { isSiteAdmin } from '../../access'
import { AppNav } from '../AppNav'
import type { User } from '../../payload-types'

/**
 * Admin top-right nav (admin.components.header) — renders the SAME {@link AppNav} as the frontend
 * header, so the two surfaces are identical: Lessons · [Manage] · Guide · avatar dropdown. Payload's
 * own nav logout is hidden in custom.scss so logout lives only in the avatar dropdown, everywhere.
 *
 * Rendered at the top of the admin template with `serverProps` (incl. the signed-in `user`).
 */
export default function AdminHeaderMenu({ user }: { user?: User | null }) {
  if (!user) return null
  return (
    <>
      {/* The document "API" tab is for Site Admins only. The endpoint stays access-controlled
          regardless; this hides the tab for everyone else (everywhere), plus all doc tabs on the
          lesson-version edit view (where the Edit tab is already hidden for all roles — so a non-Site
          Admin would otherwise see an empty tab bar). `hideAPIURL` would hide it for ALL roles, so a CSS
          rule is used instead — couples to Payload's `.doc-tab` markup (verified payload@3.85.1). */}
      {!isSiteAdmin(user) && (
        <style
          dangerouslySetInnerHTML={{
            __html:
              '.doc-tab[href$="/api"]{display:none!important}.collection-edit--lesson-bundle-versions .doc-tabs{display:none!important}',
          }}
        />
      )}
      <header className="lp-admin-header">
        {/* Same brand wordmark as the frontend header (design track D2 — the editing surface
            previously had the nav links but no product identity). Plain <a>: cross-surface nav. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="brand">
          ARES Lesson Plans
        </a>
        <AppNav user={user} />
      </header>
    </>
  )
}
