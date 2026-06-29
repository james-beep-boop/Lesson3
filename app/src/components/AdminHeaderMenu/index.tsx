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
          regardless; this hides the tab in the edit view for everyone else. Rendered here because the
          admin header is present on every admin page (incl. the document edit view). `hideAPIURL` would
          hide it for ALL roles, so a CSS rule is used instead — couples to Payload's `.doc-tab[href$="/api"]`
          markup (verified payload@3.85.1); re-check on Payload upgrades. */}
      {!isSiteAdmin(user) && (
        <style dangerouslySetInnerHTML={{ __html: '.doc-tab[href$="/api"]{display:none!important}' }} />
      )}
      <header className="lp-admin-header">
        <AppNav user={user} />
      </header>
    </>
  )
}
