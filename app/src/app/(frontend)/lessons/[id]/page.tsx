import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { isEditorFor, isSubjectAdminFor, toId } from '@/access'
import { findReadablePlan } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { lessonDisplayName } from '@/lib/substrand'
import { generateForVersion } from '@/generator/generateForVersion'
import { docxToSections, type PreviewSection } from '@/generator/previewBundle'
import type { LessonSequenceFormat } from '@/generator'
import DownloadButtons from './DownloadButtons'
import EmailDocButton from './EmailDocButton'
import EditActions from './EditActions'
import { ResourcesToggle } from './ResourcesToggle'
import FavoriteToggle from '@/components/FavoriteToggle'

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
  // `pagination: false`: a plan's version set is naturally bounded (dozens — candidates get pruned
  // via save-as-new/make-official cleanup), and the old `limit: 100` could false-404 a valid
  // `?version=` or even the Official once a plan exceeded it (Codex round-2 #3). Completeness over
  // truncation, same call as the browse page (hardening #8); light projection keeps it cheap.
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: plan.id } },
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
    sort: 'createdAt',
    select: {
      semver: true,
      title: true,
      createdAt: true,
      meta: { subject: true, grade: true, substrand_name: true },
    },
  })

  const officialId = relId(plan.officialVersion)
  // Selected version: an explicit, valid `?version=` that belongs to this plan, else Official.
  const requested = sp.version ? Number(sp.version) : null
  const selected =
    (requested != null && versions.find((v) => v.id === requested)) ||
    versions.find((v) => v.id === officialId)
  if (!selected) notFound() // a plan with no Official version + no valid selection

  // The version list is already access-gated and scoped to this plan, so `selected` proves the user
  // may read it — no second read needed; `generateForVersion` reads the content for rendering.
  const selectedId = selected.id
  // Match the library: the heading shows the clean sub-strand name, not the shouty stored
  // "SUBJECT GRADE N:" title (which still appears, faithfully, inside the generated document
  // preview below). A muted context line carries the subject + grade.
  const title = lessonDisplayName(selected.meta?.substrand_name, selected.title ?? plan.title)
  const contextLine = [
    selected.meta?.subject,
    selected.meta?.grade != null ? `Grade ${selected.meta.grade}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // Edit affordances (Stage 2b, working-copy model): Editors (and admins) for this plan's
  // subject-grade may fork a working copy and prose-edit it; only Subject/Site Admins may move the
  // Official pointer (Make Official).
  const sgId = toId(plan.subjectGrade as never)
  const canEdit = isEditorFor(user, sgId)
  const canMakeOfficial = isSubjectAdminFor(user, sgId)

  // The caller's favorite row for this plan (§10) — own-rows-only by access, plan-level (the star
  // follows the lesson, not the selected version). Presence + row id drive the heading star.
  const { docs: favRows } = await payload.find({
    collection: 'favorites',
    where: { lessonPlan: { equals: plan.id } },
    overrideAccess: false,
    user,
    depth: 0,
    limit: 1,
    select: {},
  })
  const favoriteId = favRows[0]?.id ?? null

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
        <div className="lesson-heading__text">
          <h1>{title}</h1>
          {contextLine && <p className="lesson-context">{contextLine}</p>}
        </div>
        <FavoriteToggle planId={plan.id} favoriteId={favoriteId} />
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
        {canEdit && (
          <EditActions
            versionId={selectedId}
            canMakeOfficial={canMakeOfficial}
            officialVersionId={officialId ?? null}
          />
        )}
        <span className="export-label">Download</span>
        <DownloadButtons versionId={selectedId} format={format} />
        <EmailDocButton versionId={selectedId} format={format} />
        <ResourcesToggle format={format} />
        {/* Internal messaging handoff (§10): prefills compose with this plan+version as the link. */}
        <Link className="msg-share-link" href={`/messages?plan=${plan.id}&version=${selectedId}`}>
          Message a colleague
        </Link>
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
