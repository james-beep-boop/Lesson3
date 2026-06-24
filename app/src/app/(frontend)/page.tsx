import React from 'react'
import Link from 'next/link'

import { canUseAdminPanel } from '@/access'
import { requireUser } from '@/lib/session'
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
 * component: one access-gated `payload.find` + in-JS grouping/search, no client state.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { payload, user } = await requireUser()
  const q = ((await searchParams).q ?? '').trim()
  const includeDrafts = canUseAdminPanel(user)

  // Access-gated (Teacher → published only; Editors/Subject Admins also their in-scope drafts).
  // Light projection: only what the list renders/orders/searches — `lessons: { id: true }` yields
  // the count via length WITHOUT loading the (large) lesson bodies. depth 2 resolves subject name.
  const { docs } = await payload.find({
    collection: 'lesson-bundles',
    draft: includeDrafts,
    overrideAccess: false,
    user,
    depth: 2,
    limit: 200,
    select: {
      title: true,
      subjectGrade: true,
      meta: { substrand_id: true, substrand_name: true },
      unit: { strand: true },
      lessons: { id: true },
      _status: true,
    },
  })

  const rows: LessonRow[] = docs.map((b) => {
    const sg = typeof b.subjectGrade === 'object' ? b.subjectGrade : null
    const subject = sg && typeof sg.subject === 'object' ? sg.subject : null
    return {
      id: b.id,
      subjectName: subject?.name ?? 'Unknown subject',
      grade: sg?.grade ?? null,
      substrandId: b.meta?.substrand_id ?? '',
      // Prefer the clean structured name over the shouty stored `title` (e.g. "BIOLOGY GRADE 10: …").
      substrandName: b.meta?.substrand_name || b.title || 'Untitled',
      strandName: b.unit?.strand ?? null,
      lessonCount: Array.isArray(b.lessons) ? b.lessons.length : 0,
      status: b._status === 'draft' ? 'draft' : 'published',
    }
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
        <p className="muted">No published lesson plans yet.</p>
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
