import { describe, expect, it } from 'vitest'

import { LessonBundleVersions } from '../../src/collections/LessonBundleVersions'
import { LessonPlans } from '../../src/collections/LessonPlans'
import {
  lessonEditableContentFields,
  lessonPlanDetailFields,
  structureCondition,
} from '../../src/fields/lessonContent'

type LooseField = {
  name?: string
  type?: string
  label?: unknown
  fields?: LooseField[]
  admin?: Record<string, unknown>
}

describe('the version editor starts at lesson content', () => {
  const collectionFields = LessonBundleVersions.fields as LooseField[]
  const panel = collectionFields.find((field) => field.type === 'collapsible')

  it('puts plan identity and administrator details in one data-neutral collapsed panel', () => {
    expect(panel).toBeDefined()
    expect(panel).not.toHaveProperty('name')
    expect(panel?.label).toBe('Plan and sub-strand details')
    expect(panel?.admin?.initCollapsed).toBe(true)
    expect(panel?.admin?.condition).toBe(structureCondition)
    expect(panel?.fields?.map((field) => field.name)).toEqual([
      'title',
      ...lessonPlanDetailFields.map((field) => ('name' in field ? field.name : undefined)),
    ])
  })

  it('hides the panel from teachers while leaving Lessons as their first editable section', () => {
    const condition = panel?.admin?.condition as typeof structureCondition
    const subjectAdmin = {
      assignments: [{ subjectGrade: 5, role: 'subjectAdmin' }],
    }
    const teacherWithEditingAccess = {
      assignments: [{ subjectGrade: 5, role: 'editor' }],
    }

    expect(condition({ subjectGrade: 5 }, undefined, { user: subjectAdmin })).toBe(true)
    expect(condition({ subjectGrade: 5 }, undefined, { user: teacherWithEditingAccess })).toBe(
      false,
    )
    expect(lessonEditableContentFields[0]).toMatchObject({ name: 'lessons', label: 'Lessons' })
  })

  it('does not render the immutable plan subject-grade as a disabled repair control', () => {
    const planSubjectGrade = (LessonPlans.fields as LooseField[]).find(
      (field) => field.name === 'subjectGrade',
    )
    expect(planSubjectGrade?.admin?.hidden).toBe(true)
  })
})
