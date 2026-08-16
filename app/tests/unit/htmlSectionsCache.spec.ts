/**
 * Unit coverage for the version HTML-sections cache (`generator/htmlSectionsCache.ts`, Phase 3).
 * Mocks the fs-backed artifact store and the generate/render chain so the CACHING behaviour is
 * pinned without a DB or the docx/mammoth pipeline: hit returns parsed sections without
 * regenerating; miss generates once + writes; a corrupt entry falls through to a fresh render; a
 * cache-write failure never breaks the render. DB-free → `test:unit`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted so the vi.mock factories (also hoisted) can safely close over them.
const { getArtifact, putArtifact, generateForVersion, docxToSections } = vi.hoisted(() => ({
  getArtifact: vi.fn(),
  putArtifact: vi.fn(),
  generateForVersion: vi.fn(),
  docxToSections: vi.fn(),
}))

// ⚑ ONLY THE TWO IO FUNCTIONS ARE STUBBED — `bestEffortArtifact` and `resetArtifactCacheWarnings`
// come through REAL via `importActual`.
//
// An earlier version of this mock supplied its own catch-and-fallback stand-in for the helper. That
// made the cache-failure cases pass whether or not the consumer actually routed through the helper:
// reverting `htmlSectionsCache` to a bare `.catch(() => null)` left the entire suite green, so the
// original defect could be reintroduced undetected. Running the real helper is what makes the
// "logs once" assertions below observe the CONSUMER's wiring rather than the mock's.
vi.mock('../../src/generator/artifactCache', async () => {
  const actual = await vi.importActual<typeof import('../../src/generator/artifactCache')>(
    '../../src/generator/artifactCache',
  )
  return { ...actual, getArtifact, putArtifact }
})
vi.mock('../../src/generator/generateForVersion', () => ({ generateForVersion }))
vi.mock('../../src/generator/previewBundle', () => ({ docxToSections }))

import { renderVersionSectionsCached } from '../../src/generator/htmlSectionsCache'
import { resetArtifactCacheWarnings } from '../../src/generator/artifactCache'

const SECTIONS = [{ label: 'Lesson Sequence', html: '<p>hi</p>' }]
// Carries a logger now: the cache helpers take `payload.logger` so a broken cache is reported once
// rather than silently degrading every request into a full re-render.
const payload = { logger: { warn: vi.fn() } } as never

beforeEach(() => {
  vi.clearAllMocks()
  // The real helper's warned-set is module state that survives calls by design.
  resetArtifactCacheWarnings()
  generateForVersion.mockResolvedValue({ lessonSequence: Buffer.from('x') })
  docxToSections.mockResolvedValue(SECTIONS)
  putArtifact.mockResolvedValue(undefined)
})

describe('renderVersionSectionsCached', () => {
  it('cache HIT: returns parsed sections without regenerating', async () => {
    getArtifact.mockResolvedValue(Buffer.from(JSON.stringify(SECTIONS)))

    const out = await renderVersionSectionsCached(payload, 7)

    expect(out).toEqual(SECTIONS)
    expect(generateForVersion).not.toHaveBeenCalled()
    expect(putArtifact).not.toHaveBeenCalled()
  })

  it('cache MISS: generates once, writes the cache, returns sections', async () => {
    getArtifact.mockResolvedValue(null)

    const out = await renderVersionSectionsCached(payload, 7)

    expect(out).toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledWith(payload, 7)
    expect(putArtifact).toHaveBeenCalledTimes(1)
    // Written value round-trips to the sections (JSON), under a version-tagged, id-scoped key.
    const [key, buf] = putArtifact.mock.calls[0]
    expect(String(key)).toContain('version:7')
    expect(String(key)).toMatch(/html-sections::v\d+::/)
    expect(JSON.parse((buf as Buffer).toString('utf8'))).toEqual(SECTIONS)
  })

  it('CORRUPT entry: falls through to a fresh render AND rewrites the cache', async () => {
    getArtifact.mockResolvedValue(Buffer.from('not json{'))

    const out = await renderVersionSectionsCached(payload, 7)

    expect(out).toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1)
    expect(putArtifact).toHaveBeenCalledTimes(1) // corrupt entry is repaired
  })

  it('STRUCTURALLY corrupt JSON: falls through instead of trusting a cast', async () => {
    getArtifact.mockResolvedValue(Buffer.from('{"label":"not-an-array"}'))

    await expect(renderVersionSectionsCached(payload, 7)).resolves.toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1)
    expect(putArtifact).toHaveBeenCalledTimes(1)
  })

  it('SINGLE-FLIGHT: concurrent misses for one key render once, not N times', async () => {
    getArtifact.mockResolvedValue(null)
    // Hold the render open so both calls overlap in flight.
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    generateForVersion.mockImplementation(async () => {
      await gate
      return { lessonSequence: Buffer.from('x') }
    })

    const a = renderVersionSectionsCached(payload, 7)
    const b = renderVersionSectionsCached(payload, 7)
    release()
    const [ra, rb] = await Promise.all([a, b])

    expect(ra).toEqual(SECTIONS)
    expect(rb).toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1) // coalesced
    expect(putArtifact).toHaveBeenCalledTimes(1)
  })

  /**
   * ⚑ THESE TWO ASSERT THE CONSUMER'S WIRING, not just its tolerance.
   *
   * "The render still returns" passes under a bare `.catch(() => null)` too, so on its own it
   * cannot tell whether this module routes failures through `bestEffortArtifact` at all — and that
   * was demonstrated on this branch by reverting the call sites and watching the whole suite stay
   * green. The `logger.warn` expectation is the part that fails when the helper call is removed,
   * and it only means anything because the mock above lets the REAL helper run.
   */
  it('cache WRITE failure: render still returns, and the fault is reported once', async () => {
    getArtifact.mockResolvedValue(null)
    putArtifact.mockRejectedValue(new Error('disk full'))

    await expect(renderVersionSectionsCached(payload, 7)).resolves.toEqual(SECTIONS)

    const warn = (payload as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn
    expect(warn, 'a silently broken cache re-renders on every request').toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatchObject({ operation: 'write' })
  })

  it('cache READ failure: falls through to render, and the fault is reported once', async () => {
    getArtifact.mockRejectedValue(new Error('io error'))

    await expect(renderVersionSectionsCached(payload, 7)).resolves.toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1)

    const warn = (payload as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn
    expect(warn.mock.calls.map((c) => (c[0] as { operation: string }).operation)).toContain('read')
  })

  /** A MISS is the ordinary cold-cache case and must never warn, or the signal is worthless. */
  it('a cache MISS is not a fault and reports nothing', async () => {
    getArtifact.mockResolvedValue(null)

    await renderVersionSectionsCached(payload, 7)

    const warn = (payload as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn
    expect(warn).not.toHaveBeenCalled()
  })
})
