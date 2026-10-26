import React from 'react'
import { LocalTime } from './Manage/LocalTime'

/** Native disclosure: keyboard accessible, closed on arrival, and usable without JavaScript. */
export default function LessonDetails({
  versionLabel,
  savedBy,
  basedOn,
  createdAt,
  updatedAt,
}: {
  versionLabel: string
  savedBy: string
  basedOn: string
  createdAt: string
  updatedAt: string
}) {
  return (
    <details className="lesson-details">
      <summary className="btn btn--quiet">
        <span className="lesson-details__show">Show details</span>
        <span className="lesson-details__hide">Hide details</span>
      </summary>
      <dl className="lesson-details__fields">
        <dt>Version</dt>
        <dd>{versionLabel}</dd>
        <dt>Saved by</dt>
        <dd>{savedBy}</dd>
        <dt>Based on version</dt>
        <dd>{basedOn}</dd>
        <dt>Created</dt>
        <dd>
          <LocalTime at={createdAt} />
        </dd>
        <dt>Last modified</dt>
        <dd>
          <LocalTime at={updatedAt} />
        </dd>
      </dl>
    </details>
  )
}
