import React from 'react'
import type { OfficialPreview } from '../../ingest/releaseDecision'
import { releaseDateLabel } from '../../lib/aresReleasePresentation'

/** Presentation only. Every decision and confirmation requirement comes from the server preview. */
export default function OfficialPreviewList({ preview }: { preview: OfficialPreview[] }) {
  const sections = [
    {
      title: 'Will become Official',
      items: preview.filter((p) => p.decision === 'new' && p.willMove),
    },
    {
      title: 'Waiting for the subject-grade administrator',
      items: preview.filter((p) => p.decision === 'new' && !p.willMove),
    },
    { title: 'No change', items: preview.filter((p) => p.decision !== 'new') },
  ]
  return sections.map(
    ({ title, items }) =>
      items.length > 0 && (
        <section className="lp-upload-confirm__section" key={title} aria-label={title}>
          <h3>{title}</h3>
          <ul className="lp-manage__list">
            {items.map((p) => (
              <li key={p.file}>
                <strong>{p.title}</strong>
                <div>
                  {p.decision === 'new'
                    ? `${p.willMove ? `${p.previousSemver ?? 'none'} → ${p.incomingSemver}` : `New version ${p.incomingSemver}; Official stays ${p.previousSemver ?? 'unset'}`} · ${p.release ? `ARES release ${releaseDateLabel(p.release.date)}` : 'ARES release: not stated'}`
                    : p.reason}
                </div>
                {p.decision === 'new' && !p.willMove && <p>{p.reason}</p>}
                {p.olderContent && (
                  <p className="lp-upload-confirm__warning">
                    Same content as version {p.olderContent} (an earlier release).{' '}
                    {p.willMove && 'Importing it will make this content Official again.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ),
  )
}
