import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { findReadablePlan, findReadableVersion } from '@/lib/readBundle'
import { generateForVersion } from '@/generator/generateForVersion'
import { docxToSections, type PreviewSection } from '@/generator/previewBundle'
import type { LessonSequenceFormat } from '@/generator'
import DownloadButtons from './DownloadButtons'
import { ResourcesToggle } from './ResourcesToggle'

const relId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number((value as { id: unknown }).id)
  return null
}

/**
 * Lesson Plan detail (Official-version model). The route id is a LESSON PLAN id; by default we
 * render its Official version, and `?version=<id>` selects any other retained version (the version
 * selector below). Teachers can view/export every version — Official is just the default + trust
 * marker, not an access gate.
 */
export default async function LessonView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ format?: string; version?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { payload, user } = await requireUser()

  // On-screen view defaults to Compact (Standard's Resource column is deferred/blank — see
  // DECISIONS 2026-06-16); the toggle lets a teacher switch to Standard on demand.
  const format: LessonSequenceFormat = sp.format === 'standard' ? 'standard' : 'compact'

  // Access-gated plan read; not-visible → 404. Real DB/runtime errors propagate.
  const plan = await findReadablePlan(payload, { id, user })
  if (!plan) notFound()

  // All retained versions of this plan (for the selector), oldest → newest. Access-gated.
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: plan.id } },
    overrideAccess: false,
    user,
    depth: 0,
    limit: 100,
    sort: 'createdAt',
    select: { semver: true, title: true, createdAt: true },
  })

  const officialId = relId(plan.officialVersion)
  // Selected version: an explicit, valid `?version=` that belongs to this plan, else Official.
  const requested = sp.version ? Number(sp.version) : null
  const selectedId =
    requested != null && versions.some((v) => v.id === requested) ? requested : officialId
  if (selectedId == null) notFound() // a plan with no Official version + no valid selection

  // Re-read the selected version with the caller's access (defence in depth — the list above is
  // already access-gated, but this is the doc we generate from).
  const version = await findReadableVersion(payload, { id: selectedId, user })
  if (!version) notFound()

  const title = version.title ?? plan.title ?? 'Lesson plan'

  // Faithful content view: render the REAL generated DOCX to HTML (SPEC §5 content-preview tier).
  // Derived from the generator, never a parallel renderer. Plain-string prose → mammoth escapes it,
  // so the rendered HTML carries no executable markup. FE/ST may be legitimately absent.
  let sections: PreviewSection[] = []
  let viewError: string | null = null
  try {
    sections = await docxToSections(await generateForVersion(payload, selectedId, format))
  } catch (e) {
    payload.logger.error({ err: e, versionId: selectedId, userId: user?.id }, 'lesson render failed')
    viewError = 'Could not render this lesson.'
  }

  return (
    <article className="lesson">
      <Link href="/" className="back-link">
        ← All lesson plans
      </Link>
      <div className="lesson-heading">
        <h1>{title}</h1>
      </div>

      {versions.length > 1 && (
        <nav className="version-bar" aria-label="Versions">
          <span className="version-label">Version</span>
          {versions.map((v) => {
            const isSelected = v.id === selectedId
            const isOfficial = v.id === officialId
            return (
              <Link
                key={v.id}
                href={`/lessons/${plan.id}?version=${v.id}${format === 'standard' ? '&format=standard' : ''}`}
                className={`version-pill${isSelected ? ' is-selected' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
              >
                {v.semver ?? `v${v.id}`}
                {isOfficial && <span className="official-tag"> · Official</span>}
              </Link>
            )
          })}
        </nav>
      )}

      <div className="export-bar">
        <span className="export-label">Download</span>
        <DownloadButtons versionId={selectedId} format={format} />
        <ResourcesToggle format={format} />
      </div>

      {viewError ? (
        <p className="muted">{viewError}</p>
      ) : (
        sections.map((s) => (
          <section key={s.label} className="doc-section">
            <h2 className="doc-section-title">{s.label}</h2>
            <div className="doc-preview" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))
      )}
    </article>
  )
}
