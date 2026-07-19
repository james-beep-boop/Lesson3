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
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { ingestItems, type IngestItem } from '../../src/ingest/index.js'
import { MARK, MARK_BASE, enqueuedKindsFor, minimalResourceLinks, purgeMarked } from '../helpers/fixtures.js'
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

const item = (name: string, raw: Record<string, unknown>): IngestItem => ({ name, extract: () => raw })

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
  const plan = await payload.findByID({ collection: 'lesson-plans', id: planId, depth: 0, overrideAccess: true })
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
          lessons: rawBundle('97.9', 't').LESSONS,
        } as never,
        overrideAccess: true,
      })
    }
    await expect(
      ingestItems(payload, [item('ambig.json', rawBundle('97.9', 'Ambiguous'))]),
    ).rejects.toThrow(/matches 2 existing/i)
  })
})
