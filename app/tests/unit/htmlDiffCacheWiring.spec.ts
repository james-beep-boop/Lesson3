/**
 * `diffVersionGroupsCached` (`generator/htmlDiffCache.ts`) — that its cache failures are REPORTED,
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

import {
  COMPARE_DIFF_FORMAT_VERSION,
  diffVersionGroupsCached,
} from '../../src/generator/htmlDiffCache'
import { resetArtifactCacheWarnings } from '../../src/generator/artifactCache'

const warn = vi.fn()
const payload = { logger: { warn } } as never

const SECTIONS_FROM = [{ label: 'Lesson Sequence', html: '<p>old</p>' }]
const SECTIONS_TO = [{ label: 'Lesson Sequence', html: '<p>new</p>' }]
/** A valid CURRENT-format entry (see `CompareGroup`) — a HIT must be returned verbatim. */
const CACHED_GROUP = {
  key: 'heading',
  doc: 'Lesson Sequence',
  label: 'Document heading',
  lesson: null,
  changed: true,
  presence: 'both',
  structureOnly: false,
  oldHtml: '<p>o</p>',
  newHtml: '<p>n</p>',
}

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

    const out = await diffVersionGroupsCached(payload, 1, 2)

    expect(out.length, 'the compare view still renders').toBeGreaterThan(0)
    expect(
      warn.mock.calls.map((c) => (c[0] as { operation: string }).operation),
      'a broken diff cache re-renders BOTH versions on every compare',
    ).toContain('read')
  })

  it('a WRITE failure still produces a diff, and is reported', async () => {
    getArtifact.mockResolvedValue(null)
    putArtifact.mockRejectedValue(new Error('ENOSPC: no space left on device'))

    const out = await diffVersionGroupsCached(payload, 1, 2)

    expect(out.length).toBeGreaterThan(0)
    expect(warn.mock.calls.map((c) => (c[0] as { operation: string }).operation)).toContain('write')
  })

  it('an ordinary MISS reports nothing', async () => {
    getArtifact.mockResolvedValue(null)

    await diffVersionGroupsCached(payload, 1, 2)

    expect(warn).not.toHaveBeenCalled()
  })

  it('a HIT reports nothing and skips the render entirely', async () => {
    getArtifact.mockResolvedValue(Buffer.from(JSON.stringify([CACHED_GROUP])))

    await expect(diffVersionGroupsCached(payload, 1, 2)).resolves.toEqual([CACHED_GROUP])

    expect(renderVersionSectionsCached).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})

/**
 * The format version is what keeps a pre-2026-08-23 artifact — whole-document panes, no `changed`
 * flag — from being served as an area list where every area would read as unchanged. Belt (key) and
 * braces (decoder), because either alone would fail silently.
 */
describe('diff-format versioning rejects the previous cached shape', () => {
  it('carries an independent format version in the cache key', async () => {
    getArtifact.mockResolvedValue(null)

    await diffVersionGroupsCached(payload, 1, 2)

    expect(getArtifact).toHaveBeenCalledWith(
      expect.stringContaining(`::f${COMPARE_DIFF_FORMAT_VERSION}::`),
    )
  })

  it('treats a format-1 entry as a miss instead of trusting its strings', async () => {
    // The oldest shape: label/oldHtml/newHtml only. It satisfies every STRING check, so only the
    // `changed` check stops it — without that, `changed` would be undefined and the page would
    // report a fully-rewritten bundle as having no changes at all.
    const formatOne = [{ label: 'Lesson Sequence', oldHtml: '<p>o</p>', newHtml: '<p>n</p>' }]
    getArtifact.mockResolvedValue(Buffer.from(JSON.stringify(formatOne)))

    const out = await diffVersionGroupsCached(payload, 1, 2)

    expect(out).not.toEqual(formatOne)
    expect(
      renderVersionSectionsCached,
      'it re-rendered rather than serving the old shape',
    ).toHaveBeenCalled()
    expect(out.every((g) => typeof g.changed === 'boolean')).toBe(true)
  })

  it('treats a format-2 entry as a miss — it carries `changed` but no `presence`', async () => {
    // Format 2 had `changed`/`structureOnly` and inferred absence from an empty pane. Serving one
    // would leave `presence` undefined, so the page would render "Not present in this version" for
    // no area at all — silently losing the added/removed distinction rather than failing.
    const formatTwo = [{ ...CACHED_GROUP, presence: undefined }]
    getArtifact.mockResolvedValue(Buffer.from(JSON.stringify(formatTwo)))

    const out = await diffVersionGroupsCached(payload, 1, 2)

    expect(
      renderVersionSectionsCached,
      'it re-rendered rather than serving format 2',
    ).toHaveBeenCalled()
    expect(out.every((g) => !g.changed || g.presence !== undefined)).toBe(true)
  })
})
