import { afterEach, expect, it, vi } from 'vitest'
import { missingCombineParent } from '@/components/CombineVersions/saveFailure'
afterEach(() => vi.unstubAllGlobals())
it.each([
  [404, 200, 'source'],
  [200, 404, 'other'],
  [200, 200, null],
  [500, 404, null],
  [200, 500, null],
  [403, 404, null],
] as const)(
  'classifies source %i and other %i without inventing a missing parent',
  async (source, other, expected) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: source }))
        .mockResolvedValueOnce(new Response(null, { status: other })),
    )
    expect(await missingCombineParent(1, 2)).toBe(expected)
  },
)
it('keeps provenance if a follow-up read fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  expect(await missingCombineParent(1, 2)).toBeNull()
})
