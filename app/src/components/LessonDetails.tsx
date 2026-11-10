import React from 'react'
import { LocalTime } from './Manage/LocalTime'

export interface LessonDetailFields {
  versionLabel: string
  savedBy: string
  basedOn: string
  createdAt: string
  updatedAt: string
}

/**
 * "Details", or "Versions & details" when the caller passes version controls. Native disclosure:
 * keyboard accessible, closed on arrival, and usable without JavaScript.
 *
 * ⚑ IT GROUPS, IT DOES NOT WIDEN THE AUDIENCE (interface refinement 2026-11-10, plan §5). The page
 * passes `versions` only under the existing `canEdit && versions.length > 1` gate, so a plain Teacher
 * sees "Details" with the metadata and never a version list, count or Compare.
 */
export default function LessonDetails({
  fields,
  versions,
}: {
  fields: LessonDetailFields | null
  versions?: React.ReactNode
}) {
  return (
    <details className="lesson-details">
      <summary>{versions ? 'Versions & details' : 'Details'}</summary>
      {versions && <div className="lesson-details__versions">{versions}</div>}
      {fields && (
        <dl className="lesson-details__fields">
          <dt>Version</dt>
          <dd>{fields.versionLabel}</dd>
          <dt>Saved by</dt>
          <dd>{fields.savedBy}</dd>
          <dt>Based on version</dt>
          <dd>{fields.basedOn}</dd>
          <dt>Created</dt>
          <dd>
            <LocalTime at={fields.createdAt} />
          </dd>
          <dt>Last modified</dt>
          <dd>
            <LocalTime at={fields.updatedAt} />
          </dd>
        </dl>
      )}
    </details>
  )
}
