import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'
import { relId } from '@/lib/relId'
import {
  groupLessons,
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
        // Prefer the clean structured name over the shouty stored `title` (e.g. "BIOLOGY GRADE 10: …").
        substrandName: v.meta?.substrand_name || v.title || 'Untitled',
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
      },
    ]
  })

  return (
    <section className="lp">
      <h1 className="lp-title">Lesson plans</h1>

      <form className="lp-search" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search lesson plans"
          aria-label="Search lesson plans"
        />
      </form>

      {rows.length === 0 ? (
        <p className="muted">No lesson plans yet.</p>
      ) : q ? (
        <SearchResults rows={orderLessons(rows.filter((r) => matchesQuery(r, q)))} query={q} />
      ) : (
        <Catalogue groups={groupLessons(rows)} />
      )}
    </section>
  )
}

/** Full catalogue: subject-grade → strand → numbered sub-strands, in curriculum order. */
function Catalogue({ groups }: { groups: SubjectGradeGroup[] }) {
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
                  <SubstrandRow key={r.id} row={r} />
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
function SearchResults({ rows, query }: { rows: LessonRow[]; query: string }) {
  if (rows.length === 0) {
    return <p className="muted">No lesson plans match “{query}”.</p>
  }
  return (
    <ul className="substrand-list">
      {rows.map((r) => (
        <SubstrandRow key={r.id} row={r} showContext />
      ))}
    </ul>
  )
}

function SubstrandRow({ row, showContext = false }: { row: LessonRow; showContext?: boolean }) {
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
    </li>
  )
}
