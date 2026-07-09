import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'
import { relId } from '@/lib/relId'
import FavoriteToggle from '@/components/FavoriteToggle'
import DocStrip from '@/components/DocStrip'
import { versionDeliverables } from '@/generator/adapter'
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
  searchParams: Promise<{ q?: string; subject?: string; grade?: string }>
}) {
  const { payload, user } = await requireUser()
  const params = await searchParams
  const q = (params.q ?? '').trim()
  const subject = (params.subject ?? '').trim()
  const grade = (params.grade ?? '').trim()

  // 1. Access-gated plans (every authenticated user reads all plans). We only need each plan's id +
  //    its Official version pointer; the listable content lives on that version.
  //    `pagination: false` returns the WHOLE corpus, not a silently-truncated first page — this is a
  //    grouped curriculum catalogue (subject-grade → strand → sub-strand), so paginating would fragment
  //    strands across pages; completeness + search is the right discoverability model here. The
  //    projection is light (ids + small meta), so all-of-hundreds is cheap; revisit (lazy-load /
  //    virtualize) only if the corpus reaches thousands. (Backlog #8.)
  // The favorites fetch (§10, per-version) is the caller's own handful of rows (own-rows-only by
  // access, no filter needed) and independent of the plans fetch — one parallel round-trip. Rows
  // key their star to the plan's OFFICIAL version (the version the row opens), so a favorite on a
  // non-Official version (saved from the lesson page) simply never matches a row's lookup here —
  // deliberately not surfaced yet; the versions-panel redesign PR ② adds the any-version indicator.
  const [{ docs: plans }, { docs: favorites }] = await Promise.all([
    payload.find({
      collection: 'lesson-plans',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { officialVersion: true },
    }),
    payload.find({
      collection: 'favorites',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { version: true },
    }),
  ])
  const officialIds = plans.map((p) => relId(p.officialVersion)).filter((id): id is number => id != null)

  // version id → the caller's favorite row id (drives the star's filled state + DELETE target).
  const favByVersion = new Map<number, number>()
  for (const f of favorites) {
    const versionId = relId(f.version)
    if (versionId != null) favByVersion.set(versionId, f.id)
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
          // The two OPTIONAL deliverable groups — only to decide the row's document strip (T2)
          // via `versionDeliverables`. Revisit if the corpus reaches the documented ~1–2k range.
          finalExplanation: true,
          summaryTable: true,
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
        versionId: v.id, // …and the star toggles a favorite on that Official version (§10)
        subjectName: subject?.name ?? 'Unknown subject',
        grade: sg?.grade ?? null,
        substrandId: v.meta?.substrand_id ?? '',
        // Clean structured name, else de-shout the stored `title` ("BIOLOGY GRADE 10: …"). Shared rule.
        substrandName: lessonDisplayName(v.meta?.substrand_name, v.title),
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
        deliverables: versionDeliverables(v),
      },
    ]
  })

  // T2 filter chips: URL-driven (?subject=&grade=), combinable with search. Options derive from
  // the data — grades are 10/11/12 today, but nothing here hardcodes that.
  const subjects = [...new Set(rows.map((r) => r.subjectName))].sort((a, b) => a.localeCompare(b))
  const grades = [...new Set(rows.flatMap((r) => (r.grade != null ? [r.grade] : [])))].sort(
    (a, b) => a - b,
  )
  const gradeNum = grade ? Number(grade) : null
  const filtered = rows.filter(
    (r) => (!subject || r.subjectName === subject) && (gradeNum == null || r.grade === gradeNum),
  )

  return (
    <section className="lp">
      <h1 className="lp-title">Lesson plans</h1>

      <SearchBox initialQuery={q} />
      <FilterBar subjects={subjects} grades={grades} subject={subject} grade={grade} q={q} />

      {filtered.length === 0 ? (
        <p className="muted">
          {rows.length === 0 ? 'No lesson plans yet.' : 'No lesson plans match these filters.'}
        </p>
      ) : q ? (
        <SearchResults
          rows={orderLessons(filtered.filter((r) => matchesQuery(r, q)))}
          query={q}
          favByVersion={favByVersion}
        />
      ) : (
        <>
          <FavoritesSection
            rows={orderLessons(
              filtered.filter((r) => r.versionId != null && favByVersion.has(r.versionId)),
            )}
            favByVersion={favByVersion}
          />
          <Catalogue groups={groupLessons(filtered)} favByVersion={favByVersion} />
        </>
      )}
    </section>
  )
}

