/**
 * The per-document strip (teacher-first T2): one quiet line per deliverable — its name and two
 * small buttons, PDF (opens in a browser tab) and Word (downloads). Rendered on catalogue rows
 * and on the lesson page; `tags` comes from `versionDeliverables`, so the strip always matches
 * exactly what the export will contain.
 *
 * `condensed` (design track D4 → row redesign 2026-07-14): the catalogue row renders the PRIMARY
 * Lesson plan's PDF/Word inline itself, so in condensed mode this component renders ONLY the
 * SECONDARY documents (Final explanation, Summary table) folded behind a native <details>
 * disclosure — and nothing at all when there are none. The non-condensed FULL strip (one line per
 * deliverable) is the lesson page's Share-menu "Download one document" section (2026-07-17, when
 * that page's own Documents line was removed). <details>/<summary> needs no script, so this stays
 * a server component.
 */
import React from 'react'

import DocButtons from './DocButtons'
import type { DeliverableTag } from '@/generator/exportArtifacts'
import { DELIVERABLE_LABELS, secondaryDeliverables } from '@/generator/deliverables'

function StripItem({ versionId, tag }: { versionId: number; tag: DeliverableTag }) {
  return (
    <li className="doc-strip-item">
      <span className="doc-strip-label">{DELIVERABLE_LABELS[tag]}</span>
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
  const secondary = secondaryDeliverables(tags)

  // Condensed (catalogue rows): the primary Lesson plan buttons render inline on the title line,
  // so here we only surface the secondary documents behind a disclosure — nothing if there are none.
  if (condensed) {
    if (secondary.length === 0) return null
    return (
      <details className="doc-strip-more">
        <summary>Supporting documents ({secondary.length})</summary>
        <ul className="doc-strip">
          {secondary.map((tag) => (
            <StripItem key={tag} versionId={versionId} tag={tag} />
          ))}
        </ul>
      </details>
    )
  }

  // Full strip (lesson page): one line per deliverable.
  return (
    <ul className="doc-strip">
      {tags.map((tag) => (
        <StripItem key={tag} versionId={versionId} tag={tag} />
      ))}
    </ul>
  )
}
