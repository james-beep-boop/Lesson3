'use client'

import React, { useState } from 'react'
import Link from 'next/link'

/** Dismissal lasts for this mounted page only; it creates no preference or draft. */
export default function NewerAresPrompt({
  ownId,
  ownSemver,
  officialId,
}: {
  ownId: number
  ownSemver: string
  officialId: number
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <aside className="lesson-release-notice" aria-label="Newer ARES release">
      <p>
        ARES has published a newer version of this lesson. Your version {ownSemver} is based on the
        older one.
      </p>
      <div className="lesson-release-notice__actions">
        <Link
          className="btn"
          href={`/admin/collections/lesson-bundle-versions/${ownId}?combineWith=${officialId}`}
        >
          Combine them?
        </Link>
        <button type="button" className="btn btn--quiet" onClick={() => setDismissed(true)}>
          Not now
        </button>
      </div>
    </aside>
  )
}
