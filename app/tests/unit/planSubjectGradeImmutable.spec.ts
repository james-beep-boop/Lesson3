import { describe, expect, it } from 'vitest'

import { enforcePlanSubjectGradeImmutable } from '@/hooks/lessonPlan'
import { fieldErrors } from '../helpers/payloadErrors'

const run = async (args: {
  data: Record<string, unknown>
  operation?: 'create' | 'update'
  originalDoc?: Record<string, unknown>
}) =>
  await enforcePlanSubjectGradeImmutable({
    data: args.data,
    operation: args.operation ?? 'update',
    originalDoc: args.originalDoc ?? { id: 1, subjectGrade: 5 },
    req: { t: (key: string) => key, user: { id: 1, roles: ['siteAdmin'] } },
  } as never)

describe('lesson-plan subject-grade identity', () => {
  it('allows ingest to set subjectGrade on create', async () => {
    await expect(run({ data: { subjectGrade: 5 }, operation: 'create' })).resolves.toEqual({
      subjectGrade: 5,
    })
  })

  it('does nothing when an update omits subjectGrade', async () => {
    await expect(run({ data: { title: 'Renamed' } })).resolves.toEqual({ title: 'Renamed' })
  })

  it('allows a same-value no-op, including a populated relationship', async () => {
    await expect(run({ data: { subjectGrade: { id: 5 } } })).resolves.toEqual({
      subjectGrade: { id: 5 },
    })
  })

  it('rejects moving the plan even for a Site Administrator', async () => {
    expect(await fieldErrors(run({ data: { subjectGrade: 6 } }))).toEqual([
      {
        message: expect.stringMatching(/fixed when it is uploaded/i),
        path: 'subjectGrade',
      },
    ])
  })

  it('rejects clearing subjectGrade', async () => {
    const [error] = await fieldErrors(run({ data: { subjectGrade: null } }))
    expect(error.path).toBe('subjectGrade')
  })
})
