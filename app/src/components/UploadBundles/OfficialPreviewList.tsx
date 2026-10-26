import React from 'react'
import type { OfficialPreview } from '../../ingest/releaseDecision'
import { aresReleaseLabel } from '../../lib/aresReleasePresentation'

const release = (p: OfficialPreview) =>
  aresReleaseLabel({ releaseFingerprint: p.fingerprint, aresReleaseDate: p.release?.date })

/** Presentation only. Every decision and confirmation requirement comes from the server preview. */
export default function OfficialPreviewList({ preview }: { preview: OfficialPreview[] }) {
  const sections = [
    {
      title: 'Will become Official',
      items: preview.filter((p) => p.decision === 'new' && p.willMove),
      detail: (p: OfficialPreview) =>
        `${p.previousSemver ?? 'none'} → ${p.incomingSemver} · ${release(p)}`,
    },
    {
      title: 'Waiting for the subject-grade administrator',
      items: preview.filter((p) => p.decision === 'new' && !p.willMove),
      detail: (p: OfficialPreview) =>
        `New version ${p.incomingSemver}; Official stays ${p.previousSemver ?? 'unset'} · ${release(p)}`,
      reason: true,
    },
    {
      title: 'No change',
      items: preview.filter((p) => p.decision !== 'new'),
      detail: (p: OfficialPreview) => p.reason,
    },
  ]
  return sections.map(
    ({ title, items, detail, reason }) =>
      items.length > 0 && (
        <section className="lp-upload-confirm__section" key={title} aria-label={title}>
          <h3>{title}</h3>
          <ul className="lp-manage__list">
            {items.map((p) => (
              <li key={p.file}>
                <strong>{p.title}</strong>
                <div>{detail(p)}</div>
                {reason && <p>{p.reason}</p>}
                {p.olderContent && (
                  <p className="lp-confirm__warn">
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
