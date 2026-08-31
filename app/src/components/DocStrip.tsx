/**
 * The per-document strip (teacher-first T2): one quiet line per deliverable — its name and two
 * small buttons, PDF (opens in a browser tab) and Word (downloads). Rendered on catalogue rows
 * and on the lesson page.
 *
 * ⚑ `tags` IS WHAT THE CALLER CHOSE TO SHOW, NOT NECESSARILY THE WHOLE EXPORT. It used to be
 * `versionDeliverables` verbatim on both surfaces; since 2026-08-30 the lesson page's Share menu
 * passes `secondaryDeliverables(...)`, because the primary Lesson plan now has its own PDF/Word on
 * that page's action bar and listing it here too would render the identical pair twice. Render what
 * you are given — the primary/secondary split is the CALLER's to apply (`deliverables.ts`), and both
 * surfaces now apply it.
 *
 * `condensed` (design track D4 → row redesign 2026-07-14): the catalogue row renders the PRIMARY
 * Lesson plan's PDF/Word inline itself, so in condensed mode this component renders ONLY the
 * SECONDARY documents (Final explanation, Summary table) folded behind a native <details>
 * disclosure — and nothing at all when there are none. The non-condensed strip (one line per tag it
 * is given) is the lesson page's Share-menu "Download one document" section (2026-07-17, when that
 * page's own Documents line was removed; narrowed to the supporting documents 2026-08-30 by the
 * filter above). <details>/<summary> needs no script, so this stays a server component.
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
