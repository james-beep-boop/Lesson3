/**
 * Nav brand (admin.components.graphics.Icon) — replaces the default Payload mark in the
 * admin navigation with a compact monogram. Static server component.
 */
import React from 'react'

export default function Icon() {
  return (
    <strong style={{ fontSize: '0.95rem', letterSpacing: '0.03em', color: 'var(--theme-elevation-1000)' }}>
      LPR3
    </strong>
  )
}
