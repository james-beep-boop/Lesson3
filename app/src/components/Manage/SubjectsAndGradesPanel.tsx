'use client'

/**
 * Manage → Subjects and grades — a checkbox matrix that replaces the two-panel design (Subjects +
 * Subject grades). Rows are subjects; columns are grade numbers. A checked cell means a SubjectGrade
 * record exists. Checking creates one; unchecking deletes with a confirmation that names the cascade
 * (role assignments — see `deleteConsequences`). Lesson-plan guards are server-side: the server
 * refuses a delete that would orphan plans, and the refusal reaches the panel through the shared
 * error state below.
 *
 * Grade columns come from two sources:
 *   - Server: grade numbers present in the existing `grades` prop (i.e. actual SubjectGrade records).
 *   - Pending: grade numbers added locally via the "+ Grade" form but not yet represented by any
 *     SubjectGrade. Pending grades clear on page refresh; they persist while the panel is mounted so
 *     the user can check boxes immediately after adding the column.
 */
import React, { useMemo, useState } from 'react'
import { Button } from '@payloadcms/ui'

import { deleteConsequences, type AssignmentCounts } from '../../lib/assignmentCounts'
import { useTaxonomyActions, type TaxonomyActions } from './taxonomyActions'

export type { AssignmentCounts }

export interface SubjectRow {
  id: number
  name: string
  /** How many SubjectGrades belong to this subject — unused in the matrix display but kept so
   *  AdminDashboard's construction is unchanged. `guardSubjectDelete` refuses the delete when > 0
   *  and the server's 409 message names the count, so no client-side guard is needed. */
  subjectGradeCount: number
}

export interface SubjectGradeRow {
  id: number
  displayName: string
  subjectId: number
  grade: number
  assignments: AssignmentCounts
}

function SubjectEntry({
  subject,
  gradePool,
  sgMap,
  subjectActions,
  gradeActions,
  anyBusy,
}: {
  subject: SubjectRow
  gradePool: number[]
  sgMap: Map<string, SubjectGradeRow>
  subjectActions: TaxonomyActions
  gradeActions: TaxonomyActions
  anyBusy: boolean
}) {
  const [name, setName] = useState(subject.name)
  const [observed, setObserved] = useState(subject.name)

  if (observed !== subject.name) {
    setObserved(subject.name)
    setName(subject.name)
  }

  const canSave = !anyBusy && name.trim() !== '' && name.trim() !== subject.name

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    void subjectActions.rename(subject.id, { name: name.trim() }, `Renamed to ${name.trim()}.`)
  }

  const remove = () => {
    if (!window.confirm(`Delete ${subject.name}? This cannot be undone.`)) return
    void subjectActions.remove(subject.id, `Deleted ${subject.name}.`)
  }

  const toggleGrade = (grade: number) => {
    const existing = sgMap.get(`${subject.id}:${grade}`)
    if (existing) {
      if (!window.confirm(deleteConsequences(existing))) return
      void gradeActions.remove(existing.id, `Deleted ${existing.displayName}.`)
    } else {
      void gradeActions.create(
        { subject: subject.id, grade },
        `Added ${subject.name} Grade ${grade}.`,
      )
    }
  }

  return (
    <tr className="lp-sg__row">
      <td className="lp-sg__subject-td">
        <form className="lp-sg__rename" onSubmit={save}>
          <input
            className="lp-users__input lp-sg__name-input"
            value={name}
            disabled={anyBusy}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="lp-btn lp-btn--compact"
            buttonStyle="primary"
            size="small"
            type="submit"
            disabled={!canSave}
          >
            Save
          </Button>
        </form>
      </td>
      {gradePool.map((grade) => (
        <td key={grade} className="lp-sg__check-td">
          <input
            type="checkbox"
            checked={sgMap.has(`${subject.id}:${grade}`)}
            disabled={anyBusy}
            aria-label={`${subject.name} Grade ${grade}`}
            onChange={() => toggleGrade(grade)}
          />
        </td>
      ))}
      {/* Empty cell under the "+ Grade" column header — keeps the grid intact. */}
      <td className="lp-sg__add-grade-td" />
      <td className="lp-sg__actions-td">
        <Button
          className="lp-btn lp-btn--compact"
          buttonStyle="error"
          size="small"
          type="button"
          disabled={anyBusy}
          aria-label={`Delete ${subject.name}`}
          onClick={remove}
        >
          Delete
        </Button>
      </td>
    </tr>
  )
}

