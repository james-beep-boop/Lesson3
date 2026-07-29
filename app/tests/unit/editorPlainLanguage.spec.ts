import { describe, expect, it } from 'vitest'

import { LessonBundleVersions } from '../../src/collections/LessonBundleVersions'
import { LessonPlans } from '../../src/collections/LessonPlans'
import { Subject } from '../../src/collections/Subject'
import { SubjectGrade } from '../../src/collections/SubjectGrade'
import { Users } from '../../src/collections/Users'
import { lessonContentFields } from '../../src/fields/lessonContent'

type LooseField = {
  name?: string
  label?: unknown
  admin?: Record<string, unknown>
  fields?: LooseField[]
}

const byName = (fields: LooseField[], name: string): LooseField => {
  const field = fields.find((candidate) => candidate.name === name)
  if (!field) throw new Error(`Missing field: ${name}`)
  return field
}

describe('the version editor uses teacher-facing language', () => {
  const fields = lessonContentFields as LooseField[]
  const collectionFields = LessonBundleVersions.fields as LooseField[]

  it('keeps schema names while replacing technical display labels', () => {
    expect(byName(fields, 'meta').label).toBe('Document settings')
    expect(byName(fields, 'unit').label).toBe('Sub-strand overview')
    expect(byName(fields, 'lessons').label).toBe('Lessons')
    expect(byName(byName(fields, 'lessons').fields ?? [], 'slo').label).toBe(
      'Specific learning outcomes',
    )
    expect(byName(fields, 'finalExplanation').label).toBe('Final explanation')
    expect(byName(fields, 'summaryTable').label).toBe('Summary table')
  })

  it('removes internal explanations and hides system numbering', () => {
    const lessons = byName(fields, 'lessons')
    const lessonFields = lessons.fields ?? []
    const summaryRows = byName(byName(fields, 'summaryTable').fields ?? [], 'lessons')

    expect(lessons.admin?.description).toBeUndefined()
    expect(byName(lessonFields, 'number').admin?.hidden).toBe(true)
    expect(byName(summaryRows.fields ?? [], 'number').admin?.hidden).toBe(true)
    expect(byName(lessonFields, 'title').admin?.description).toBeUndefined()
  })

  it('uses task labels for version identity and the approved Save explanation', () => {
    expect(LessonBundleVersions.admin?.description).toBe(
      'Save button writes your edits as a new version — existing versions are never changed.',
    )
    expect(byName(collectionFields, 'title').label).toBe('Document title')
    expect(byName(collectionFields, 'title').admin?.description).toBeUndefined()
    expect(byName(collectionFields, 'sourceVersion').label).toBe('Based on version')
    expect(byName(collectionFields, 'author').label).toBe('Saved by')
  })

  it('keeps people and curriculum help in plain language too', () => {
    const users = Users.fields as LooseField[]
    const subjects = Subject.fields as LooseField[]
    const subjectGrades = SubjectGrade.fields as LooseField[]
    const plans = LessonPlans.fields as LooseField[]

    expect(byName(users, 'roles').admin?.description).toBe(
      'Gives this person full access to the system.',
    )
    expect(byName(users, 'assignments').admin?.description).toBe(
      'Assign Editor or Subject Administrator access for each subject and grade.',
    )
    expect(byName(subjects, 'name').admin?.description).toBe(
      'For example, Biology or Chemistry.',
    )
    expect(byName(subjectGrades, 'grade').admin?.description).toBe(
      'Enter a whole number, such as 10.',
    )
    expect(byName(plans, 'officialVersion').admin?.description).toBe(
      'The approved version shown first to teachers.',
    )
  })
})
