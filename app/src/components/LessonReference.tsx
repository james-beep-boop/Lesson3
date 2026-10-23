import React from 'react'
import type { ReferenceView } from '@/lib/lessonReference'
import NewTabLink from './NewTabLink'

/**
 * The stored label survives deletion. An unavailable version gets text, never an Official link.
 *
 * Both links open a new tab (operator decision 2026-10-22), like the URLs in post text: a reader
 * following a reference keeps their place in the thread or message.
 */
export default function LessonReference({
  reference,
  className = 'disc-ref',
}: {
  reference: ReferenceView
  className?: string
}) {
  return (
    <p className={`lesson-reference ${className}`}>
      <span className="muted">Lesson:</span>{' '}
      {reference.lessonHref ? (
        <NewTabLink href={reference.lessonHref} name={reference.label} />
      ) : (
        <span>
          {reference.label} <span className="muted">(this version is no longer available)</span>
        </span>
      )}
      {reference.compareHref && (
        <>
          {' · '}
          <NewTabLink href={reference.compareHref} name="Compare changes" />
        </>
      )}
    </p>
  )
}
