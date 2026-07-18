'use client'

/**
 * Password input with a show/hide "eye" toggle (user request 2026-07-17). A thin wrapper over the
 * native input: the toggle flips `type` between password/text so what you typed becomes readable —
 * most valuable on signup/reset, where there's no "just retype it" fallback for a typo. Shared by
 * login, signup, and reset-password so the three auth forms stay identical.
 *
 * The button is icon-only by design (the eye is the near-universal convention for this control) but
 * never silent: aria-label + title + aria-pressed carry the state, the same pattern as the
 * catalogue's FavoriteToggle glyph. It stays usable while the form is busy — revealing what you
 * already typed is harmless and helps diagnose a rejected password.
 */
import React, { useState } from 'react'

export default function PasswordInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>,
) {
  const [visible, setVisible] = useState(false)
  const label = visible ? 'Hide password' : 'Show password'
  return (
    <span className="pw-field">
      <input {...props} type={visible ? 'text' : 'password'} className="pw-field__input" />
      <button
        type="button"
        className="pw-field__toggle"
        aria-label={label}
        title={label}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {/* Open eye = "will show"; struck-through eye = "will hide". Stroke icons, currentColor. */}
        {visible ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            <line x1="4" y1="20" x2="20" y2="4" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}
