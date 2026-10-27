import { describe, it, expect } from 'vitest'
import { parseLessonManifest, sha256, checksumWarning } from '../../src/ingest/lessonManifest'
import {
  decideRelease,
  officialDecision,
  previewToken,
  type OfficialPreview,
} from '../../src/ingest/releaseDecision'

const manifest = () => ({
  format: 1,
  release: { id: 'November', date: '2026-11-14' },
  schemaVersion: '1.0.0',
  minProgram: '1.08',
  files: {
    'bio/a.json': { sha256: sha256('bytes') },
    'quiz.json': { sha256: sha256('quiz'), kind: 'quiz' },
  },
})
describe('lesson-set manifest', () => {
  it('accepts an optional manifest and preserves per-file kinds', () => {
    expect(parseLessonManifest(undefined)).toBeUndefined()
    expect(parseLessonManifest(JSON.stringify(manifest()))).toEqual(manifest())
  })
  it.each([
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...manifest(), release: { id: 'a', date: '2026-02-30' } }),
    JSON.stringify({ ...manifest(), files: { '../escape.json': { sha256: sha256('x') } } }),
  ])('refuses malformed envelope %s', (text) => {
    expect(() => parseLessonManifest(text)).toThrow(/LESSONS.json could not be read/)
  })
  it.each([
    { format: 2 },
    { schemaVersion: '2.0.0' },
    { minProgram: '1.09' },
    { minProgram: '2.0' },
  ])('refuses unsupported versions %j', (change) => {
    expect(() => parseLessonManifest(JSON.stringify({ ...manifest(), ...change }))).toThrow(
      /needs a newer ARES Lesson Plans/,
    )
  })
  it('checks bytes with a warning, never a refusal', () => {
    expect(checksumWarning('bytes', sha256('bytes'))).toEqual([])
    expect(checksumWarning('other', sha256('bytes'))[0]).toMatch(/Looks damaged/)
  })
})
const a = {
  id: 1,
  semver: '1.0.0',
  releaseFingerprint: 'A',
  aresReleaseId: 'November',
  aresReleaseDate: '2026-11-14',
}
const b = {
  id: 2,
  semver: '2.0.0',
  releaseFingerprint: 'B',
  aresReleaseId: 'December',
  aresReleaseDate: '2026-12-02',
}
const teacher = { id: 3, semver: '2.0.1', releaseFingerprint: null }
describe('release identity', () => {
  it.each([
    ['same id and content', 'A', { id: 'November', date: '2026-11-14' }, 'alreadyHere'],
    ['reused older id', 'changed', { id: 'November', date: '2026-11-14' }, 'conflict'],
    ['old stick', 'A', { id: 'October', date: '2026-10-01' }, 'olderNotImported'],
    ['January deliberately restores A', 'A', { id: 'January', date: '2027-01-01' }, 'new'],
    ['equal dates', 'A', { id: 'December correction', date: '2026-12-02' }, 'new'],
    ['no manifest, latest release despite teacher save', 'B', undefined, 'alreadyHere'],
    ['no manifest, earlier content', 'A', undefined, 'new'],
    ['no manifest, new content', 'C', undefined, 'new'],
  ] as const)('%s', (_label, fingerprint, release, action) => {
    expect(decideRelease([a, b, teacher], fingerprint, release).action).toBe(action)
  })
  it('flags older content only without a manifest', () => {
    expect(decideRelease([a, b], 'A').olderContent?.semver).toBe('1.0.0')
    expect(
      decideRelease([a, b], 'A', { id: 'January', date: '2027-01-01' }).olderContent,
    ).toBeUndefined()
  })
  it('moves an ARES Official and waits for a teacher Official or missing Official', () => {
    expect(officialDecision(a).willMove).toBe(true)
    expect(officialDecision(teacher).willMove).toBe(false)
    expect(officialDecision(undefined).willMove).toBe(false)
  })
  it('binds every preview decision, content and pointer, independent of input order', () => {
    const p: OfficialPreview = {
      file: 'a',
      plan: 1,
      title: 'A',
      currentOfficial: 1,
      incomingSemver: '2.0.0',
      previousSemver: '1.0.0',
      release: null,
      fingerprint: 'A',
      decision: 'new',
      willMove: true,
      reason: 'ARES',
      olderContent: null,
    }
    const q = { ...p, file: 'b' }
    expect(previewToken([p, q])).toBe(previewToken([q, p]))
    for (const change of [
      { plan: 2 },
      { currentOfficial: 2 },
      { fingerprint: 'B' },
      { decision: 'alreadyHere' as const },
      { willMove: false },
      { release: { id: 'Jan', date: '2027-01-01' } },
      { olderContent: '1.0.0' },
    ]) {
      expect(previewToken([{ ...p, ...change }])).not.toBe(previewToken([p]))
    }
  })
})
