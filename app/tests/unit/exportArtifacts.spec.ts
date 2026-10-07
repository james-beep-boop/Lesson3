/**
 * The export cache layer for the four-document world: the zip lists every deliverable that exists, the
 * teacher key travels with the final explanation, and artifacts rendered under the PREVIOUS generator are
 * never served after the render-version bump. Uses the real artifact cache in a throwaway directory.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import JSZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'lesson3-artifacts-'))
process.env.ARTIFACT_CACHE_DIR = dir

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const load = async () => {
  const [artifacts, version] = await Promise.all([
    import('../../src/generator/exportArtifacts'),
    import('../../src/generator/renderVersion'),
  ])
  return { ...artifacts, GENERATOR_RENDER_VERSION: version.GENERATOR_RENDER_VERSION }
}

const generated = (withFe: boolean) => ({
  lessonSequence: Buffer.from('seq'),
  finalExplanation: withFe ? Buffer.from('student') : null,
  teacherKey: withFe ? Buffer.from('key') : null,
  summaryTable: Buffer.from('st'),
})
const identity = async (docx: Buffer) => docx

describe('export artifacts', () => {
  it('the deliverable tags are exactly the four documents, in document order', async () => {
    const { DELIVERABLE_TAGS } = await load()
    expect([...DELIVERABLE_TAGS]).toEqual([
      'lessonSequence',
      'finalExplanation',
      'teacherKey',
      'summaryTable',
    ])
  })

  it('the key has its own filename stem, distinct from the student document', async () => {
    const { deliverableStem } = await load()
    expect(deliverableStem('teacherKey', 'P')).toBe('P_FinalExplanation_TeacherKey')
    expect(deliverableStem('finalExplanation', 'P')).toBe('P_FinalExplanation')
  })

  it('a version with a final explanation caches and zips all four documents', async () => {
    const { produceArtifacts, loadCachedExportZip, versionScope } = await load()
    const spec = { scope: versionScope('with-fe'), kind: 'docx' as const }
    const docs = await produceArtifacts(spec, generated(true) as never, 'P', identity)
    expect(docs.map((d) => d.tag)).toEqual([
      'lessonSequence',
      'finalExplanation',
      'teacherKey',
      'summaryTable',
    ])
    const zip = await JSZip.loadAsync((await loadCachedExportZip(spec))!)
    expect(Object.keys(zip.files)).toEqual([
      'P_CBE_LessonSequence.docx',
      'P_FinalExplanation.docx',
      'P_FinalExplanation_TeacherKey.docx',
      'P_SummaryTable.docx',
    ])
    expect(await zip.files['P_FinalExplanation_TeacherKey.docx']!.async('string')).toBe('key')
    expect(await zip.files['P_FinalExplanation.docx']!.async('string')).toBe('student')
  })

  it('a version without one has neither the student document nor the key', async () => {
    const { produceArtifacts, loadCachedExportZip, loadCachedDeliverable, versionScope } =
      await load()
    const spec = { scope: versionScope('no-fe'), kind: 'docx' as const }
    await produceArtifacts(spec, generated(false) as never, 'P', identity)
    const zip = await JSZip.loadAsync((await loadCachedExportZip(spec))!)
    expect(Object.keys(zip.files)).toEqual(['P_CBE_LessonSequence.docx', 'P_SummaryTable.docx'])
    expect(await loadCachedDeliverable(spec, 'teacherKey')).toEqual({ state: 'absent' })
    expect(await loadCachedDeliverable(spec, 'finalExplanation')).toEqual({ state: 'absent' })
  })

  it('serves the key as a single document with its own filename', async () => {
    const { produceArtifacts, loadCachedDeliverable, versionScope } = await load()
    const spec = { scope: versionScope('single'), kind: 'pdf' as const }
    await produceArtifacts(spec, generated(true) as never, 'P', async (_b, name) =>
      Buffer.from(`pdf:${name}`),
    )
    const key = await loadCachedDeliverable(spec, 'teacherKey')
    expect(key).toMatchObject({ state: 'ready', filename: 'P_FinalExplanation_TeacherKey.pdf' })
    expect((key as { bytes: Buffer }).bytes.toString()).toBe(
      'pdf:P_FinalExplanation_TeacherKey.docx',
    )
  })

  it('never serves artifacts rendered under the previous generator (render-version bump)', async () => {
    const {
      produceArtifacts,
      loadCachedExportZip,
      isExportReady,
      versionScope,
      GENERATOR_RENDER_VERSION,
    } = await load()
    const previous = {
      scope: `render:${GENERATOR_RENDER_VERSION - 1}:version:legacy`,
      kind: 'docx' as const,
    }
    await produceArtifacts(previous, generated(true) as never, 'P', identity)
    expect(await isExportReady(previous)).toBe(true) // it IS cached under the old scope…
    const current = { scope: versionScope('legacy'), kind: 'docx' as const }
    expect(current.scope).toBe(`render:${GENERATOR_RENDER_VERSION}:version:legacy`)
    expect(await loadCachedExportZip(current)).toBeNull() // …and invisible to the current scope
    expect(await isExportReady(current)).toBe(false)
  })

  it('is on render version 7 for this generator', async () => {
    // A deliberate tripwire: the pinned generator's output changed (attribution, split final explanation,
    // tables, null wording). Lowering this would let a stale zip be served as if current.
    const { GENERATOR_RENDER_VERSION } = await load()
    expect(GENERATOR_RENDER_VERSION).toBeGreaterThanOrEqual(7)
  })
})
