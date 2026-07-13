/**
 * The per-document strip (teacher-first T2): one quiet line per deliverable — its name and two
 * small buttons, PDF (opens in a browser tab) and Word (downloads). Rendered on catalogue rows
 * and on the lesson page; `tags` comes from `versionDeliverables`, so the strip always matches
 * exactly what the export will contain.
 *
 * `condensed` (design track D4, decision 2026-07-12): catalogue rows keep the Lesson plan's
 * PDF/Word one click away (the teacher-first intent) but fold Final explanation / Summary table
 * behind a native <details> disclosure — six buttons per row was heavy to scan. The lesson page
 * keeps the full strip. <details>/<summary> needs no script, so this stays a server component.
 */
import React from 'react'

import DocButtons from './DocButtons'
import type { DeliverableTag } from '@/generator/exportArtifacts'

const DOC_LABELS: Record<DeliverableTag, string> = {
  lessonSequence: 'Lesson plan',
  finalExplanation: 'Final explanation',
  summaryTable: 'Summary table',
}

function StripItem({ versionId, tag }: { versionId: number; tag: DeliverableTag }) {
  return (
    <li className="doc-strip-item">
      <span className="doc-strip-label">{DOC_LABELS[tag]}</span>
      <DocButtons versionId={versionId} tag={tag} />
    </li>
  )
}

export default function DocStrip({
  versionId,
  tags,
  condensed = false,
}: {
  versionId: number
  tags: DeliverableTag[]
  condensed?: boolean
}) {
  const primary = tags.filter((t) => t === 'lessonSequence')
  const secondary = tags.filter((t) => t !== 'lessonSequence')

  if (!condensed || secondary.length === 0 || primary.length === 0) {
    return (
      <ul className="doc-strip">
        {tags.map((tag) => (
          <StripItem key={tag} versionId={versionId} tag={tag} />
        ))}
      </ul>
    )
  }

  return (
    <div className="doc-strip-condensed">
      <ul className="doc-strip">
        {primary.map((tag) => (
          <StripItem key={tag} versionId={versionId} tag={tag} />
        ))}
      </ul>
      <details className="doc-strip-more">
        <summary>More documents ({secondary.length})</summary>
        <ul className="doc-strip">
          {secondary.map((tag) => (
            <StripItem key={tag} versionId={versionId} tag={tag} />
          ))}
        </ul>
      </details>
    </div>
  )
}
