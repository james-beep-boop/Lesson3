/**
 * `diffVersionSectionsCached` (`generator/htmlDiffCache.ts`) — that its cache failures are REPORTED,
 * not swallowed.
 *
 * ⚑ WHY A SEPARATE FILE. This consumer had no cache test at all: `htmlDiffContract.spec.ts` covers
 * the diff library's output, and `htmlSectionsCache.spec.ts` covers the sibling module. So the one
 * of the two caches with no coverage was also the one where a reverted `.catch(() => null)` would
 * have been completely invisible. Its cost is the higher of the two, since a compare view diffs
 * BOTH versions' full renders.
 *
 * The real `bestEffortArtifact` runs here — only the two IO functions are stubbed. A mock that
 * supplied its own catch-and-fallback would make these cases pass whether or not this module calls
 * the helper, which is exactly the hole this file was written to close.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getArtifact, putArtifact, renderVersionSectionsCached } = vi.hoisted(() => ({
  getArtifact: vi.fn(),
  putArtifact: vi.fn(),
  renderVersionSectionsCached: vi.fn(),
}))

vi.mock('../../src/generator/artifactCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/generator/artifactCache')>(
    '../../src/generator/artifactCache',
  )
  return { ...actual, getArtifact, putArtifact }
})
vi.mock('../../src/generator/htmlSectionsCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/generator/htmlSectionsCache')>(
    '../../src/generator/htmlSectionsCache',
  )
  return { ...actual, renderVersionSectionsCached }
})

import { diffVersionSectionsCached } from '../../src/generator/htmlDiffCache'
import { resetArtifactCacheWarnings } from '../../src/generator/artifactCache'

const warn = vi.fn()
const payload = { logger: { warn } } as never

const SECTIONS_FROM = [{ label: 'Lesson Sequence', html: '<p>old</p>' }]
const SECTIONS_TO = [{ label: 'Lesson Sequence', html: '<p>new</p>' }]

beforeEach(() => {
  vi.clearAllMocks()
  resetArtifactCacheWarnings()
  renderVersionSectionsCached.mockImplementation(async (_p: unknown, id: number | string) =>
    String(id) === '1' ? SECTIONS_FROM : SECTIONS_TO,
  )
  putArtifact.mockResolvedValue(undefined)
})

describe('cache faults are survivable AND visible', () => {
  it('a READ failure still produces a diff, and is reported', async () => {
    getArtifact.mockRejectedValue(new Error('EACCES: permission denied'))

    const out = await diffVersionSectionsCached(payload, 1, 2)

    expect(out.length, 'the compare view still renders').toBeGreaterThan(0)
    expect(
      warn.mock.calls.map((c) => (c[0] as { operation: string }).operation),
      'a broken diff cache re-renders BOTH versions on every compare',
    ).toContain('read')
  })

  it('a WRITE failure still produces a diff, and is reported', async () => {
    getArtifact.mockResolvedValue(null)
    putArtifact.mockRejectedValue(new Error('ENOSPC: no space left on device'))

    const out = await diffVersionSectionsCached(payload, 1, 2)

    expect(out.length).toBeGreaterThan(0)
    expect(warn.mock.calls.map((c) => (c[0] as { operation: string }).operation)).toContain('write')
  })

  it('an ordinary MISS reports nothing', async () => {
    getArtifact.mockResolvedValue(null)

    await diffVersionSectionsCached(payload, 1, 2)

    expect(warn).not.toHaveBeenCalled()
  })

  it('a HIT reports nothing and skips the render entirely', async () => {
    const cached = [{ label: 'Lesson Sequence', oldHtml: '<p>o</p>', newHtml: '<p>n</p>' }]
    getArtifact.mockResolvedValue(Buffer.from(JSON.stringify(cached)))

    await expect(diffVersionSectionsCached(payload, 1, 2)).resolves.toEqual(cached)

    expect(renderVersionSectionsCached).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})
