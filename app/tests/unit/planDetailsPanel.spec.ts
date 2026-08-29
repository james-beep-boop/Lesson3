import { describe, expect, it } from 'vitest'

import { LessonBundleVersions } from '../../src/collections/LessonBundleVersions'
import { LessonPlans } from '../../src/collections/LessonPlans'
import { lessonEditableContentFields, structureCondition } from '../../src/fields/lessonContent'
import { planDetailsPanel, type LooseField } from '../helpers/fieldTree'

describe('the version editor starts at lesson content', () => {
  const collectionFields = LessonBundleVersions.fields as LooseField[]
  const panel = planDetailsPanel(collectionFields)

  it('puts plan identity and administrator details in one data-neutral collapsed panel', () => {
    // ⚑ `name`-less is the load-bearing half: a `collapsible` omits `name`, so it introduces no data
    // key and needs no migration. A `group` here would silently nest `meta`/`unit` under a new key.
    expect(panel).not.toHaveProperty('name')
    expect(panel.admin?.initCollapsed).toBe(true)
    expect(panel.admin?.condition).toBe(structureCondition)
    // ⚑ LITERAL names, not derived from `lessonPlanDetailFields`. Spreading that array made the
    // assertion circular — the collection composes the panel from the same export, so it passed for
    // ANY contents, including someone moving `lessons` into it, which is the regression this exists
    // to catch.
    expect(panel.fields?.map((field) => field.name)).toEqual([
      'collapseOnEntry',
      'title',
      'meta',
      'unit',
    ])
    // ⚑ AND `collapseOnEntry` DOES NOT WEAKEN THE DATA-NEUTRAL CLAIM IN THIS TEST'S NAME, which is
    // why it is asserted rather than just listed: a `ui` field carries no data key, so the panel
    // still introduces nothing to migrate. A named field appearing here would fail the list above;
    // this second assertion is what stops the list being widened by something that does store.
    expect(panel.fields?.find((field) => field.name === 'collapseOnEntry')?.type).toBe('ui')
  })

  it('hides the panel from teachers while leaving Lessons as their first editable section', () => {
    const subjectAdmin = {
      assignments: [{ subjectGrade: 5, role: 'subjectAdmin' }],
    }
    const teacherWithEditingAccess = {
      assignments: [{ subjectGrade: 5, role: 'editor' }],
    }

    // Called through the import rather than re-extracted from `panel.admin` and cast: the test
    // above already pins that they are the same function by identity.
    expect(structureCondition({ subjectGrade: 5 }, undefined, { user: subjectAdmin })).toBe(true)
    expect(
      structureCondition({ subjectGrade: 5 }, undefined, { user: teacherWithEditingAccess }),
    ).toBe(false)
    expect(lessonEditableContentFields[0]).toMatchObject({ name: 'lessons', label: 'Lessons' })
  })

  it('does not render the immutable plan subject-grade as a disabled repair control', () => {
    const planSubjectGrade = (LessonPlans.fields as LooseField[]).find(
      (field) => field.name === 'subjectGrade',
    )
    expect(planSubjectGrade?.admin?.hidden).toBe(true)
  })
})
