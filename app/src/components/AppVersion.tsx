import React from 'react'

import { appVersionLabel } from '@/lib/appVersion'

export default function AppVersion() {
  const version =
    process.env.APP_RELEASE_VERSION ??
    (process.env.NODE_ENV === 'development' ? 'development' : undefined)
  return <p className="app-version muted">{appVersionLabel(version)}</p>
}
