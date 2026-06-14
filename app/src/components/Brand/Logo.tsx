/**
 * Login-page brand (admin.components.graphics.Logo) — replaces the default "Payload" logo
 * on the splash/login screen with the project name. Static server component.
 */
import React from 'react'

export default function Logo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--theme-elevation-1000)' }}>
        Lesson Plan Repository 3
      </h1>
      <p style={{ margin: '0.35rem 0 0', color: 'var(--theme-elevation-500)', fontSize: '0.9rem' }}>
        ARES Lesson Library
      </p>
    </div>
  )
}
