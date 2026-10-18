import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ read: vi.fn(), find: vi.fn() }))
vi.mock('@/lib/readBundle', () => ({ findReadableVersion: mock.read }))
vi.mock('@/lib/editRecovery/kernel', () => ({ hasUnsavedWork: async () => false }))
vi.mock('@/lib/systemFlags', () => ({ systemFlagsForRender: async () => ({}) }))
vi.mock('@/components/LessonControls', () => ({ default: () => null }))
import Controls from '@/components/LessonControls/server'
beforeEach(() => {
  vi.clearAllMocks()
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
