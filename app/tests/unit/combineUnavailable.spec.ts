import { beforeEach, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const mock = vi.hoisted(() => ({
  lock: vi.fn(),
  rollback: vi.fn(),
  begin: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  initTransaction: mock.begin,
  killTransaction: mock.rollback,
}))
vi.mock('@/lib/txDb', () => ({ lockRows: mock.lock }))
vi.mock('@/endpoints/respond', async (original) => ({
  ...(await original<typeof import('@/endpoints/respond')>()),
  refreshCaller: mock.refresh,
}))
import { saveAsNewEndpoint } from '@/endpoints/versionEdit'

const source = {
  id: 1,
  lessonPlan: 7,
  subjectGrade: 5,
  title: 'Original',
  updatedAt: '2026-10-18T00:00:00.000Z',
}
const caller = { id: 3, roles: ['siteAdmin'] }
const request = (findByID: ReturnType<typeof vi.fn>) => {
  const form = new FormData()
  form.set('data', JSON.stringify({ ...source, title: 'Changed prose' }))
  form.set('mergeParent', '2')
  return {
    user: caller,
    payload: { findByID },
    routeParams: { id: '1' },
    query: {},
    formData: async () => form,
  } as unknown as PayloadRequest
}
beforeEach(() => {
  vi.resetAllMocks()
  mock.begin.mockResolvedValue(true)
  mock.refresh.mockResolvedValue(caller)
})
it.each([403, 404])('source read denial %s returns the same endpoint-owned 404', async (status) => {
  const find = vi.fn().mockRejectedValue({ status })
  const res = await saveAsNewEndpoint.handler(request(find))
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({
    errors: [{ message: 'Version not found' }],
    unavailable: 'source',
  })
  expect(mock.begin).not.toHaveBeenCalled()
})
it.each([403, 404])(
  'second-parent read denial %s rolls back and returns the same 404',
  async (status) => {
    const find = vi
      .fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(source)
      .mockRejectedValue({ status })
    const res = await saveAsNewEndpoint.handler(request(find))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      errors: [{ message: 'Version not found' }],
      unavailable: 'secondParent',
    })
    expect(mock.lock).toHaveBeenCalledWith(expect.anything(), 'lesson_plans', [7])
    expect(mock.rollback).toHaveBeenCalledTimes(1)
  },
)
it.each([403, 404])(
  'source read denial %s after the lock takes precedence over the other parent',
  async (status) => {
    const find = vi.fn().mockResolvedValueOnce(source).mockRejectedValue({ status })
    const res = await saveAsNewEndpoint.handler(request(find))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ unavailable: 'source' })
    expect(find).toHaveBeenCalledTimes(2)
    expect(mock.rollback).toHaveBeenCalledTimes(1)
  },
)
it('rejects revoked editing access before any locked parent re-read', async () => {
  mock.refresh.mockResolvedValue({ id: 3, roles: [], assignments: [] })
  const find = vi.fn().mockResolvedValueOnce(source).mockRejectedValue({ status: 404 })
  await expect(saveAsNewEndpoint.handler(request(find))).rejects.toMatchObject({ status: 403 })
  expect(find).toHaveBeenCalledTimes(1)
  expect(mock.rollback).toHaveBeenCalledTimes(1)
})
it('does not turn a database failure into a missing-parent response', async () => {
  const failure = new Error('Database unavailable')
  const find = vi
    .fn()
    .mockResolvedValueOnce(source)
    .mockResolvedValueOnce(source)
    .mockRejectedValue(failure)
  await expect(saveAsNewEndpoint.handler(request(find))).rejects.toBe(failure)
  expect(mock.rollback).toHaveBeenCalledTimes(1)
})
