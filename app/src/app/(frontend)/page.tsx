import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'
import { relId } from '@/lib/relId'
import FavoriteToggle from '@/components/FavoriteToggle'
import SearchBox from './SearchBox'
import {
  groupLessons,
  lessonDisplayName,
  matchesQuery,
  orderLessons,
  type LessonRow,
  type SubjectGradeGroup,
} from '@/lib/substrand'

/**
 * Lesson Plans — the one browse page shared by all roles (SPEC §13). Strand-first: subject-grade
 * → strand → sub-strands, in curriculum order (by `meta.substrand_id`, numerically). Pure server
 * component. Official-version model: list each Lesson Plan via its Official version (the snapshot
 * carrying meta/unit/lessons); the row links to the plan, which opens its Official version.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { payload, user } = await requireUser()
  const q = ((await searchParams).q ?? '').trim()

  // 1. Access-gated plans (every authenticated user reads all plans). We only need each plan's id +
  //    its Official version pointer; the listable content lives on that version.
  //    `pagination: false` returns the WHOLE corpus, not a silently-truncated first page — this is a
  //    grouped curriculum catalogue (subject-grade → strand → sub-strand), so paginating would fragment
  //    strands across pages; completeness + search is the right discoverability model here. The
  //    projection is light (ids + small meta), so all-of-hundreds is cheap; revisit (lazy-load /
  //    virtualize) only if the corpus reaches thousands. (Backlog #8.)
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
    select: { officialVersion: true },
  })
  const officialIds = plans.map((p) => relId(p.officialVersion)).filter((id): id is number => id != null)

  // The caller's favorites (§10) — own-rows-only by access, so no user filter needed here. Maps
  // plan id → favorite row id: the row id drives the star's DELETE, presence drives the section.
  const { docs: favorites } = await payload.find({
    collection: 'favorites',
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
    select: { lessonPlan: true },
  })
  // Keyed by LessonRow['id'] (number | string — the DB-free substrand lib keeps ids generic).
  const favByPlan = new Map<LessonRow['id'], number>()
  for (const f of favorites) {
    const planId = relId(f.lessonPlan)
    if (planId != null) favByPlan.set(planId, f.id)
  }

  // 2. Load those Official versions with a light projection — the version carries meta/unit/lessons.
  //    `lessons: { id: true }` yields the count via length without loading lesson bodies; depth 2
  //    resolves the subject name. `lessonPlan` maps each version back to its plan (the row link).
  const { docs: versions } = officialIds.length
    ? await payload.find({
        collection: 'lesson-bundle-versions',
        where: { id: { in: officialIds } },
        overrideAccess: false,
        user,
        depth: 2,
        pagination: false,
        select: {
          title: true,
          subjectGrade: true,
          lessonPlan: true,
          meta: { substrand_id: true, substrand_name: true },
          unit: { strand: true },
          lessons: { id: true },
        },
      })
    : { docs: [] }

  const rows: LessonRow[] = versions.flatMap((v) => {
    const planId = relId(v.lessonPlan)
    if (planId == null) return []
    const sg = typeof v.subjectGrade === 'object' ? v.subjectGrade : null
    const subject = sg && typeof sg.subject === 'object' ? sg.subject : null
    return [
      {
        id: planId, // the row links to the plan; the detail page opens its Official version
        subjectName: subject?.name ?? 'Unknown subject',
        grade: sg?.grade ?? null,
        substrandId: v.meta?.substrand_id ?? '',
        // Clean structured name, else de-shout the stored `title` ("BIOLOGY GRADE 10: …"). Shared rule.
        substrandName: lessonDisplayName(v.meta?.substrand_name, v.title),
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
      },
    ]
  })

  return (
    <section className="lp">
      <h1 className="lp-title">Lesson plans</h1>

      <SearchBox initialQuery={q} />

      {rows.length === 0 ? (
        <p className="muted">No lesson plans yet.</p>
      ) : q ? (
        <SearchResults
          rows={orderLessons(rows.filter((r) => matchesQuery(r, q)))}
          query={q}
          favByPlan={favByPlan}
        />
      ) : (
        <>
          <FavoritesSection
            rows={orderLessons(rows.filter((r) => favByPlan.has(r.id)))}
            favByPlan={favByPlan}
          />
          <Catalogue groups={groupLessons(rows)} favByPlan={favByPlan} />
        </>
      )}
    </section>
  )
}

/** The caller's favorited lessons, pinned above the catalogue (§10). Hidden while empty — the star
 *  on each row is the affordance, an empty shell would just be clutter (§13 minimal UI). */
function FavoritesSection({ rows, favByPlan }: { rows: LessonRow[]; favByPlan: Map<LessonRow['id'], number> }) {
  if (rows.length === 0) return null
  return (
    <div className="sg-section fav-section">
      <h2 className="sg-head">My favorites</h2>
      <ul className="substrand-list">
        {rows.map((r) => (
          <SubstrandRow key={r.id} row={r} favByPlan={favByPlan} showContext />
        ))}
      </ul>
    </div>
  )
}

/** Full catalogue: subject-grade → strand → numbered sub-strands, in curriculum order. */
function Catalogue({ groups, favByPlan }: { groups: SubjectGradeGroup[]; favByPlan: Map<LessonRow['id'], number> }) {
  return (
    <>
      {groups.map((sg) => (
        <div key={sg.key} className="sg-section">
          <h2 className="sg-head">{sg.label}</h2>
          {sg.strands.map((st) => (
            <div key={st.key} className="strand-section">
              <h3 className="strand-head">{st.label}</h3>
              <ul className="substrand-list">
                {st.rows.map((r) => (
                  <SubstrandRow key={r.id} row={r} favByPlan={favByPlan} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** Search view: a flat list of matches (grouping only makes sense for the full catalogue). */
function SearchResults({
  rows,
  query,
  favByPlan,
}: {
  rows: LessonRow[]
  query: string
  favByPlan: Map<LessonRow['id'], number>
}) {
  if (rows.length === 0) {
    return <p className="muted">No lesson plans match “{query}”.</p>
  }
  return (
    <ul className="substrand-list">
      {rows.map((r) => (
        <SubstrandRow key={r.id} row={r} favByPlan={favByPlan} showContext />
      ))}
    </ul>
  )
}

function SubstrandRow({
  row,
  favByPlan,
  showContext = false,
}: {
  row: LessonRow
  favByPlan: Map<LessonRow['id'], number>
  showContext?: boolean
}) {
  const context = [row.subjectName, row.grade != null ? `Grade ${row.grade}` : null, row.strandName]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="substrand-row">
      <Link href={`/lessons/${row.id}`} className="substrand-link">
        {row.substrandId && <span className="substrand-num">{row.substrandId}</span>}
        <span className="substrand-name">
          {row.substrandName}
          {showContext && context && <span className="substrand-context">{context}</span>}
        </span>
      </Link>
      <span className="substrand-count">
        {row.status === 'draft' && <span className="status-pill">Draft</span>}
        {row.lessonCount} lesson{row.lessonCount === 1 ? '' : 's'}
      </span>
      <FavoriteToggle planId={row.id} favoriteId={favByPlan.get(row.id) ?? null} />
    </li>
  )
}
