/**
 * Nav brand (admin.components.graphics.Icon) — replaces the default Payload mark (and the old
 * cryptic "LPR3" monogram) with a plain, legible wordmark. It links to the admin home. Static
 * server component.
 */
import React from 'react'

export default function Icon() {
  return (
    <strong style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', color: 'var(--theme-elevation-1000)' }}>
      Lesson Plans
    </strong>
  )
}
