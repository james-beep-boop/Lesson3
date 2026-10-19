import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ read: vi.fn(), find: vi.fn(), hasDraft: vi.fn() }))
// The real `findReadableVersionChoices`, so the assertion below checks the query it actually sends.
vi.mock('@/lib/readBundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/readBundle')>()),
  findReadableVersion: mock.read,
}))
vi.mock('@/lib/editRecovery/kernel', () => ({ hasUnsavedWork: mock.hasDraft }))
vi.mock('@/lib/systemFlags', () => ({ systemFlagsForRender: async () => ({}) }))
vi.mock('@/components/LessonControls', () => ({ default: () => null }))
import Controls from '@/components/LessonControls/server'
beforeEach(() => {
  vi.clearAllMocks()
  mock.hasDraft.mockResolvedValue(false)
  mock.read.mockResolvedValue({ lessonPlan: 7, subjectGrade: 5 })
  mock.find.mockResolvedValue({ docs: [{ id: 1, semver: '1.0.0' }] })
})
it('only reads version numbers for someone who can combine', async () => {
  const user = { id: 1, roles: ['siteAdmin'] }
  await Controls({ payload: { find: mock.find }, id: 1, user } as never)
  expect(mock.find).toHaveBeenCalledWith(
    expect.objectContaining({ select: { semver: true }, overrideAccess: false, user, depth: 0 }),
  )
})
it('does not list other versions for a Teacher without editing access', async () => {
  await Controls({
    payload: { find: mock.find },
    id: 1,
    user: { id: 1, roles: [], assignments: [] },
  } as never)
  expect(mock.find).not.toHaveBeenCalled()
})

it('optional suggestion failure preserves the normal controls', async () => {
  mock.hasDraft.mockResolvedValue(true)
  mock.read.mockResolvedValue({ id: 1, lessonPlan: 7, subjectGrade: 5, semver: '1.0.0' })
  mock.find
    .mockResolvedValueOnce({ docs: [{ id: 1, semver: '1.0.0' }] })
    .mockRejectedValueOnce(new Error('suggestion unavailable'))
  const controls = await Controls({
    payload: { find: mock.find },
    id: 1,
    user: { id: 1, roles: ['siteAdmin'] },
  } as never)
  expect(controls.props.draftCombineSuggestion).toBeNull()
  expect(controls.props.hasDraft).toBe(true)
})
it('queries a common-history suggestion with the caller access and same-plan filter', async () => {
  mock.hasDraft.mockResolvedValue(true)
  mock.read.mockResolvedValue({ id: 1, lessonPlan: 7, subjectGrade: 5, semver: '1.0.0' })
  mock.find.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({
    docs: [
      { id: 1, semver: '1.0.0' },
      { id: 2, semver: '1.0.2', lineage: [1] },
    ],
  })
  const user = { id: 1, roles: ['siteAdmin'] }
  const controls = await Controls({ payload: { find: mock.find }, id: 1, user } as never)
  expect(mock.find).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: { lessonPlan: { equals: 7 } },
      select: { semver: true, lineage: true, author: true, mergedFrom: true },
      overrideAccess: false,
      user,
    }),
  )
  expect(controls.props.draftCombineSuggestion).toEqual({
    id: 2,
    semver: '1.0.2',
    kind: 'descendant',
  })
})
