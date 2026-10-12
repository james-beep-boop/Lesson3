/**
 * Re-ingest integration tests (SPEC §7, Phase 4). An upload whose (subjectGrade, META.substrand_id)
 * matches an existing lesson plan attaches as the next MAJOR version of that plan, arriving Not
 * Official (an admin promotes it) — instead of creating a duplicate plan. Covers: create-new
 * (unchanged), revise-existing, ambiguous (legacy duplicate plans) → error, intra-batch duplicate →
 * error, and empty substrand_id → new plan.
 *
 * Drives the shared `ingestItems` core directly with in-memory extract thunks (the same entry the
 * CLI + upload endpoint use). Seeds its own Subject/SubjectGrade, MARK-tagged, and tears down.
 * Requires a DB → Rock/CI only (like all of `tests/int`).
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { ingestItems, ingestUploadItems, type IngestItem } from '../../src/ingest/index.js'
import { rawToBundle } from '../../src/ingest/toBundle.js'
import {
  MARK,
  MARK_BASE,
  enqueuedKindsFor,
  minimalResourceLinks,
  purgeMarked,
} from '../helpers/fixtures.js'
import { relId } from '../../src/lib/relId.js'

let payload: Payload
const GRADE = 97 // a grade this suite owns, distinct from the shared fixture's 99/98

/**
 * A minimal RAW ARES bundle (UPPERCASE groups) for this suite's subject/grade that BOTH passes
 * `validateGeneratable` AND conforms to `ares-contract.schema.json` — ingest applies contract drift
 * as a HARD gate, so a bundle missing `schemaVersion` / required UNIT·LESSON fields is rejected in
 * pre-flight before the re-ingest logic runs. UNIT/FINAL_EXPLANATION/SUMMARY_TABLE are `null` (the
 * contract's "intentionally absent" signal) to keep the fixture small while conforming; the
 * always-required LessonSequence carries the full LESSONS shape (number, duration, slo, framework,
 * summaryTablePrompt, resourceLinks).
 */
function rawBundle(substrandId: string, titleDoc: string): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    META: {
      subject: `${MARK}Biology`,
      grade: GRADE,
      substrand_id: substrandId,
      substrand_name: `${MARK}${substrandId} name`,
      titleDoc: `${MARK}${titleDoc}`,
    },
    UNIT: null,
    LESSONS: [
      {
        number: 1,
        title: `${MARK}Lesson`,
        duration: '40 minutes',
        slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
        framework: [
          {
            phase: 'Predict Phase',
            learnerExperience: 'x',
            teacherMoves: 'y',
            sensemakingStrategy: 'z',
            formativeAssessment: 'w',
          },
        ],
        summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
        resourceLinks: minimalResourceLinks(),
      },
    ],
    FINAL_EXPLANATION: null,
    SUMMARY_TABLE: null,
  }
}

const item = (name: string, raw: Record<string, unknown>): IngestItem => ({
  name,
  extract: () => raw,
})

