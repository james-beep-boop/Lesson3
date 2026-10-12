import React from 'react'
import type { ReferenceView } from '@/lib/lessonReference'

/** The stored label survives deletion. An unavailable version gets text, never an Official link. */
export default function LessonReference({
  reference,
  className = 'disc-ref',
}: {
  reference: ReferenceView
  className?: string
}) {
  return (
    <p className={className}>
      <span className="muted">Lesson:</span>{' '}
      {reference.lessonHref ? (
        <a href={reference.lessonHref}>{reference.label}</a>
      ) : (
        <span>
          {reference.label} <span className="muted">(this version is no longer available)</span>
        </span>
      )}
      {reference.compareHref && (
        <>
          {' · '}
          <a href={reference.compareHref}>Compare changes</a>
        </>
      )}
    </p>
  )
}
