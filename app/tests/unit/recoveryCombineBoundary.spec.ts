import { beforeEach, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const mock = vi.hoisted(() => ({
  read: vi.fn(),
  limit: vi.fn(),
  active: vi.fn(),
  capture: vi.fn(),
  base: vi.fn(),
  plan: vi.fn(),
  warn: vi.fn(),
}))
vi.mock('@/lib/readBundle', () => ({ findReadableVersion: mock.read }))
vi.mock('@/lib/rateLimit', () => ({ enforceUserRateLimit: mock.limit }))
vi.mock('@/lib/editRecovery/kernel', () => ({
  capture: mock.capture,
  readActiveCapture: mock.active,
}))
vi.mock('@/lib/combine/ancestry', () => ({ findCommonAncestor: mock.base }))
vi.mock('@/lib/combine/engine', () => ({ planCombine: mock.plan }))
import { recoveryCaptureEndpoint, recoveryGetEndpoint } from '@/endpoints/recovery'
const source = { id: 1, lessonPlan: 7, subjectGrade: 5, updatedAt: '2026-10-18T00:00:00.000Z' }
const context = { mergeParent: 2, resolvedKeys: [] }
const prose = { 'lesson:one': { overview: 'Keep this prose' } }
const request = () =>
  ({
    user: { id: 3, roles: ['siteAdmin'] },
    payload: { logger: { warn: mock.warn } },
    routeParams: { id: '1' },
    json: async () => ({
      generation: 1,
      expectedRevision: 1,
      document: {},
      combineContext: context,
    }),
  }) as unknown as PayloadRequest
beforeEach(() => {
  vi.resetAllMocks()
  mock.read.mockImplementation(async (_payload, args) =>
    args.id === '1' ? source : { ...source, id: 2 },
  )
  mock.limit.mockResolvedValue(null)
  mock.active.mockResolvedValue({
    content: prose,
    combineContext: context,
    token: { updatedAt: source.updatedAt },
    baseUpdatedAt: source.updatedAt,
    schemaVersion: '1',
  })
  mock.capture.mockResolvedValue({ ok: true, token: { generation: 1, revision: 2 } })
  mock.base.mockResolvedValue(null)
  mock.plan.mockReturnValue({ ok: true, conflicts: [] })
})
it('capture does no optional parent lookup or comparison, so those failures cannot block prose', async () => {
  mock.read.mockResolvedValueOnce(source).mockRejectedValue(new Error('parent database hiccup'))
  const res = await recoveryCaptureEndpoint.handler(request())
  expect(res.status).toBe(200)
  expect(mock.read).toHaveBeenCalledTimes(1)
  expect(mock.base).not.toHaveBeenCalled()
  expect(mock.plan).not.toHaveBeenCalled()
  expect(mock.capture).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ combineContext: context }),
  )
})
it.each(['parent', 'ancestor', 'engine', 'limiter'])(
  'returns prose as an ordinary draft when optional %s validation fails',
  async (failure) => {
    if (failure === 'parent')
      mock.read.mockResolvedValueOnce(source).mockRejectedValue(new Error('unavailable'))
    if (failure === 'ancestor') mock.base.mockRejectedValue(new Error('unavailable'))
    if (failure === 'engine')
      mock.plan.mockImplementation(() => {
        throw new Error('unavailable')
      })
    if (failure === 'limiter') mock.limit.mockRejectedValue(new Error('unavailable'))
    const res = await recoveryGetEndpoint.handler(request())
    expect(res.status).toBe(200)
    expect((await res.json()).capture).toMatchObject({
      content: prose,
      combineContext: null,
      combineUnavailableReason: 'comparison-unavailable',
    })
  },
)
it('an exhausted preview budget prevents expensive work without hiding the prose', async () => {
  mock.limit.mockResolvedValue(new Response(null, { status: 429 }))
  const res = await recoveryGetEndpoint.handler(request())
  expect((await res.json()).capture.content).toEqual(prose)
  expect(mock.limit).toHaveBeenCalledWith(expect.anything(), 'preview')
  expect(mock.read).toHaveBeenCalledTimes(1)
  expect(mock.base).not.toHaveBeenCalled()
  expect(mock.plan).not.toHaveBeenCalled()
})
it('ordinary drafts do not consume the comparison budget', async () => {
  mock.active.mockResolvedValue({
    content: prose,
    combineContext: null,
    token: { updatedAt: source.updatedAt },
    baseUpdatedAt: source.updatedAt,
    schemaVersion: '1',
  })
  expect((await recoveryGetEndpoint.handler(request())).status).toBe(200)
  expect(mock.limit).not.toHaveBeenCalled()
})
