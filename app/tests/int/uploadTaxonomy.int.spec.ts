/**
 * Upload-approved taxonomy creation (SPEC §7, amended 2026-10-21) — the two properties the wire tests
 * cannot reach: a failed write leaves no orphan Subject/SubjectGrade (creation shares the plans'
 * transaction), and two uploads approving the same new subject at once create it exactly once (the
 * `taxonomyCreate` advisory lock), instead of the second tripping the unique index.
 *
 * Drives `ingestUploadItems` directly with in-memory extract thunks. MARK-tagged; requires a DB.
 */
import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { ingestUploadItems, type IngestItem } from '../../src/ingest/index.js'
import { MARK, MARK_BASE, minimalResourceLinks, purgeMarked } from '../helpers/fixtures.js'

let payload: Payload

function rawBundle(substrandId: string, subject: string, grade: number): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    META: {
      subject,
      grade,
      substrand_id: substrandId,
      substrand_name: `${MARK}${substrandId} name`,
      titleDoc: `${MARK}Taxonomy ${substrandId}`,
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

const subjectsNamed = (name: string) =>
  payload.find({ collection: 'subjects', where: { name: { equals: name } }, depth: 0 })

beforeAll(async () => {
  payload = await getPayload({ config })
  await purgeMarked(payload, MARK_BASE)
}, 60_000)

afterAll(async () => {
  if (payload) await purgeMarked(payload, MARK)
})

describe('upload-approved taxonomy', () => {
  it('a failed write rolls back the subject and grade it created', async () => {
    const subject = `${MARK}Rollback`
    const files = [item('a.json', rawBundle('96.1', subject, 9))]
    const original = payload.create.bind(payload)
    const create = vi
      .spyOn(payload, 'create')
      .mockImplementation(((args: { collection: string }) =>
        args.collection === 'lesson-plans'
          ? Promise.reject(new Error('Plan write failed'))
          : original(args as never)) as never)
    try {
      await expect(ingestUploadItems(payload, files, [{ subject, grade: 9 }])).rejects.toThrow(
        'Plan write failed',
      )
      // The subject and grade were created before the plan write in the same transaction.
      expect(create.mock.calls.map(([a]) => (a as { collection: string }).collection)).toEqual([
        'subjects',
        'subject-grades',
        'lesson-plans',
      ])
    } finally {
      create.mockRestore()
    }
    expect((await subjectsNamed(subject)).totalDocs).toBe(0)
    expect(
      (
        await payload.count({
          collection: 'subject-grades',
          where: { displayName: { equals: `${subject} — Grade 9` } },
        })
      ).totalDocs,
    ).toBe(0)
  })

  it('two uploads approving the same new subject create it once', async () => {
    const subject = `${MARK}Concurrent`
    const approve = [{ subject, grade: 9 }]
    const reports = await Promise.all([
      ingestUploadItems(payload, [item('a.json', rawBundle('96.2', subject, 9))], approve),
      ingestUploadItems(payload, [item('b.json', rawBundle('96.3', subject, 9))], approve),
    ])
    expect(reports.flatMap((r) => r.bundles)).toHaveLength(2)
    // Exactly one of the two created it; the other found it under the lock.
    expect(reports.flatMap((r) => r.created)).toEqual([{ subject, grade: 9, newSubject: true }])
    const subjects = await subjectsNamed(subject)
    expect(subjects.totalDocs).toBe(1)
    const grades = await payload.find({
      collection: 'subject-grades',
      where: { subject: { equals: subjects.docs[0]!.id } },
      depth: 0,
    })
    expect(grades.docs.map((g) => g.grade)).toEqual([9])
    const plans = reports.flatMap((r) => r.bundles).map((b) => b.subjectGrade)
    expect(plans).toEqual([grades.docs[0]!.id, grades.docs[0]!.id])
  })

  it('refuses, rather than offers, a new subject name the approval parser would refuse', async () => {
    // Audit F-C40-002: preview offered a 201-character subject that confirmation then refused.
    const subject = `${MARK}${'L'.repeat(201 - MARK.length)}`
    expect(subject).toHaveLength(201)
    const report = await ingestUploadItems(payload, [
      item('long.json', rawBundle('96.9', subject, 9)),
    ])
    expect(report.missing, 'never offered for approval').toEqual([])
    expect(report.needsConfirmation).toBe(false)
    expect(report.rejected).toEqual([
      { file: 'long.json', error: expect.stringMatching(/longer than 200 characters/) },
    ])
    expect((await subjectsNamed(subject)).totalDocs).toBe(0)
  })

  it('refuses an approval the files do not need, even when nothing is missing', async () => {
    const subject = `${MARK}Existing`
    const created = await payload.create({
      collection: 'subjects',
      data: { name: subject },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'subject-grades',
      data: { subject: created.id, grade: 9 },
      overrideAccess: true,
    })
    const files = [item('a.json', rawBundle('96.4', subject, 9))]
    await expect(
      ingestUploadItems(payload, files, [{ subject: `${MARK}Unrelated`, grade: 9 }]),
    ).rejects.toThrow('not needed by these files')
    expect((await subjectsNamed(`${MARK}Unrelated`)).totalDocs).toBe(0)

    // An approval for an item that came to exist between the two rounds creates nothing and passes.
    const report = await ingestUploadItems(payload, files, [{ subject, grade: 9 }])
    expect(report.bundles).toHaveLength(1)
    expect(report.created).toEqual([])
  })

  /**
   * Codex review of PR #431: another upload creates the subject BETWEEN this file's own lookup and
   * pre-flight's all-subjects read. Forced by creating it inside that read. Before the fix, the file
   * was blocked as differing from itself "only in capitals or spacing" and the approved resubmission
   * got a 400 for an "unneeded" approval.
   */
  it.each([
    ['subject and grade', true],
    ['subject only', false],
  ])('a concurrent creation of the %s does not falsely reject the file', async (_, withGrade) => {
    const subject = `${MARK}Raced${withGrade ? 'Both' : 'Subject'}`
    const original = payload.find.bind(payload)
    let raced = false
    const find = vi.spyOn(payload, 'find').mockImplementation((async (args: {
      collection: string
      pagination?: boolean
    }) => {
      if (!raced && args.collection === 'subjects' && args.pagination === false) {
        raced = true
        const doc = await payload.create({
          collection: 'subjects',
          data: { name: subject },
          overrideAccess: true,
        })
        if (withGrade) {
          await payload.create({
            collection: 'subject-grades',
            data: { subject: doc.id, grade: 9 },
            overrideAccess: true,
          })
        }
      }
      return original(args as never)
    }) as never)
    let report: Awaited<ReturnType<typeof ingestUploadItems>>
    try {
      report = await ingestUploadItems(
        payload,
        [item('a.json', rawBundle(withGrade ? '96.5' : '96.6', subject, 9))],
        [{ subject, grade: 9 }],
      )
    } finally {
      find.mockRestore()
    }
    expect(raced).toBe(true)
    expect(report.rejected).toEqual([])
    expect(report.bundles).toHaveLength(1)
    expect(report.created).toEqual(withGrade ? [] : [{ subject, grade: 9, newSubject: false }])
    expect((await subjectsNamed(subject)).totalDocs).toBe(1)
  })
})
