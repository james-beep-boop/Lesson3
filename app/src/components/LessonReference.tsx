import React from 'react'
import type { ReferenceView } from '@/lib/lessonReference'

/**
 * The stored label survives deletion. An unavailable version gets text, never an Official link.
 *
 * Both links open a new tab (operator decision 2026-10-22), like the URLs in post text: a reader
 * following a reference keeps their place in the thread or message. Same convention as
 * `CompareToOfficialLink` — `↗` for the eye, ", opens in a new tab" for a screen reader. The `\u00a0`
 * keeps a space before the arrow: these links are `inline-flex` on a phone, which trims a plain one.
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
        <a
          href={reference.lessonHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${reference.label}, opens in a new tab`}
        >
          {reference.label}
          {'\u00a0'}
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span>
          {reference.label} <span className="muted">(this version is no longer available)</span>
        </span>
      )}
      {reference.compareHref && (
        <>
          {' · '}
          <a
            href={reference.compareHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Compare changes, opens in a new tab"
          >
            Compare changes{'\u00a0'}
            <span aria-hidden="true">↗</span>
          </a>
        </>
      )}
    </p>
  )
}
