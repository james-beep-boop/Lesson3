/**
 * Nav brand (admin.components.graphics.Icon) — replaces Payload's default mark. The slot
 * (`.step-nav__home`) is a fixed 18×18px icon box that clips text (which is why a wordmark showed
 * as "Le"/"LP"), so this is a small document glyph sized to the box. Static server component.
 */
import React from 'react'

export default function Icon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--theme-elevation-1000)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Kenya Lesson Plans"
    >
      <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
      <line x1="8.5" y1="13" x2="15" y2="13" />
      <line x1="8.5" y1="16.5" x2="13" y2="16.5" />
    </svg>
  )
}