beforeAll(async () => {
  payload = await getPayload({ config })
  await purgeMarked(payload, MARK_BASE)
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Biology` },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: GRADE },
    overrideAccess: true,
  })
}, 60_000)

afterAll(async () => {
  if (payload) await purgeMarked(payload, MARK)
})

/** All versions of a plan, oldest first, as {semver}. */
async function versionsOf(planId: number): Promise<string[]> {
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: planId } },
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs.map((d) => (d as { semver?: string }).semver ?? '')
}

async function officialOf(planId: number): Promise<number | null> {
  const plan = await payload.findByID({
    collection: 'lesson-plans',
    id: planId,
    depth: 0,
    overrideAccess: true,
  })
  return relId((plan as { officialVersion?: unknown }).officialVersion)
}

describe('re-ingest (SPEC §7)', () => {
  it('first upload creates a new plan at 1.0.0 Official', async () => {
    const [r] = await ingestItems(payload, [item('a.json', rawBundle('97.1', 'First'))])
    expect(r.action).toBe('created')
    expect(r.semver).toBe('1.0.0')
    expect(r.official).toBe(true)
    expect(await officialOf(r.id)).not.toBeNull()
  })

  it('a NEW plan pre-warms its Official artifacts (docx+pdf jobs enqueued in the ingest transaction)', async () => {
    const [r] = await ingestItems(payload, [item('pw.json', rawBundle('97.6', 'Prewarm'))])
    expect(r.action).toBe('created')
    const versionId = await officialOf(r.id)
    expect(versionId).not.toBeNull()
    expect(await enqueuedKindsFor(payload, versionId as number)).toEqual(new Set(['docx', 'pdf']))
  })

  it('re-upload of the same sub-strand attaches as 2.0.0, Not Official, Official pointer unmoved', async () => {
    const planId = (await ingestItems(payload, [item('b1.json', rawBundle('97.2', 'V1'))]))[0].id
    const officialBefore = await officialOf(planId)

    const [r2] = await ingestItems(payload, [item('b2.json', rawBundle('97.2', 'V2 revised'))])

    expect(r2.action).toBe('revised')
    expect(r2.id).toBe(planId) // same plan, not a duplicate
    expect(r2.semver).toBe('2.0.0')
    expect(r2.official).toBe(false)
    expect(await versionsOf(planId)).toEqual(['1.0.0', '2.0.0']) // old version retained
    expect(await officialOf(planId)).toBe(officialBefore) // pointer NOT moved

    // A third upload majors again.
    const [r3] = await ingestItems(payload, [item('b3.json', rawBundle('97.2', 'V3'))])
    expect(r3.semver).toBe('3.0.0')
    expect(await officialOf(planId)).toBe(officialBefore) // still unmoved
  })

  it('a batch with two files for the SAME sub-strand fails pre-flight (writes nothing)', async () => {
    await expect(
      ingestItems(payload, [
        item('dup1.json', rawBundle('97.3', 'D1')),
        item('dup2.json', rawBundle('97.3', 'D2')),
      ]),
    ).rejects.toThrow(/duplicate/i)
    // Nothing was written for 97.3.
    const { totalDocs } = await payload.count({
      collection: 'lesson-bundle-versions',
      where: { 'meta.substrand_id': { equals: '97.3' } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('empty substrand_id always creates a new plan (cannot dedupe)', async () => {
    const a = (await ingestItems(payload, [item('e1.json', rawBundle('', 'No id one'))]))[0]
    const b = (await ingestItems(payload, [item('e2.json', rawBundle('', 'No id two'))]))[0]
    expect(a.action).toBe('created')
    expect(b.action).toBe('created')
    expect(a.id).not.toBe(b.id) // two distinct plans, no false match
  })

  it('ambiguous match (two plans share a sub-strand) fails pre-flight', async () => {
    // Force the legacy-duplicate state directly: two plans, same (subjectGrade, substrand_id).
    const { docs: sgs } = await payload.find({
      collection: 'subject-grades',
      where: { grade: { equals: GRADE } },
      overrideAccess: true,
      limit: 1,
    })
    const sgId = sgs[0].id
    for (const t of ['dupA', 'dupB']) {
      const plan = await payload.create({
        collection: 'lesson-plans',
        data: { title: `${MARK}${t}`, subjectGrade: sgId },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: plan.id,
          subjectGrade: sgId,
          semver: '1.0.0',
          title: `${MARK}${t} v1`,
          meta: { subject: `${MARK}Biology`, grade: GRADE, substrand_id: '97.9' },
          // A direct Local-API create bypasses ingest, so apply its external-map → child-rows
          // conversion; the generatable hook validates the stored five-row form.
          lessons: rawToBundle(rawBundle('97.9', 't') as never).lessons,
        } as never,
        overrideAccess: true,
      })
    }
    await expect(
      ingestItems(payload, [item('ambig.json', rawBundle('97.9', 'Ambiguous'))]),
    ).rejects.toThrow(/matches 2 existing/i)
  })
})

describe('partial web ingest', () => {
  it('re-uploading a corrected batch skips previous imports and then becomes a successful no-op', async () => {
    const first = rawBundle('97.90', 'Unchanged first')
    const links = (first.LESSONS as { resourceLinks: Record<string, unknown> }[])[0].resourceLinks
    ;(links.predict as Record<string, unknown>).video = null
    const last = rawBundle('97.91', 'Unchanged last')
    const fixed = rawBundle('97.92', 'Fixed file')
    const initial = await ingestUploadItems(payload, [
      item('first.json', first),
      item('fixed.json', {}),
      item('last.json', last),
    ])
    expect(initial.bundles).toHaveLength(2)
    expect(initial.rejected).toHaveLength(1)
    const files = [item('first.json', first), item('fixed.json', fixed), item('last.json', last)]
    const corrected = await ingestUploadItems(payload, files)
    expect(corrected.bundles.map((r) => r.file)).toEqual(['fixed.json'])
    expect(corrected.rejected).toEqual([])
    expect(corrected.skipped).toEqual([
      { file: 'first.json', error: 'Unchanged — matches latest saved version 1.0.0' },
      { file: 'last.json', error: 'Unchanged — matches latest saved version 1.0.0' },
    ])
    const before = await payload.count({ collection: 'lesson-bundle-versions' })
    const repeated = await ingestUploadItems(payload, files)
    expect(repeated.bundles).toEqual([])
    expect(repeated.rejected).toEqual([])
    expect(repeated.skipped).toHaveLength(3)
    expect(await payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
    for (const result of [...initial.bundles, ...corrected.bundles]) {
      expect(await versionsOf(result.id)).toEqual(['1.0.0'])
    }
  })

  it('compares the latest numeric version, including Not Official content, and retains CLI revisions', async () => {
    const original = rawBundle('97.93', 'Latest version')
    const [plan] = await ingestItems(payload, [item('latest.json', original)])
    // Include 2.0.0 so a lexical sort would incorrectly choose it over 10.0.0.
    await ingestItems(payload, [item('latest.json', original)])
    const changed = rawBundle('97.93', 'Latest version')
    ;(changed.LESSONS as Record<string, unknown>[])[0].overview = 'Changed prose'
    await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(changed as never),
        lessonPlan: plan.id,
        subjectGrade: plan.subjectGrade,
        semver: '10.0.0',
      } as never,
    })
    const same = await ingestUploadItems(payload, [item('latest.json', changed)])
    expect(same.bundles).toEqual([])
    expect(same.skipped[0].error).toContain('10.0.0')
    const revision = await ingestUploadItems(payload, [item('latest.json', original)])
    expect(revision.bundles[0]).toMatchObject({
      action: 'revised',
      semver: '11.0.0',
      official: false,
    })
    const [cli] = await ingestItems(payload, [item('latest.json', original)])
    expect(cli.semver).toBe('12.0.0')
    expect(await versionsOf(plan.id)).toEqual(['1.0.0', '2.0.0', '10.0.0', '11.0.0', '12.0.0'])
    const official = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: (await officialOf(plan.id))!,
    })
    expect(official.semver).toBe('1.0.0')
  })

  it('serializes concurrent identical web imports without making an extra version', async () => {
    const raw = rawBundle('97.94', 'Concurrent same file')
    const reports = await Promise.all([
      ingestUploadItems(payload, [item('same.json', raw)]),
      ingestUploadItems(payload, [item('same.json', raw)]),
    ])
    const imported = reports.flatMap((r) => r.bundles)
    expect(imported).toHaveLength(1)
    expect(reports.flatMap((r) => r.skipped)).toHaveLength(1)
    expect(await versionsOf(imported[0].id)).toEqual(['1.0.0'])
  })

  it('imports all valid files around parse, contract and taxonomy failures', async () => {
    const noTaxonomy = rawBundle('97.81', 'Unknown subject')
    ;(noTaxonomy.META as Record<string, unknown>).subject = 'Missing subject for ZIP test'
    const noGrade = rawBundle('97.86', 'Missing grade')
    ;(noGrade.META as Record<string, unknown>).grade = GRADE + 1
    const drift = rawBundle('97.82', 'Contract failure')
    drift.schemaVersion = 'invalid'
    const result = await ingestUploadItems(payload, [
      item('zip/first.json', rawBundle('97.80', 'First valid')),
      {
        name: 'zip/broken.json',
        extract: () => {
          throw new Error('Malformed JSON')
        },
      },
      item('zip/taxonomy.json', noTaxonomy),
      item('zip/grade.json', noGrade),
      item('zip/contract.json', drift),
      item('zip/last.json', rawBundle('97.83', 'Last valid')),
    ])
    expect(result.bundles.map((r) => r.file)).toEqual(['zip/first.json', 'zip/last.json'])
    expect(result.rejected.map((r) => r.file)).toEqual([
      'zip/broken.json',
      'zip/taxonomy.json',
      'zip/grade.json',
      'zip/contract.json',
    ])
    expect(result.rejected.find((r) => r.file === 'zip/taxonomy.json')?.error).toContain(
      'Manage → Subjects and grades',
    )
    expect(result.rejected.find((r) => r.file === 'zip/grade.json')?.error).toContain(
      'Manage → Subjects and grades → Subject grades',
    )
    expect(result.rejected.find((r) => r.file === 'zip/grade.json')?.error).toMatch(
      /^No subject grade for/,
    )
    for (const r of result.bundles) expect(await versionsOf(r.id)).toEqual(['1.0.0'])
  })

  it('rejects all files sharing an identity and imports unrelated files', async () => {
    const result = await ingestUploadItems(payload, [
      item('a.json', rawBundle('97.84', 'Duplicate A')),
      item('b.json', rawBundle('97.84', 'Duplicate B')),
      item('c.json', rawBundle('97.84', 'Duplicate C')),
      item('good.json', rawBundle('97.85', 'Independent')),
    ])
    expect(result.bundles.map((r) => r.file)).toEqual(['good.json'])
    expect(result.rejected.map((r) => r.file).sort()).toEqual(['a.json', 'b.json', 'c.json'])
  })

  it('aborts before writing when a database lookup fails after another valid file', async () => {
    const before = await payload.count({ collection: 'lesson-bundle-versions' })
    const original = payload.find.bind(payload)
    const lookup = vi
      .spyOn(payload, 'find')
      .mockImplementationOnce(original) // Subject
      .mockImplementationOnce(original) // Subject-grade
      .mockImplementationOnce(original) // First file's plan lookup
      .mockRejectedValueOnce(new Error('Database lookup unavailable')) // Second file; taxonomy cached
    try {
      await expect(
        ingestUploadItems(payload, [
          item('first.json', rawBundle('97.86', 'Prepared but not written')),
          item('second.json', rawBundle('97.87', 'Database failure')),
        ]),
      ).rejects.toThrow('Database lookup unavailable')
    } finally {
      lookup.mockRestore()
    }
    expect(await payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
  })

  it('reports all-invalid input without creating any versions', async () => {
    const before = await payload.count({ collection: 'lesson-bundle-versions' })
    const report = await ingestUploadItems(payload, [item('bad.json', {})])
    expect(report.bundles).toEqual([])
    expect(report.rejected).toHaveLength(1)
    expect(await payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
  })
})
