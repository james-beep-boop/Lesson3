/**
 * The per-document strip (teacher-first T2): one quiet line per deliverable — its name and two
 * small buttons, PDF (opens in a browser tab) and Word (downloads). Rendered on catalogue rows
 * and on the lesson page; `tags` comes from `versionDeliverables`, so the strip always matches
 * exactly what the export will contain.
 */
import React from 'react'

import DocButtons from './DocButtons'
import type { DeliverableTag } from '@/generator/exportArtifacts'

const DOC_LABELS: Record<DeliverableTag, string> = {
  lessonSequence: 'Lesson plan',
  finalExplanation: 'Final explanation',
  summaryTable: 'Summary table',
}

export default function DocStrip({
  versionId,
  tags,
}: {
  versionId: number
  tags: DeliverableTag[]
}) {
  return (
    <ul className="doc-strip">
      {tags.map((tag) => (
        <li key={tag} className="doc-strip-item">
          <span className="doc-strip-label">{DOC_LABELS[tag]}</span>
          <DocButtons versionId={versionId} tag={tag} />
        </li>
      ))}
    </ul>
  )
}
