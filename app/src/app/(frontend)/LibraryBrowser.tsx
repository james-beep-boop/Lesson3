'use client'

/**
 * Client-side library browsing (perf fix 2026-07-09). The server page loads the WHOLE catalogue
 * once (it always did); this component owns search + subject/grade filtering IN MEMORY, so a filter
 * click or a keystroke re-renders instantly instead of re-running four Payload queries per
 * navigation (the old server-link filters cost ~1s per click on the Rock).
 *
 * `?q=&subject=&grade=&view=` round-trips (multiple grades are comma-separated) — written via
 * `history.replaceState` (no RSC re-fetch), read back on popstate (back/forward) and as the
 * initial SSR state (a shared filtered URL renders filtered on first paint).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import FavoriteToggle from '@/components/FavoriteToggle'
import DocButtons from '@/components/DocButtons'
import DocStrip from '@/components/DocStrip'
import VersionsChip from '@/components/VersionsChip'
import { PRIMARY_DELIVERABLE } from '@/generator/deliverables'
import {
  curriculumContextLabel,
  filterRows,
  gradeChoices,
  groupLessons,
  orderLessons,
  parseGradeParam,
  unavailableMessage,
  type LessonRow,
  type SubjectGradeGroup,
} from '@/lib/substrand'

/** version id → the caller's favorite row id (sparse: only favorited versions appear). */
type FavByVersion = Map<number, number>

/** Which list is showing: the whole catalogue, or the caller's favorites. In the URL as `view=`. */
type View = 'all' | 'favorites'

interface Criteria {
  q: string
  subject: string
  grade: string
  view: View
}

const viewOf = (raw: string | null | undefined): View => (raw === 'favorites' ? 'favorites' : 'all')

const criteriaFromLocation = (): Criteria => {
  const p = new URLSearchParams(window.location.search)
  return {
    q: p.get('q') ?? '',
    subject: p.get('subject') ?? '',
    grade: p.get('grade') ?? '',
    view: viewOf(p.get('view')),
  }
}

/** The newest unsaved work the caller can return to, resolved on the server (`listUnsavedWork`). */
export interface ResumeLink {
  label: string
  href: string
  /** False: the source moved on, so the editor offers copy-out only ("Open to copy"). */
  restorable: boolean
}

