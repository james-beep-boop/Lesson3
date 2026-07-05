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

vi.mock('../../src/generator/artifactCache', () => ({ getArtifact, putArtifact }))
vi.mock('../../src/generator/generateForVersion', () => ({ generateForVersion }))
vi.mock('../../src/generator/previewBundle', () => ({ docxToSections }))

import { renderVersionSectionsCached } from '../../src/generator/htmlSectionsCache'

const SECTIONS = [{ label: 'Lesson Sequence', html: '<p>hi</p>' }]
const payload = {} as never

beforeEach(() => {
  vi.clearAllMocks()
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

  it('CORRUPT entry: falls through to a fresh render', async () => {
    getArtifact.mockResolvedValue(Buffer.from('not json{'))

    const out = await renderVersionSectionsCached(payload, 7)

    expect(out).toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1)
  })

  it('cache WRITE failure is swallowed — the render still returns', async () => {
    getArtifact.mockResolvedValue(null)
    putArtifact.mockRejectedValue(new Error('disk full'))

    await expect(renderVersionSectionsCached(payload, 7)).resolves.toEqual(SECTIONS)
  })

  it('cache READ failure is swallowed — falls through to render', async () => {
    getArtifact.mockRejectedValue(new Error('io error'))

    await expect(renderVersionSectionsCached(payload, 7)).resolves.toEqual(SECTIONS)
    expect(generateForVersion).toHaveBeenCalledTimes(1)
  })
})
