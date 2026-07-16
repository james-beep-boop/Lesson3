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
import { annotateSections, docNavItems, docSectionId } from '@/lib/lessonAnchors'
import EditActions from './EditActions'
import ShareMenu from './ShareMenu'
import FavoriteToggle from '@/components/FavoriteToggle'
import DocButtons from '@/components/DocButtons'
import DocStrip from '@/components/DocStrip'
import RequestEditingButton from '@/components/RequestEditingButton'
import VersionsChip from '@/components/VersionsChip'
import { versionDeliverables } from '@/generator/adapter'
import { PRIMARY_DELIVERABLE } from '@/generator/deliverables'

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

  // What the export will contain — drives the Documents line + supporting-docs disclosure.
  const deliverables = versionDeliverables(selected)

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
  // Sequence HTML (post-cache string transform — the cached entry itself is untouched). The nav
  // items come from the shared cross-surface model so this page and the preview page can't drift.
  const annotatedSections = annotateSections(sections)
  const navItems = docNavItems(annotatedSections)

  return (
    <article className="lesson">
      <Link href="/" className="back-link">
        ← All lesson plans
      </Link>
      <div className="lesson-heading">
        <div className="lesson-heading__text">
          <h1>{title}</h1>
          {/* One merged meta line (declutter L3, 2026-07-15): subject · grade · version · Official,
              read by everyone — the semver + Official text is a static trust marker. The versions
              UI stays an EDITOR concern (teacher-first lock, DECISIONS 2026-07-08 §4): chip +
              Compare render only for editors, and only when there is a real choice. */}
          <p className="lesson-context">
            {contextLine && `${contextLine} · `}Version {selected.semver ?? `v${selectedId}`}
            {selectedId === officialId && <strong className="official-tag"> · Official</strong>}
            {canEdit && versions.length > 1 && (
              <>
                {' '}
                <VersionsChip
                  planId={plan.id}
                  officialVersionId={officialId ?? null}
                  versionCount={versions.length}
                  currentVersionId={selectedId}
                  panelLabel={title}
                />{' '}
                <Link className="compare-link" href={`/lessons/${plan.id}/compare`}>
                  Compare
                </Link>
              </>
            )}
          </p>
        </div>
        <FavoriteToggle versionId={selectedId} favoriteId={favoriteId} showLabel />
      </div>

      {/* One Documents line (declutter L1): the primary Lesson plan's PDF/Word stay one-click on
          their own line; Final explanation / Summary table fold behind the same "Supporting
          documents" disclosure the catalogue rows use (DocStrip condensed) — one pattern on both
          surfaces. Revises the 2026-07-13 "detail page keeps the full strip" call (user, 2026-07-15). */}
      {deliverables.includes(PRIMARY_DELIVERABLE) && (
        <div className="docs-line">
          <span className="docs-line__label">Lesson plan</span>
          <DocButtons versionId={selectedId} tag={PRIMARY_DELIVERABLE} />
        </div>
      )}
      <DocStrip versionId={selectedId} tags={deliverables} condensed />

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
          {/* Share ▾ (declutter L2): Download-all zips + Email + Message fold into one menu. A
              left border on .share-wrap divides it from the edit/request group (matching the
              editor bar's --output group divider). */}
          <ShareMenu planId={plan.id} versionId={selectedId} semver={selected.semver} />
        </div>
        {navItems.length > 0 && (
          <nav className="doc-nav" aria-label="Jump to section">
            {navItems.map((item, i) =>
              item.kind === 'lessons-label' ? (
                <span key={`label-${i}`} className="doc-nav__label">
                  {item.text}
                </span>
              ) : item.kind === 'lesson' ? (
                <a
                  key={item.href}
                  className="doc-nav__lesson"
                  href={item.href}
                  title={item.tooltip}
                  aria-label={item.tooltip}
                >
                  {item.text}
                </a>
              ) : (
                <a key={item.href} href={item.href}>
                  {item.text}
                </a>
              ),
            )}
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
