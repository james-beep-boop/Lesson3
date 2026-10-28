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
  createUserVerified,
  deleteUserFixture,
  minimalResourceLinks,
  purgeMarked,
} from '../helpers/fixtures.js'
import { sql } from '@payloadcms/db-postgres'
import { drizzleOf } from '../helpers/db.js'
import {
  up as backfillReleases,
  down as retainReleaseAncestry,
} from '../../src/migrations/20261019_120000_release_ancestry.js'
import { planCombine } from '../../src/lib/combine/engine.js'
import { findCommonAncestor } from '../../src/lib/combine/ancestry.js'
import { applyCapture, asRows } from '../../src/lib/editRecovery/projection.js'
import type { PayloadRequest } from 'payload'
import { relId } from '../../src/lib/relId.js'

let payload: Payload
let subjectId: number
const GRADE = 10 // a grade this suite owns, distinct from the shared fixture's 12/11

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
  subjectId = subject.id
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

  it.each(['atomic CLI', 'confirmed upload'] as const)(
    'loads ancestry once for a multi-plan revision through %s',
    async (entry) => {
      const prefix = entry === 'atomic CLI' ? '97.211' : '97.212'
      const raws = [rawBundle(`${prefix}.a`, 'Batch A'), rawBundle(`${prefix}.b`, 'Batch B')]
      const plans = await ingestItems(
        payload,
        raws.map((raw, i) => item(`batch-${i}.json`, raw)),
      )
      const firstIds = await Promise.all(plans.map((plan) => officialOf(plan.id)))
      await ingestItems(payload, [item('batch-a-second.json', raws[0])])
      const second = (
        await payload.find({
          collection: 'lesson-bundle-versions',
          where: {
            and: [{ lessonPlan: { equals: plans[0].id } }, { semver: { equals: '2.0.0' } }],
          },
          depth: 0,
        })
      ).docs[0]
      const predecessors = [second.id, firstIds[1]!]
      for (const [i, plan] of plans.entries()) {
        await payload.create({
          collection: 'lesson-bundle-versions',
          data: {
            ...rawToBundle(raws[i] as never),
            lessonPlan: plan.id,
            subjectGrade: plan.subjectGrade,
            semver: i === 0 ? '2.0.9' : '1.0.9',
            sourceVersion: predecessors[i],
          } as never,
        })
      }
      const incoming = raws.map((raw, i) => {
        const changed = structuredClone(raw)
        ;(changed.LESSONS as Record<string, unknown>[])[0].overview = 'New release prose'
        return item(`batch-${i}.json`, changed)
      })
      const find = payload.find.bind(payload)
      const ancestryReads: { transactionID: unknown; user: unknown }[] = []
      const spy = vi.spyOn(payload, 'find').mockImplementation(((
        args: Parameters<Payload['find']>[0],
      ) => {
        if (
          args.collection === 'lesson-bundle-versions' &&
          args.select &&
          'author' in args.select &&
          'sourceVersion' in args.select &&
          'mergedFrom' in args.select &&
          'meta' in args.select
        ) {
          ancestryReads.push({ transactionID: args.req?.transactionID, user: args.req?.user })
        }
        return find(args)
      }) as typeof payload.find)
      try {
        const results =
          entry === 'atomic CLI'
            ? await ingestItems(payload, incoming)
            : await (async () => {
                const preview = await ingestUploadItems(payload, incoming)
                expect(preview.needsConfirmation).toBe(true)
                expect(ancestryReads).toHaveLength(0)
                return (await ingestUploadItems(payload, incoming, undefined, preview.previewToken))
                  .bundles
              })()
        expect(results.map((r) => [r.id, r.semver, r.official])).toEqual([
          [plans[0].id, '3.0.0', entry === 'confirmed upload'],
          [plans[1].id, '2.0.0', entry === 'confirmed upload'],
        ])
        if (entry === 'confirmed upload') {
          const repeated = await ingestUploadItems(payload, incoming)
          expect(repeated.skipped).toHaveLength(2)
          expect(repeated.bundles).toEqual([])
        }
        for (const [i, result] of results.entries()) {
          const version = (
            await payload.find({
              collection: 'lesson-bundle-versions',
              where: {
                and: [{ lessonPlan: { equals: result.id } }, { semver: { equals: result.semver } }],
              },
              depth: 0,
            })
          ).docs[0]
          expect(relId(version.sourceVersion)).toBe(predecessors[i])
          expect(version.lineage).toEqual(i === 0 ? [firstIds[0], second.id] : [firstIds[1]])
          expect(await officialOf(result.id)).toBe(
            entry === 'confirmed upload' ? version.id : firstIds[i],
          )
        }
        expect(ancestryReads).toHaveLength(1)
        expect(ancestryReads[0].transactionID).toBeDefined()
        expect(ancestryReads[0].user).toBeNull()
      } finally {
        spy.mockRestore()
      }
    },
  )

  it('links releases past teacher patches and combines teacher prose with new release resources', async () => {
    const raw = rawBundle('97.201', 'Release ancestry')
    const [{ id: planId }] = await ingestItems(payload, [item('release1.json', raw)])
    const firstId = (await officialOf(planId))!
    const first = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: firstId,
      depth: 0,
    })
    const teacher = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(raw as never),
        lessonPlan: planId,
        subjectGrade: relId(first.subjectGrade),
        semver: '1.0.9',
        sourceVersion: firstId,
        lessons: asRows(rawToBundle(raw as never).lessons).map((l) => ({
          ...l,
          teacherReflection: 'Teacher reflection.',
        })),
      } as never,
    })
    const nextRaw = structuredClone(raw)
    const lesson = (nextRaw.LESSONS as Record<string, unknown>[])[0]
    ;(lesson.slo as Record<string, string>).purpose = 'Updated release purpose.'
    ;(lesson.resourceLinks as Record<string, Record<string, unknown>>).predict.fallback_search_url =
      'http://ares.local/modules/new-release'
    await ingestItems(payload, [item('release2.json', nextRaw)])
    const { docs } = await payload.find({
      collection: 'lesson-bundle-versions',
      where: { and: [{ lessonPlan: { equals: planId } }, { semver: { equals: '2.0.0' } }] },
      depth: 0,
    })
    const next = docs[0]
    expect(relId(next.sourceVersion)).toBe(firstId)
    expect(next.lineage).toEqual([firstId])
    expect(await officialOf(planId)).toBe(firstId)
    // Real lookup with access, not a manually supplied engine base.
    const user = await createUserVerified(payload, {
      name: `${MARK}Release reader`,
      email: `${MARK}release-reader@example.com`,
      password: 'ReleaseReader-Str0ng!',
      roles: ['siteAdmin'],
    })
    const base = await findCommonAncestor({ payload } as PayloadRequest, user, teacher, next)
    expect(base?.id).toBe(firstId)
    const combined = planCombine({ a: teacher, b: next, base })
    expect(combined).toMatchObject({ ok: true, ancestry: 'three-way', start: 'b', conflicts: [] })
    if (!combined.ok) throw new Error(JSON.stringify(combined))
    const applied = applyCapture(next as unknown as Record<string, unknown>, combined.overlay)
      .doc as unknown as typeof next
    expect(applied.lessons![0].teacherReflection).toBe('Teacher reflection.')
    expect(applied.lessons![0].slo!.purpose).toBe('Updated release purpose.')
    expect(applied.lessons![0].resourceLinks).toEqual(next.lessons![0].resourceLinks)
    // A teacher patch on the new release must not become the next ingest's predecessor.
    await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(nextRaw as never),
        lessonPlan: planId,
        subjectGrade: relId(first.subjectGrade),
        semver: '2.0.1',
        sourceVersion: next.id,
      } as never,
    })
    const skipped = await ingestUploadItems(payload, [item('unchanged.json', nextRaw)])
    expect(skipped.skipped).toHaveLength(1)
    expect(skipped.bundles).toHaveLength(0)
    await ingestItems(payload, [item('release3.json', nextRaw)])
    const third = (
      await payload.find({
        collection: 'lesson-bundle-versions',
        where: {
          and: [{ lessonPlan: { equals: planId } }, { semver: { equals: '3.0.0' } }],
        },
        depth: 0,
      })
    ).docs[0]
    expect(relId(third.sourceVersion)).toBe(next.id)
    expect(third.lineage).toEqual([firstId, next.id])
    expect(await officialOf(planId)).toBe(firstId)
    await deleteUserFixture(payload, user.id)
  })

  it('the real migration repairs legacy releases and teacher descendants without changing snapshots', async () => {
    const raw = rawBundle('97.202', 'Legacy ancestry')
    const [{ id: planId }] = await ingestItems(payload, [item('legacy1.json', raw)])
    const first = (await officialOf(planId))!
    await ingestItems(payload, [item('legacy2.json', raw)])
    const second = (
      await payload.find({
        collection: 'lesson-bundle-versions',
        where: {
          and: [{ lessonPlan: { equals: planId } }, { semver: { equals: '2.0.0' } }],
        },
        depth: 0,
      })
    ).docs[0]
    const teacher = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(raw as never),
        lessonPlan: planId,
        subjectGrade: relId(second.subjectGrade),
        semver: '2.0.1',
        sourceVersion: second.id,
      } as never,
    })
    // Simulate the pre-change database: unlinked second release, descendant retaining a deleted id.
    const db = drizzleOf(payload)
    await db.execute(
      sql`UPDATE lesson_bundle_versions SET source_version_id = NULL WHERE id = ${second.id}`,
    )
    await db.execute(
      sql`DELETE FROM lesson_bundle_versions_numbers WHERE parent_id IN (${second.id}, ${teacher.id}) AND path = 'lineage'`,
    )
    await db.execute(sql`INSERT INTO lesson_bundle_versions_numbers (number, "order", parent_id, path)
      VALUES (${second.id}, 1, ${teacher.id}, 'lineage'), (999999, 2, ${teacher.id}, 'lineage')`)
    const read = (id: number) =>
      payload.findByID({ collection: 'lesson-bundle-versions', id, depth: 0 })
    const before = await read(teacher.id)
    const releaseBefore = await read(second.id)
    const args = { db, payload } as unknown as Parameters<typeof backfillReleases>[0]
    await backfillReleases(args)
    expect(relId((await read(second.id)).sourceVersion)).toBe(first)
    const after = await read(teacher.id)
    expect(after.lineage).toEqual([first, second.id, 999999])
    expect({ ...after, lineage: null }).toEqual({ ...before, lineage: null })
    expect(await officialOf(planId)).toBe(first)
    const releaseAfter = await read(second.id)
    expect({ ...releaseAfter, sourceVersion: null, lineage: null }).toEqual({
      ...releaseBefore,
      sourceVersion: null,
      lineage: null,
    })
    await backfillReleases(args)
    expect(await read(second.id)).toEqual(releaseAfter)
    expect(await read(teacher.id)).toEqual(after)
    // Batch rollback must succeed without erasing provenance subsequent saves may depend on.
    await expect(retainReleaseAncestry()).resolves.toBeUndefined()
    expect(await read(second.id)).toEqual(releaseAfter)
    expect(await read(teacher.id)).toEqual(after)
    expect(await officialOf(planId)).toBe(first)
  })

  it('does not re-import the latest ARES release after a teacher changes its prose', async () => {
    const raw = rawBundle('97.301', 'Repeat behind teacher save')
    const [plan] = await ingestItems(payload, [item('release.json', raw)])
    await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(raw as never),
        lessonPlan: plan.id,
        subjectGrade: plan.subjectGrade,
        semver: '1.0.1',
        lessons: asRows(rawToBundle(raw as never).lessons).map((l) => ({
          ...l,
          teacherReflection: 'My notes',
        })),
      } as never,
    })
    const report = await ingestUploadItems(payload, [item('release.json', raw)])
    expect(report.bundles).toEqual([])
    expect(report.skipped).toHaveLength(1)
    expect(await versionsOf(plan.id)).toEqual(['1.0.0', '1.0.1'])
  })

  it('a teacher save with matching incoming prose cannot suppress an ARES release', async () => {
    const raw = rawBundle('97.302', 'Teacher coincidence')
    const [plan] = await ingestItems(payload, [item('release.json', raw)])
    const changed = structuredClone(raw)
    ;(changed.LESSONS as Record<string, unknown>[])[0].overview = 'New release prose'
    await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(changed as never),
        lessonPlan: plan.id,
        subjectGrade: plan.subjectGrade,
        semver: '1.0.1',
      } as never,
    })
    const report = await ingestUploadItems(payload, [item('release.json', changed)])
    // Preview is read-only, but must identify a release awaiting confirmation, not skip the file.
    expect(report.skipped).toEqual([])
    expect(report.needsConfirmation || report.bundles.length === 1).toBe(true)
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
      // Scoped to this suite's subject: an in-range grade is not unique in a shared database.
      where: { and: [{ subject: { equals: subjectId } }, { grade: { equals: GRADE } }] },
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
      { file: 'first.json', error: 'Unchanged — ARES release already here, version 1.0.0' },
      { file: 'last.json', error: 'Unchanged — ARES release already here, version 1.0.0' },
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

  it('allocates beyond teacher versions without using them for duplicate detection, and retains dev CLI revisions', async () => {
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
    expect(same.skipped).toEqual([])
    expect(same.needsConfirmation).toBe(true)
    const confirmed = await ingestUploadItems(
      payload,
      [item('latest.json', changed)],
      undefined,
      same.previewToken,
    )
    expect(confirmed.bundles[0].semver).toBe('11.0.0')
    const preview = await ingestUploadItems(payload, [item('latest.json', original)])
    expect(preview.official?.[0].olderContent).toBe('2.0.0')
    const revision = await ingestUploadItems(
      payload,
      [item('latest.json', original)],
      undefined,
      preview.previewToken,
    )
    expect(revision.bundles[0]).toMatchObject({
      action: 'revised',
      semver: '12.0.0',
      official: true,
    })
    const [cli] = await ingestItems(payload, [item('latest.json', original)])
    expect(cli.semver).toBe('13.0.0')
    expect(await versionsOf(plan.id)).toEqual([
      '1.0.0',
      '2.0.0',
      '10.0.0',
      '11.0.0',
      '12.0.0',
      '13.0.0',
    ])
    const official = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: (await officialOf(plan.id))!,
    })
    expect(official.semver).toBe('12.0.0')
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
    const files = [
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
    ]
    // Missing taxonomy (SPEC §7, amended 2026-10-21): the first round asks and writes nothing,
    // listing both missing items beside the other rejections.
    const before = await payload.count({ collection: 'lesson-bundle-versions' })
    const asked = await ingestUploadItems(payload, files)
    expect(asked.needsConfirmation).toBe(true)
    expect(asked.bundles).toEqual([])
    expect(asked.missing.map((m) => [m.subject, m.grade, m.newSubject, m.files])).toEqual([
      ['Missing subject for ZIP test', GRADE, true, ['zip/taxonomy.json']],
      [`${MARK}Biology`, GRADE + 1, false, ['zip/grade.json']],
    ])
    expect(await payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)

    // Declining both imports the valid files and rejects the two that needed taxonomy.
    const result = await ingestUploadItems(payload, files, [])
    expect(result.bundles.map((r) => r.file)).toEqual(['zip/first.json', 'zip/last.json'])
    expect(result.created).toEqual([])
    expect(result.rejected.map((r) => r.file)).toEqual([
      'zip/broken.json',
      'zip/contract.json',
      'zip/taxonomy.json',
      'zip/grade.json',
    ])
    expect(result.rejected.find((r) => r.file === 'zip/grade.json')?.error).toBe(
      `Not created: you chose not to create ${MARK}Biology — Grade ${GRADE + 1}.`,
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

describe('ARES releases with locked confirmation', () => {
  const releaseItem = (id: string, text: string, releaseId: string, date: string): IngestItem => ({
    ...item('lesson.json', rawBundle(id, text)),
    setId: 'set',
    release: { id: releaseId, date },
  })
  const upload = async (files: IngestItem[]) => {
    const first = await ingestUploadItems(payload, files)
    return first.needsConfirmation
      ? ingestUploadItems(payload, files, undefined, first.previewToken)
      : first
  }
  const plan = (id: number) => payload.findByID({ collection: 'lesson-plans', id, depth: 0 })
  it('January may restore November content, then an old stick cannot replace it', async () => {
    const nov = releaseItem('97.401', 'A', 'Nov', '2026-11-14')
    const first = await upload([nov])
    const id = first.bundles[0].id
    const originalOfficial = await officialOf(id)
    const initial = await plan(id)
    expect(initial.officialChangedAt).toBeTruthy()
    expect(initial.officialChangedFrom).toBeNull()
    await upload([releaseItem('97.401', 'B', 'Dec', '2026-12-02')])
    const secondOfficial = await officialOf(id)
    expect(secondOfficial).not.toBe(originalOfficial)
    const jan = releaseItem('97.401', 'A', 'Jan', '2027-01-01')
    const preview = await ingestUploadItems(payload, [jan])
    expect(preview.official?.[0]).toMatchObject({ willMove: true, olderContent: null })
    const imported = await ingestUploadItems(payload, [jan], undefined, preview.previewToken)
    expect(imported.bundles[0]).toMatchObject({ semver: '3.0.0', official: true })
    const after = await plan(id)
    expect(relId(after.officialChangedFrom)).toBe(secondOfficial)
    expect(after.officialChangedBy).toBeNull()
    const version = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: (await officialOf(id))!,
      depth: 0,
    })
    expect(version).toMatchObject({ aresReleaseId: 'Jan', aresReleaseDate: '2027-01-01' })
    expect(await enqueuedKindsFor(payload, version.id)).toEqual(new Set(['docx', 'pdf']))
    const old = await upload([releaseItem('97.401', 'old', 'Oct', '2026-10-01')])
    expect(old.olderNotImported).toHaveLength(1)
    expect(await plan(id)).toEqual(after)
    expect(await versionsOf(id)).toEqual(['1.0.0', '2.0.0', '3.0.0'])
    expect((await upload([jan])).alreadyHere).toHaveLength(1)
  })
  it('a conflicting release id refuses its entire set, while unrelated sets still import', async () => {
    await upload([releaseItem('97.402', 'A', 'Nov', '2026-11-14')])
    const result = await upload([
      releaseItem('97.402', 'conflict', 'Nov', '2026-11-14'),
      releaseItem('97.403', 'peer', 'Nov', '2026-11-14'),
      {
        ...releaseItem('97.404', 'other set', 'Other', '2026-11-14'),
        name: 'other.json',
        setId: 'other',
      },
    ])
    expect(result.setRefused).toHaveLength(1)
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0].file).toBe('other.json')
    expect(
      (
        await payload.count({
          collection: 'lesson-bundle-versions',
          where: { 'meta.substrand_id': { equals: '97.403' } },
        })
      ).totalDocs,
    ).toBe(0)
  })
  it('waits behind a teacher Official; a later administrator move records its actual time and author', async () => {
    const first = await upload([releaseItem('97.405', 'A', 'Nov', '2026-11-14')])
    const id = first.bundles[0].id
    const teacher = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(rawBundle('97.405', 'teacher') as never),
        lessonPlan: id,
        subjectGrade: first.bundles[0].subjectGrade,
        semver: '1.0.1',
      } as never,
    })
    await payload.update({ collection: 'lesson-plans', id, data: { officialVersion: teacher.id } })
    const next = await upload([releaseItem('97.405', 'B', 'Dec', '2026-12-02')])
    expect(next.bundles[0]).toMatchObject({ official: false, outcome: 'officialKept' })
    expect(await officialOf(id)).toBe(teacher.id)
    const newRelease = (
      await payload.find({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { equals: id } },
        sort: '-id',
        depth: 0,
      })
    ).docs[0]
    const user = await createUserVerified(payload, {
      name: `${MARK}Release admin`,
      email: `${MARK}release-admin@example.com`,
      password: 'ReleaseAdmin-Str0ng!',
      roles: ['siteAdmin'],
    })
    await payload.update({
      collection: 'lesson-plans',
      id,
      data: { officialVersion: newRelease.id },
      user,
    })
    const stamped = await plan(id)
    expect(relId(stamped.officialChangedBy)).toBe(user.id)
    expect(relId(stamped.officialChangedFrom)).toBe(teacher.id)
    expect(Date.parse(stamped.officialChangedAt!)).toBeGreaterThanOrEqual(
      Date.parse(newRelease.createdAt),
    )
    // A forged audit record is ignored even through the trusted API.
    await payload.update({
      collection: 'lesson-plans',
      id,
      data: { officialChangedAt: '2000-01-01T00:00:00Z', officialChangedBy: null },
    })
    expect((await plan(id)).officialChangedAt).toBe(stamped.officialChangedAt)
    await deleteUserFixture(payload, user.id)
  })
  it('rejects a stale token after an Official change and writes no release', async () => {
    const first = await upload([releaseItem('97.406', 'A', 'Nov', '2026-11-14')])
    const id = first.bundles[0].id
    const files = [releaseItem('97.406', 'B', 'Dec', '2026-12-02')]
    const preview = await ingestUploadItems(payload, files)
    const teacher = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(rawBundle('97.406', 'teacher') as never),
        lessonPlan: id,
        subjectGrade: first.bundles[0].subjectGrade,
        semver: '1.0.1',
      } as never,
    })
    await payload.update({ collection: 'lesson-plans', id, data: { officialVersion: teacher.id } })
    const stale = await ingestUploadItems(payload, files, undefined, preview.previewToken)
    expect(stale).toMatchObject({ needsConfirmation: true, confirmationChanged: true, bundles: [] })
    expect(stale.previewToken).not.toBe(preview.previewToken)
    expect(await versionsOf(id)).toEqual(['1.0.0', '1.0.1'])
  })
  it('rechecks after locks: a waiting preview cannot silently become an Official move', async () => {
    const first = await upload([releaseItem('97.407', 'A', 'Nov', '2026-11-14')])
    const id = first.bundles[0].id
    const release = await officialOf(id)
    const teacher = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(rawBundle('97.407', 'Teacher') as never),
        lessonPlan: id,
        subjectGrade: first.bundles[0].subjectGrade,
        semver: '1.0.1',
      } as never,
    })
    await payload.update({ collection: 'lesson-plans', id, data: { officialVersion: teacher.id } })
    const originalFind = payload.find.bind(payload)
    let changed = false
    const spy = vi.spyOn(payload, 'find').mockImplementation((async (args: {
      collection: string
      select?: Record<string, boolean>
      req?: Partial<PayloadRequest>
    }) => {
      const result = await originalFind(args as never)
      if (
        !changed &&
        args.collection === 'lesson-bundle-versions' &&
        args.select?.aresReleaseId &&
        !args.req?.transactionID
      ) {
        changed = true
        // The read-only preview has already read the teacher pointer. Before writePrepared can
        // take its locks, another administrator restores the ARES Official.
        await payload.update({ collection: 'lesson-plans', id, data: { officialVersion: release } })
      }
      return result
    }) as never)
    try {
      const result = await ingestUploadItems(payload, [
        releaseItem('97.407', 'B', 'Dec', '2026-12-02'),
      ])
      expect(changed).toBe(true)
      expect(result).toMatchObject({
        needsConfirmation: true,
        confirmationChanged: true,
        bundles: [],
      })
      expect(result.official?.[0].willMove).toBe(true)
      expect(await versionsOf(id)).toEqual(['1.0.0', '1.0.1'])
    } finally {
      spy.mockRestore()
    }
  })
  it('rolls back a release, pointer, audit record and prewarm jobs together', async () => {
    const first = await upload([releaseItem('97.408', 'A', 'Nov', '2026-11-14')])
    const id = first.bundles[0].id
    const before = await plan(id)
    const files = [
      releaseItem('97.408', 'B', 'Dec', '2026-12-02'),
      { ...releaseItem('97.409', 'new', 'Dec', '2026-12-02'), name: 'last.json' },
    ]
    const preview = await ingestUploadItems(payload, files)
    const original = payload.create.bind(payload)
    const spy = vi
      .spyOn(payload, 'create')
      .mockImplementation(((args: { collection: string }) =>
        args.collection === 'lesson-plans'
          ? Promise.reject(new Error('last plan failed'))
          : original(args as never)) as never)
    try {
      await expect(
        ingestUploadItems(payload, files, undefined, preview.previewToken),
      ).rejects.toThrow('last plan failed')
    } finally {
      spy.mockRestore()
    }
    expect(await plan(id)).toEqual(before)
    expect(await versionsOf(id)).toEqual(['1.0.0'])
  })
  it('serializes simultaneous same-release and conflicting-release imports without partial writes', async () => {
    const files = [releaseItem('97.410', 'A', 'Nov', '2026-11-14')]
    const same = await Promise.all([upload(files), upload(files)])
    expect(same.flatMap((r) => r.bundles)).toHaveLength(1)
    expect(same.flatMap((r) => r.alreadyHere ?? [])).toHaveLength(1)
    const [left, right] = await Promise.all([
      upload([releaseItem('97.411', 'A', 'Nov', '2026-11-14')]),
      upload([releaseItem('97.411', 'B', 'Nov', '2026-11-14')]),
    ])
    expect([...left.bundles, ...right.bundles]).toHaveLength(1)
    expect([...(left.setRefused ?? []), ...(right.setRefused ?? [])]).toHaveLength(1)
  })
})

describe('release metadata cannot be copied or forged', () => {
  it('uses ingest context only, and clears it from the live request after each create', async () => {
    const files: IngestItem[] = [
      {
        ...item('provenance.json', rawBundle('97.501', 'Provenance')),
        release: { id: 'Nov', date: '2026-11-14' },
      },
    ]
    const result = await ingestUploadItems(payload, files)
    const plan = result.bundles[0]
    const original = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: (await officialOf(plan.id))!,
      depth: 0,
    })
    const copy = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...rawToBundle(rawBundle('97.501', 'Teacher') as never),
        lessonPlan: plan.id,
        subjectGrade: plan.subjectGrade,
        semver: '1.0.1',
        aresReleaseId: 'forged',
        aresReleaseDate: '2099-01-01',
      } as never,
    })
    expect(copy.aresReleaseId).toBeNull()
    expect(copy.aresReleaseDate).toBeNull()
    await payload.update({
      collection: 'lesson-bundle-versions',
      id: original.id,
      data: { aresReleaseId: 'forged', aresReleaseDate: '2099-01-01' },
    })
    const kept = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: original.id,
      depth: 0,
    })
    expect(kept).toMatchObject({ aresReleaseId: 'Nov', aresReleaseDate: '2026-11-14' })
  })
})
