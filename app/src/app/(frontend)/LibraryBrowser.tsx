'use client'

/**
 * Client-side library browsing (perf fix 2026-07-09). The server page loads the WHOLE catalogue
 * once (it always did); this component owns search + subject/grade filtering IN MEMORY, so a filter
 * click or a keystroke re-renders instantly instead of re-running four Payload queries per
 * navigation (the old server-link filters cost ~1s per click on the Rock).
 *
 * `?q=&subject=&grade=` round-trips (multiple grades are comma-separated) — written via
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
  groupLessons,
  orderLessons,
  type LessonRow,
  type SubjectGradeGroup,
} from '@/lib/substrand'

/** version id → the caller's favorite row id (sparse: only favorited versions appear). */
type FavByVersion = Map<number, number>

interface Criteria {
  q: string
  subject: string
  grade: string
}

const criteriaFromLocation = (): Criteria => {
  const p = new URLSearchParams(window.location.search)
  return { q: p.get('q') ?? '', subject: p.get('subject') ?? '', grade: p.get('grade') ?? '' }
}

export default function LibraryBrowser({
  rows,
  pinnedRows,
  favPairs,
  initial,
}: {
  rows: LessonRow[]
  /** "My favorites" pseudo-rows for PINNED non-Official favorites (PR ②). */
  pinnedRows: LessonRow[]
  /** [versionId, favoriteRowId] pairs (a Map doesn't serialize across the RSC boundary). */
  favPairs: [number, number][]
  initial: Criteria
}) {
  const [criteria, setCriteria] = useState<Criteria>(initial)
  const urlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const favByVersion = useMemo<FavByVersion>(() => new Map(favPairs), [favPairs])

  // Filtering is synchronous on every change; only the URL write is debounced (it exists solely
  // so the current view is shareable/bookmarkable — nothing re-fetches from it).
  const apply = (next: Partial<Criteria>) => {
    const merged = { ...criteria, ...next }
    setCriteria(merged)
    clearTimeout(urlTimer.current)
    urlTimer.current = setTimeout(() => {
      const p = new URLSearchParams()
      if (merged.q.trim()) p.set('q', merged.q.trim())
      if (merged.subject) p.set('subject', merged.subject)
      if (merged.grade) p.set('grade', merged.grade)
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
  const subjects = useMemo(
    () => [...new Set(rows.map((r) => r.subjectName))].sort((a, b) => a.localeCompare(b)),
    [rows],
  )
  const subject = subjects.includes(criteria.subject) ? criteria.subject : ''
  const grades = useMemo(
    () =>
      [...new Set(rows.flatMap((r) => (r.grade != null ? [r.grade] : [])))].sort((a, b) => a - b),
    [rows],
  )
  const selectedGrades = criteria.grade
    .split(',')
    .filter((g) => g.trim() !== '')
    .map(Number)
    .filter((g) => grades.includes(g))

  const filtered = filterRows(rows, { q, subject, grade: selectedGrades })
  const filteredPinned = filterRows(pinnedRows, {
    q,
    subject,
    grade: selectedGrades,
  })

  return (
    <>
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

      {filtered.length === 0 && filteredPinned.length === 0 ? (
        <p className="muted">
          {rows.length === 0 ? 'No lesson plans yet.' : 'No lesson plans match these filters.'}
        </p>
      ) : q ? (
        // Pinned favorites are searchable too — they passed the same filter, and omitting them
        // here contradicted the empty-check above (a query matching ONLY a pinned favorite
        // rendered "No lesson plans match").
        <SearchResults
          rows={orderLessons([...filtered, ...filteredPinned])}
          query={q}
          favByVersion={favByVersion}
        />
      ) : (
        <>
          <FavoritesSection
            rows={orderLessons([
              ...filtered.filter((r) => r.versionId != null && favByVersion.has(r.versionId)),
              ...filteredPinned,
            ])}
            favByVersion={favByVersion}
          />
          <Catalogue groups={groupLessons(filtered)} favByVersion={favByVersion} />
        </>
      )}
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
      <div className="filter-group" role="group" aria-label="Grades">
        <span>Grades:</span>
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
      <label className="filter-group">
        Subjects:
        <select value={subject} onChange={(e) => onSubject(e.target.value)}>
          <option value="">All</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** The caller's favorited lessons, pinned above the catalogue (§10). Hidden while empty. */
function FavoritesSection({
  rows,
  favByVersion,
}: {
  rows: LessonRow[]
  favByVersion: FavByVersion
}) {
  if (rows.length === 0) return null
  return (
    <div className="sg-section fav-section">
      <h2 className="sg-head">My favorites</h2>
      <ul className="substrand-list">
        {rows.map((r) => (
          <SubstrandRow key={r.versionId ?? r.id} row={r} favByVersion={favByVersion} showContext />
        ))}
      </ul>
    </div>
  )
}

/** Full catalogue: subject-grade → strand → numbered sub-strands, in curriculum order. */
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
        <SubstrandRow key={r.versionId ?? r.id} row={r} favByVersion={favByVersion} showContext />
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
