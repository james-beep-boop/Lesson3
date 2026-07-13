import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { isEditorFor, isSubjectAdminFor, toId } from '@/access'
import { findReadablePlan, findReadableVersions } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { lessonDisplayName } from '@/lib/substrand'
import { renderVersionSectionsCached } from '@/generator/htmlSectionsCache'
import { type PreviewSection } from '@/generator/previewBundle'
import { annotateLessonAnchors, docSectionId } from '@/lib/lessonAnchors'
import DownloadButtons from './DownloadButtons'
import EmailDocButton from './EmailDocButton'
import EditActions from './EditActions'
import FavoriteToggle from '@/components/FavoriteToggle'
import DocStrip from '@/components/DocStrip'
import RequestEditingButton from '@/components/RequestEditingButton'
import VersionsChip from '@/components/VersionsChip'
import { versionDeliverables } from '@/generator/adapter'

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
  searchParams: Promise<{ version?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { payload, user } = await requireUser()

  // Access-gated plan read; not-visible → 404. Real DB/runtime errors propagate.
  const plan = await findReadablePlan(payload, { id, user })
  if (!plan) notFound()

  // All retained versions of this plan (for the selector), oldest → newest. The shared
  // access-gated list (lib/readBundle) — also the compare page's READ proof, so the visibility
  // rule lives in one place.
  const versions = await findReadableVersions(payload, { planId: plan.id, user })

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

  // The caller's favorite row for the VIEWED version (§10, per-version by design 2026-07-06:
  // favoriting 1.0.2 pins that snapshot). Own-rows-only by access; presence + row id drive the
  // heading star, which follows the version selector.
  const { docs: favRows } = await payload.find({
    collection: 'favorites',
    where: { version: { equals: selectedId } },
    overrideAccess: false,
    user,
    depth: 0,
    limit: 1,
    select: {},
  })
  const favoriteId = favRows[0]?.id ?? null

  // Faithful content view: render the REAL generated DOCX to HTML (SPEC §5 content-preview tier).
  // Derived from the generator, never a parallel renderer. Plain-string prose → mammoth escapes it,
  // so the rendered HTML carries no executable markup. FE/ST may be legitimately absent. Cached by
  // the immutable version id (Phase 3) — the access-gated `selected` above proves READ, so the
  // cache's overrideAccess system fetch on a miss is safe.
  let sections: PreviewSection[] = []
  let viewError: string | null = null
  try {
    sections = await renderVersionSectionsCached(payload, selectedId)
  } catch (e) {
    payload.logger.error({ err: e, versionId: selectedId, userId: user?.id }, 'lesson render failed')
    viewError = 'Could not render this lesson.'
  }

  // In-page navigation (critique 2026-07-12): inject per-lesson anchor ids into the Lesson
  // Sequence HTML (post-cache string transform — the cached entry itself is untouched) and
  // collect the jump targets for the sticky nav below.
  const annotatedSections = sections.map((s) => {
    const { html, anchors } = annotateLessonAnchors(s.html)
    return { label: s.label, html, anchors }
  })

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
        <FavoriteToggle versionId={selectedId} favoriteId={favoriteId} showLabel />
      </div>

      {/* Versions are an EDITOR concern (teacher-first lock, DECISIONS 2026-07-08 §4): teachers
          see the Official only — no versions UI, no Compare. The read gate is unchanged; a teacher
          with a direct ?version= link can still open it. Redesign PR ③ (design 2026-07-06): the
          pill bar is REPLACED by the same chip+panel the catalogue uses — `Version 1.0.2 ·
          Official  [N versions ▾]  [Compare]` — with the panel marking the version being viewed. */}
      {canEdit && (
        <nav className="version-bar" aria-label="Versions">
          <span className="version-label">
            Version {selected.semver ?? `v${selectedId}`}
            {selectedId === officialId && <span className="official-tag"> · Official</span>}
          </span>
          {versions.length > 1 && (
            <>
              <VersionsChip
                planId={plan.id}
                officialVersionId={officialId ?? null}
                versionCount={versions.length}
                currentVersionId={selectedId}
                panelLabel={title}
              />
              <Link className="compare-link" href={`/lessons/${plan.id}/compare`}>
                Compare
              </Link>
            </>
          )}
        </nav>
      )}

      {/* T2: the teacher's primary download surface — one line per document, PDF opens in a
          browser tab, Word downloads. The whole-export .zip demotes to the action bar below. */}
      <DocStrip versionId={selectedId} tags={versionDeliverables(selected)} />

      {/* Sticky while reading (critique 2026-07-12): the action bar plus the in-page jump nav
          stay reachable through an 8-lesson scroll instead of vanishing after the first screen. */}
      <div className="lesson-toolbar">
        <div className="export-bar">
          {canEdit && (
            <EditActions
              versionId={selectedId}
              canMakeOfficial={canMakeOfficial}
              officialVersionId={officialId ?? null}
            />
          )}
          {/* T3: viewers without edit rights can ask for them — recipients resolve server-side. */}
          {!canEdit && <RequestEditingButton planId={plan.id} />}
          <span className="export-label">Download all</span>
          <DownloadButtons versionId={selectedId} />
          <EmailDocButton versionId={selectedId} />
          {/* Internal messaging handoff (§10): prefills compose with this plan+version as the link. */}
          <Link className="msg-share-link" href={`/messages?plan=${plan.id}&version=${selectedId}`}>
            Message a colleague
          </Link>
        </div>
        {annotatedSections.length > 0 && (
          <nav className="doc-nav" aria-label="Jump to section">
            {annotatedSections.map((s) => {
              const isSequence = s.label === 'Lesson Sequence'
              return (
                <React.Fragment key={s.label}>
                  {/* The Lesson Sequence opens with the sub-strand overview table, so its section
                      link reads "Overview"; the per-lesson chips follow it. */}
                  <a href={`#${docSectionId(s.label)}`}>{isSequence ? 'Overview' : s.label}</a>
                  {isSequence && s.anchors.length > 0 && (
                    <span className="doc-nav__label">Lessons</span>
                  )}
                  {isSequence &&
                    s.anchors.map((a) => (
                      <a
                        key={a.id}
                        className="doc-nav__lesson"
                        href={`#${a.id}`}
                        title={`Lesson ${a.number}: ${a.title}`}
                        aria-label={`Lesson ${a.number}: ${a.title}`}
                      >
                        {a.number}
                      </a>
                    ))}
                </React.Fragment>
              )
            })}
          </nav>
        )}
      </div>

      {viewError ? (
        <p className="muted">{viewError}</p>
      ) : (
        annotatedSections.map((s) => (
          <section key={s.label} id={docSectionId(s.label)} className="doc-section">
            <h2 className="doc-section-title">{s.label}</h2>
            <div className="doc-preview" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))
      )}
    </article>
  )
}