export default function LibraryBrowser({
  rows,
  pinnedRows,
  favPairs,
  initial,
  resume = null,
}: {
  rows: LessonRow[]
  /** "My favorites" pseudo-rows for PINNED non-Official favorites (PR ②). */
  pinnedRows: LessonRow[]
  /** [versionId, favoriteRowId] pairs (a Map doesn't serialize across the RSC boundary). */
  favPairs: [number, number][]
  initial: Omit<Criteria, 'view'> & { view?: string }
  resume?: ResumeLink | null
}) {
  const [criteria, setCriteria] = useState<Criteria>({ ...initial, view: viewOf(initial.view) })
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const favByVersion = useMemo<FavByVersion>(() => new Map(favPairs), [favPairs])

  // Filtering is synchronous on every change; only the URL write is debounced (it exists solely
  // so the current view is shareable/bookmarkable — nothing re-fetches from it). `replaceState`, so
  // neither a filter nor the All/My favorites switch adds a Back step.
  const apply = (next: Partial<Criteria>) => {
    const merged = { ...criteria, ...next }
    setCriteria(merged)
    clearTimeout(urlTimer.current)
    urlTimer.current = setTimeout(() => {
      const p = new URLSearchParams()
      if (merged.q.trim()) p.set('q', merged.q.trim())
      if (merged.subject) p.set('subject', merged.subject)
      if (merged.grade) p.set('grade', merged.grade)
      if (merged.view === 'favorites') p.set('view', 'favorites')
      const qs = p.toString()
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/')
    }, 250)
  }

  // Back/forward restores whatever state that history entry carried. A pending debounced URL
  // write must die with the navigation — firing after popstate would overwrite the restored URL
  // with the pre-navigation criteria, desyncing the address bar from the view.
  useEffect(() => {
    const onPop = () => {
      clearTimeout(urlTimer.current)
      setCriteria(criteriaFromLocation())
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      clearTimeout(urlTimer.current)
    }
  }, [])

  const q = criteria.q.trim()
  const view = criteria.view
  const subjects = useMemo(
    () => [...new Set(rows.map((r) => r.subjectName))].sort((a, b) => a.localeCompare(b)),
    [rows],
  )
  const subject = subjects.includes(criteria.subject) ? criteria.subject : ''
  // The offered grades plus whatever the corpus holds — the SAME list for the checkboxes and the URL
  // (lib/substrand.ts), so `?grade=12` with no Grade 12 plans stays selected instead of becoming All.
  const grades = useMemo(() => gradeChoices([...rows, ...pinnedRows]), [rows, pinnedRows])
  const selectedGrades = parseGradeParam(criteria.grade, grades)

  const filtered = filterRows(rows, { q, subject, grade: selectedGrades })
  const filteredPinned = filterRows(pinnedRows, { q, subject, grade: selectedGrades })
  const favoriteRows = orderLessons([
    ...filtered.filter((r) => r.versionId != null && favByVersion.has(r.versionId)),
    ...filteredPinned,
  ])
  const hasFavorites = favByVersion.size > 0
  // Search in the All view also finds pinned favorites — they passed the same filter, and leaving
  // them out once made a query matching ONLY a pinned favorite report no match.
  const shown =
    view === 'favorites'
      ? favoriteRows
      : q
        ? orderLessons([...filtered, ...filteredPinned])
        : filtered

  // Why the list is empty decides what to say (plan §4): a grade/subject with no plans at all is
  // "not available yet"; plans that exist but are excluded by search or favorites "don't match".
  const corpusEmpty =
    selectedGrades.length > 0 &&
    filterRows([...rows, ...pinnedRows], { subject, grade: selectedGrades }).length === 0
  let empty: React.ReactNode = null
  if (shown.length === 0) {
    if (rows.length === 0 && pinnedRows.length === 0)
      empty = <p className="muted">No lesson plans yet.</p>
    else if (corpusEmpty)
      empty = (
        <div className="lp-empty">
          <p className="muted">{unavailableMessage(selectedGrades, subject)}</p>
          <button
            type="button"
            className="btn btn--quiet btn--compact"
            onClick={() => apply({ grade: '' })}
          >
            Show all grades
          </button>
        </div>
      )
    else if (view === 'favorites' && !hasFavorites)
      empty = (
        <p className="muted">No favorites yet. Use the ☆ star on a lesson plan to keep it here.</p>
      )
    else if (q) empty = <p className="muted">No lesson plans match “{q}” with these filters.</p>
    else empty = <p className="muted">No lesson plans match these filters.</p>
  }

  return (
    <>
      <div className="lp-controls">
        <form
          className="lp-search"
          role="search"
          onSubmit={(e) => e.preventDefault() /* filtering is already live; don't GET-navigate */}
        >
          <input
            type="search"
            value={criteria.q}
            onChange={(e) => apply({ q: e.target.value })}
            placeholder="Search lesson plans"
            aria-label="Search lesson plans"
          />
          {/* Explicit clear (D4): type="search" only gives a native ✕ in WebKit/Blink. */}
          {criteria.q !== '' && (
            <button
              type="button"
              className="lp-search__clear"
              aria-label="Clear search"
              onClick={() => apply({ q: '' })}
            >
              ×
            </button>
          )}
        </form>

        <FilterBar
          subjects={subjects}
          grades={grades}
          subject={subject}
          selectedGrades={selectedGrades}
          onSubject={(subject) => apply({ subject })}
          onGrades={(selected) => apply({ grade: selected.join(',') })}
        />
      </div>

      {/* ONE row, only when there is unsaved work to return to (plan §4). Opening it changes nothing:
          the editor's own recovery prompt decides what happens next, and its phone guard still applies. */}
      {resume && (
        <p className="lp-resume">
          <span className="muted">Pick up where you left off:</span>{' '}
          <Link href={resume.href}>
            {resume.restorable ? 'Continue editing' : 'Open to copy'} {resume.label}
          </Link>
        </p>
      )}

      <div className="lp-views">
        <div className="lp-views__switch" role="group" aria-label="Show">
          <button
            type="button"
            className="lp-views__option"
            aria-pressed={view === 'all'}
            onClick={() => apply({ view: 'all' })}
          >
            All lesson plans
          </button>
          <button
            type="button"
            className="lp-views__option"
            aria-pressed={view === 'favorites'}
            onClick={() => apply({ view: 'favorites' })}
          >
            My favorites
          </button>
        </div>
        <span className="lp-views__count muted" aria-live="polite">
          {shown.length} {shown.length === 1 ? 'plan' : 'plans'}
        </span>
      </div>

      {empty ??
        (view === 'favorites' || q ? (
          <ul className="substrand-list">
            {shown.map((r) => (
              <SubstrandRow
                key={r.versionId ?? r.id}
                row={r}
                favByVersion={favByVersion}
                showContext
              />
            ))}
          </ul>
        ) : (
          // Keyed by the filters so a change remounts the groups OPEN: a strand someone folded earlier
          // must not hide what the new filter matched. Folding lasts for the visit only, never stored.
          <Catalogue
            key={`${subject}|${selectedGrades.join(',')}`}
            groups={groupLessons(filtered)}
            favByVersion={favByVersion}
          />
        ))}
    </>
  )
}