/**
 * URL-driven filter chips (T2): subject and grade, combinable with each other and with search.
 * Server-rendered links — shareable URLs, no client state. A group renders only when the data
 * offers a real choice.
 */
function FilterBar({
  subjects,
  grades,
  subject,
  grade,
  q,
}: {
  subjects: string[]
  grades: number[]
  subject: string
  grade: string
  q: string
}) {
  if (subjects.length < 2 && grades.length < 2) return null

  const href = (s: string | null, g: string | null): string => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (s) p.set('subject', s)
    if (g) p.set('grade', g)
    const qs = p.toString()
    return qs ? `/?${qs}` : '/'
  }
  const chip = (key: string, label: string, target: string, active: boolean) => (
    <Link
      key={key}
      href={target}
      className={`filter-chip${active ? ' is-active' : ''}`}
      aria-current={active ? 'true' : undefined}
    >
      {label}
    </Link>
  )

  return (
    <div className="filter-bar">
      {subjects.length > 1 && (
        <div className="filter-group" role="group" aria-label="Filter by subject">
          {chip('all-subjects', 'All subjects', href(null, grade || null), !subject)}
          {subjects.map((s) => chip(`s-${s}`, s, href(s, grade || null), subject === s))}
        </div>
      )}
      {grades.length > 1 && (
        <div className="filter-group" role="group" aria-label="Filter by grade">
          {chip('all-grades', 'All grades', href(subject || null, null), !grade)}
          {grades.map((g) =>
            chip(`g-${g}`, `Grade ${g}`, href(subject || null, String(g)), grade === String(g)),
          )}
        </div>
      )}
    </div>
  )
}

/** version id → the caller's favorite row id (sparse: only favorited versions appear). */
type FavByVersion = Map<number, number>

/** The caller's favorited lessons, pinned above the catalogue (§10). Hidden while empty — the star
 *  on each row is the affordance, an empty shell would just be clutter (§13 minimal UI). */
function FavoritesSection({ rows, favByVersion }: { rows: LessonRow[]; favByVersion: FavByVersion }) {
  if (rows.length === 0) return null
  return (
    <div className="sg-section fav-section">
      <h2 className="sg-head">My favorites</h2>
      <ul className="substrand-list">
        {rows.map((r) => (
          <SubstrandRow key={r.id} row={r} favByVersion={favByVersion} showContext />
        ))}
      </ul>
    </div>
  )
}

/** Full catalogue: subject-grade → strand → numbered sub-strands, in curriculum order. */
function Catalogue({ groups, favByVersion }: { groups: SubjectGradeGroup[]; favByVersion: FavByVersion }) {
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
                  <SubstrandRow key={r.id} row={r} favByVersion={favByVersion} />
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
  favByVersion,
}: {
  rows: LessonRow[]
  query: string
  favByVersion: FavByVersion
}) {
  if (rows.length === 0) {
    return <p className="muted">No lesson plans match “{query}”.</p>
  }
  return (
    <ul className="substrand-list">
      {rows.map((r) => (
        <SubstrandRow key={r.id} row={r} favByVersion={favByVersion} showContext />
      ))}
    </ul>
  )
}

function SubstrandRow({
  row,
  favByVersion,
  showContext = false,
}: {
  row: LessonRow
  favByVersion: FavByVersion
  showContext?: boolean
}) {
  const context = [row.subjectName, row.grade != null ? `Grade ${row.grade}` : null, row.strandName]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="substrand-row">
      <div className="substrand-main">
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
        {row.versionId != null && (
          <FavoriteToggle versionId={row.versionId} favoriteId={favByVersion.get(row.versionId) ?? null} />
        )}
      </div>
      {/* The T2 document strip: the teacher's one-click PDF/Word per deliverable. */}
      {row.versionId != null && row.deliverables && (
        <DocStrip versionId={row.versionId} tags={row.deliverables} />
      )}
    </li>
  )
}