export function SubjectsAndGradesPanel({
  subjects,
  grades,
}: {
  subjects: SubjectRow[]
  grades: SubjectGradeRow[]
}) {
  const subjectActions = useTaxonomyActions('subjects')
  const gradeActions = useTaxonomyActions('subject-grades')

  const [newSubjectName, setNewSubjectName] = useState('')
  const [newGradeStr, setNewGradeStr] = useState('')
  const [pendingGrades, setPendingGrades] = useState<number[]>([])

  const anyBusy = subjectActions.busy !== null || gradeActions.busy !== null

  const gradePool = useMemo(() => {
    const seen = new Set<number>(grades.map((g) => g.grade))
    for (const g of pendingGrades) seen.add(g)
    return [...seen].sort((a, b) => a - b)
  }, [grades, pendingGrades])

  const sgMap = useMemo(() => {
    const m = new Map<string, SubjectGradeRow>()
    for (const g of grades) m.set(`${g.subjectId}:${g.grade}`, g)
    return m
  }, [grades])

  const newGradeValue = Number(newGradeStr)
  const canAddGrade =
    !anyBusy &&
    newGradeStr.trim() !== '' &&
    Number.isInteger(newGradeValue) &&
    newGradeValue >= 1 &&
    !gradePool.includes(newGradeValue)

  const addGrade = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAddGrade) return
    setPendingGrades((prev) => [...prev, newGradeValue])
    setNewGradeStr('')
  }

  const canAddSubject = !anyBusy && newSubjectName.trim() !== ''

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAddSubject) return
    const name = newSubjectName.trim()
    if (await subjectActions.create({ name }, `Added ${name}.`)) {
      setNewSubjectName('')
    }
  }

  return (
    <div className="lp-sg">
      {subjectActions.error && (
        <p className="lp-manage__error" role="alert">
          {subjectActions.error}
        </p>
      )}
      {gradeActions.error && (
        <p className="lp-manage__error" role="alert">
          {gradeActions.error}
        </p>
      )}

      {/* Horizontal scroll on narrow viewports so the matrix does not collapse. */}
      <div className="lp-sg__scroll">
        <table className="lp-sg__table">
          <thead>
            <tr>
              <th className="lp-sg__subject-th" scope="col">
                Subject
              </th>
              {gradePool.map((grade) => (
                <th key={grade} className="lp-sg__grade-th" scope="col">
                  Grade {grade}
                </th>
              ))}
              <th className="lp-sg__add-grade-th" scope="col">
                <form className="lp-sg__add-grade" onSubmit={addGrade}>
                  <input
                    className="lp-users__input lp-sg__grade-input"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Grade"
                    value={newGradeStr}
                    disabled={anyBusy}
                    onChange={(e) => setNewGradeStr(e.target.value)}
                  />
                  <Button
                    className="lp-btn lp-btn--compact"
                    buttonStyle="secondary"
                    size="small"
                    type="submit"
                    disabled={!canAddGrade}
                  >
                    + Grade
                  </Button>
                </form>
              </th>
              <th className="lp-sg__actions-th" scope="col" />
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <SubjectEntry
                key={subject.id}
                subject={subject}
                gradePool={gradePool}
                sgMap={sgMap}
                subjectActions={subjectActions}
                gradeActions={gradeActions}
                anyBusy={anyBusy}
              />
            ))}
          </tbody>
        </table>
      </div>

      {subjects.length === 0 && gradePool.length === 0 && (
        <p className="lp-manage__empty">No subjects or grades yet — add a subject to begin.</p>
      )}

      <form className="lp-sg__add-subject" aria-label="Add a subject" onSubmit={addSubject}>
        <label className="lp-taxonomy__field">
          <span>New subject</span>
          <input
            className="lp-users__input"
            placeholder="For example, Biology"
            value={newSubjectName}
            disabled={anyBusy}
            onChange={(e) => setNewSubjectName(e.target.value)}
          />
        </label>
        <Button
          className="lp-btn"
          buttonStyle="primary"
          size="small"
          type="submit"
          disabled={!canAddSubject}
        >
          {subjectActions.busy === 'create' ? 'Adding…' : 'Add subject'}
        </Button>
      </form>
    </div>
  )
}
