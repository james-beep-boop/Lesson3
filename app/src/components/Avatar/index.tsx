import React from 'react'

import { initials } from '../../lib/initials'

/**
 * Initials avatar — a simple circle with the user's initials, no external calls (good for offline +
 * privacy; no gravatar). Shared by the frontend header and the admin header; each surface styles
 * `.avatar` in its own stylesheet (frontend tokens vs Payload theme variables).
 */
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name)}
    </span>
  )
}
