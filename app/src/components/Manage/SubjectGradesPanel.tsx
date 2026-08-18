'use client'

/**
 * Manage → Subject grades (design PR 3). A SubjectGrade is subject + integer grade — the unit that
 * roles and lesson plans attach to (SPEC §8). `displayName` is derived and stays read-only here
 * because it is derived on the server: `beforeChange` rebuilds it, and renaming a Subject rewrites
 * every one of its grades' titles through `refreshSubjectGradeTitles`.
 */
import React, { useMemo, useState } from 'react'
import { Button } from '@payloadcms/ui'

import type { AssignmentCounts } from '../../lib/assignmentCounts'
import { useTaxonomyActions } from './taxonomyActions'
import type { SubjectRow } from './SubjectsPanel'

export interface SubjectGradeRow {
  id: number
  displayName: string
  subjectId: number
  grade: number
  /** Who would lose a grant if this row were deleted — see `deleteConsequences` below. */
  assignments: AssignmentCounts
}

/**
 * ⚑ THE SENTENCE THIS PANEL EXISTS TO SAY. `guardSubjectGradeDelete` refuses a delete that would
 * orphan lesson plans or versions, but role assignments do NOT block it — they are CASCADED, stripped
 * from every holder without a word. That behaviour is deliberate and predates this panel; what this
 * panel changes is that the cascade now sits behind a convenient button, which is precisely the
 * situation the design doc's §2.8 flags ("these gaps matter more once a convenient delete button
 * exists").
 *
 * So the confirmation names it. An administrator may still choose to delete — that is their call —
 * but revoking three teachers' editing access should not be something they discover afterwards.
 */
export function deleteConsequences({ displayName, assignments }: SubjectGradeRow): string {
  const losses = [
    assignments.editors > 0 &&
      `${assignments.editors} ${assignments.editors === 1 ? 'person loses' : 'people lose'} editing access`,
    assignments.subjectAdmins > 0 &&
      `${assignments.subjectAdmins} Subject ${assignments.subjectAdmins === 1 ? 'Administrator is' : 'Administrators are'} demoted`,
  ].filter((line): line is string => line !== false)

  return losses.length === 0
    ? `Delete ${displayName}? This cannot be undone.`
    : `Delete ${displayName}? ${losses.join(' and ')}. This cannot be undone.`
}

function SubjectGradeItem({
  row,
  subjects,
  actions,
}: {
  row: SubjectGradeRow
  subjects: SubjectRow[]
  actions: ReturnType<typeof useTaxonomyActions>
}) {
  const [grade, setGrade] = useState(String(row.grade))
  const [subjectId, setSubjectId] = useState(String(row.subjectId))
  const [observed, setObserved] = useState(row.displayName)
  const disabled = actions.busy !== null

  if (observed !== row.displayName) {
    setObserved(row.displayName)
    setGrade(String(row.grade))
    setSubjectId(String(row.subjectId))
  }

  const changed = Number(grade) !== row.grade || Number(subjectId) !== row.subjectId

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const nextGrade = Number(grade)
    if (!Number.isInteger(nextGrade) || nextGrade < 1 || !changed) return
    // The friendly duplicate refusal ("Grade N already exists for that subject.") comes from the
    // collection's `beforeValidate` and reaches the panel through `wireErrorMessage` — this is one of
    // the two messages PR 3 exists to surface.
    void actions.rename(row.id, { subject: Number(subjectId), grade: nextGrade }, 'Saved.')
  }

  return (
    <li className="lp-manage__row lp-manage__row--tight">
      {/* The DERIVED title, rendered because it is the name the rest of the product uses for this
          row — the catalogue, the candidate list and every scope line all say "Biology — Grade 10".
          A row showing only its two editable parts makes the reader assemble that themselves. */}
      <span className="lp-taxonomy__title">{row.displayName}</span>
      <form className="lp-taxonomy__form" onSubmit={save}>
        <label className="lp-taxonomy__field">
          <span className="lp-taxonomy__label">Subject</span>
          <select
            className="lp-manage__select"
            value={subjectId}
            disabled={disabled}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lp-taxonomy__field lp-taxonomy__field--narrow">
          <span className="lp-taxonomy__label">Grade</span>
          <input
            className="lp-users__input"
            type="number"
            min={1}
            step={1}
            value={grade}
            disabled={disabled}
            onChange={(event) => setGrade(event.target.value)}
          />
        </label>
        <Button
          className="lp-btn lp-btn--compact"
          buttonStyle="primary"
          size="small"
          type="submit"
          disabled={disabled || !changed}
        >
          Save
        </Button>
      </form>
      <Button
        className="lp-btn lp-btn--compact"
        buttonStyle="error"
        size="small"
        disabled={disabled}
        aria-label={`Delete ${row.displayName}`}
        onClick={() => {
          if (!window.confirm(deleteConsequences(row))) return
          void actions.remove(row.id, `Deleted ${row.displayName}.`)
        }}
      >
        Delete
      </Button>
    </li>
  )
}

export function SubjectGradesPanel({
  rows,
  subjects,
}: {
  rows: SubjectGradeRow[]
  subjects: SubjectRow[]
}) {
  const actions = useTaxonomyActions('subject-grades')
  const [query, setQuery] = useState('')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [newGrade, setNewGrade] = useState('')

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? rows.filter((r) => r.displayName.toLowerCase().includes(needle)) : rows
  }, [query, rows])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    const grade = Number(newGrade)
    if (!newSubjectId || !Number.isInteger(grade) || grade < 1) return
    if (await actions.create({ subject: Number(newSubjectId), grade }, 'Added subject grade.')) {
      setNewGrade('')
    }
  }

  // A subject grade cannot exist without a subject, so say that rather than rendering a create form
  // whose only dropdown is empty.
  if (subjects.length === 0) {
    return <p className="lp-manage__empty">Add a subject first — a subject grade belongs to one.</p>
  }

  return (
    <div className="lp-taxonomy">
      <form className="lp-taxonomy__create" onSubmit={add}>
        <label className="lp-taxonomy__field">
          <span className="lp-taxonomy__label">Subject</span>
          <select
            className="lp-manage__select"
            value={newSubjectId}
            disabled={actions.busy !== null}
            onChange={(event) => setNewSubjectId(event.target.value)}
          >
            <option value="">Choose a subject…</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lp-taxonomy__field lp-taxonomy__field--narrow">
          <span className="lp-taxonomy__label">Grade</span>
          <input
            className="lp-users__input"
            type="number"
            min={1}
            step={1}
            placeholder="10"
            value={newGrade}
            disabled={actions.busy !== null}
            onChange={(event) => setNewGrade(event.target.value)}
          />
        </label>
        <Button
          className="lp-btn"
          buttonStyle="primary"
          size="small"
          type="submit"
          disabled={actions.busy !== null || !newSubjectId || newGrade.trim() === ''}
        >
          {actions.busy === 'Create' ? 'Adding…' : 'Add subject grade'}
        </Button>
      </form>

      {rows.length > 0 && (
        <input
          className="lp-admin-list__search"
          type="search"
          aria-label="Search subject grades"
          placeholder="Search subject grades…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      {actions.error && (
        <p className="lp-users__error" role="alert">
          {actions.error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="lp-manage__empty">No subject grades yet.</p>
      ) : shown.length === 0 ? (
        <p className="lp-manage__empty">No subject grades match this search.</p>
      ) : (
        <ul className="lp-manage__list">
          {shown.map((row) => (
            <SubjectGradeItem key={row.id} row={row} subjects={subjects} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  )
}
