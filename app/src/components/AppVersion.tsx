import React from 'react'

import { appVersionLabel, currentAppVersion } from '@/lib/appVersion'

export default function AppVersion() {
  return <p className="app-version muted">{appVersionLabel(currentAppVersion())}</p>
}
