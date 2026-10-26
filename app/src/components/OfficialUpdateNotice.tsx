import React from 'react'

import type { officialUpdateNotice } from '@/lib/aresReleasePresentation'
import { LocalDay } from './Manage/LocalTime'

/** "Official updated to the ARES release of … on …" — the date in the reader's own time zone. */
export default function OfficialUpdateNotice({
  release,
  changedAt,
  previousSemver,
}: NonNullable<ReturnType<typeof officialUpdateNotice>>) {
  return (
    <p className="disc-notice lesson-release-notice" role="note">
      Official updated to{' '}
      {release ? `the ARES release of ${release}` : 'an ARES release (date not stated)'} on{' '}
      <LocalDay at={changedAt} />.
      {previousSemver &&
        ` The previous Official (${previousSemver}) is still in the version history.`}
    </p>
  )
}