/** Compact controls with multiple grades and one subject; empty grades means All. */
function FilterBar({
  subjects,
  grades,
  subject,
  selectedGrades,
  onSubject,
  onGrades,
}: {
  subjects: string[]
  grades: number[]
  subject: string
  selectedGrades: number[]
  onSubject: (s: string) => void
  onGrades: (g: number[]) => void
}) {
  return (
    <div className="filter-bar">
      <label className="filter-group filter-group--subject">
        <span className="filter-label">Subject</span>
        <select value={subject} onChange={(e) => onSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="filter-group" role="group" aria-labelledby="filter-grades-label">
        <span className="filter-label" id="filter-grades-label">
          Grades
        </span>
        <div className="filter-grades">
          <label className="filter-grade">
            <input
              type="checkbox"
              checked={selectedGrades.length === 0}
              onChange={() => onGrades([])}
            />
            All
          </label>
          {grades.map((g) => (
            <label key={g} className="filter-grade">
              <input
                type="checkbox"
                checked={selectedGrades.includes(g)}
                onChange={() =>
                  onGrades(
                    selectedGrades.includes(g)
                      ? selectedGrades.filter((selected) => selected !== g)
                      : [...selectedGrades, g].sort((a, b) => a - b),
                  )
                }
              />
              {g}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Full catalogue: subject-grade → strand → numbered sub-strands, in curriculum order. Strand groups
 *  start OPEN (operator decision 2026-11-10) and can be folded for the visit. */
function Catalogue({
  groups,
  favByVersion,
}: {
  groups: SubjectGradeGroup<LessonRow>[]
  favByVersion: FavByVersion
}) {
  return (
    <>
      {groups.map((sg) => (
        <div key={sg.key} className="sg-section">
          {/* Text stays "Biology · Grade 10" (subjectGradeLabel); only the grade half is grey. */}
          <h2 className="sg-head">
            {sg.grade != null ? (
              <>
                {sg.subjectName}
                <span className="sg-head__grade"> · Grade {sg.grade}</span>
              </>
            ) : (
              sg.label
            )}
          </h2>
          {sg.strands.map((st) => (
            <details key={st.key} className="strand-section" open>
              <summary className="strand-head">{st.label}</summary>
              <ul className="substrand-list">
                {st.rows.map((r) => (
                  <SubstrandRow key={r.id} row={r} favByVersion={favByVersion} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      ))}
    </>
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
  // Shared with Manage's delete panel (lib/substrand.ts) so the two can't drift. Output here is
  // BYTE-IDENTICAL to the hand-composed version this replaced — including the raw "Strand 2.0:"
  // ordinal; see the ⚑ on the helper for why it is not cleaned.
  const context = curriculumContextLabel(row)
  return (
    <li className="substrand-row">
      <div className="substrand-main">
        <Link href={row.href ?? `/lessons/${row.id}`} className="substrand-link">
          {row.substrandId && <span className="substrand-num">{row.substrandId}</span>}
          <span className="substrand-name">
            {row.substrandName}
            {row.pinnedSemver && (
              <span className="pinned-tag"> · v{row.pinnedSemver} (pinned)</span>
            )}
            {showContext && context && <span className="substrand-context">{context}</span>}
          </span>
        </Link>
        <span className="substrand-count">
          {row.status === 'draft' && <span className="status-pill">Draft</span>}
          {row.lessonCount} lesson{row.lessonCount === 1 ? '' : 's'}
        </span>
        {/* PR ② (editing-access-and-above only): the versions chip, only when there is a real choice. Pinned rows
            skip it — their plan's main row carries it. The slot span is ALWAYS rendered for
            editor rows (D4): reserving the column keeps the star aligned whether or not a row
            has version history. */}
        {row.canEdit && !row.pinnedSemver && (
          <span className="substrand-versions">
            {(row.versionCount ?? 1) > 1 && row.versionId != null && (
              <VersionsChip
                planId={row.id}
                officialVersionId={row.versionId}
                versionCount={row.versionCount ?? 0}
                panelLabel={row.substrandName}
                compact
              />
            )}
          </span>
        )}
        {row.versionId != null && (
          <FavoriteToggle
            versionId={row.versionId}
            favoriteId={favByVersion.get(row.versionId) ?? null}
            labelOnMobile
          />
        )}
        {/* Row redesign (Option B, 2026-07-14): the primary Lesson plan's PDF/Word sit inline on
            the title line — one-click download next to the (now clearly-linked) name. */}
        {row.versionId != null && row.deliverables?.includes(PRIMARY_DELIVERABLE) && (
          <DocButtons versionId={row.versionId} tag={PRIMARY_DELIVERABLE} />
        )}
      </div>
      {/* Secondary documents (Final explanation / Summary table) fold behind a disclosure below;
          the primary Lesson plan buttons moved up to the title line (Option B). */}
      {row.versionId != null && row.deliverables && (
        <DocStrip versionId={row.versionId} tags={row.deliverables} condensed />
      )}
    </li>
  )
}
