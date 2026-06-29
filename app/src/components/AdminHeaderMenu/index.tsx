import React from 'react'

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
    <header className="lp-admin-header">
      <AppNav user={user} />
    </header>
  )
}
