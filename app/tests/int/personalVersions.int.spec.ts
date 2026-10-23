/**
 * "My saved versions" (Proposal B, 2026-10-22) against a real database, through the PRODUCTION read
 * and row mapping (`listPersonalVersions`) with its exact `select` — Codex's condition on the plan.
 * Testing `canDeleteVersionDoc` with hand-built full documents would have missed the plan's P2: a
 * projection without `author` hides Delete on a teacher's own versions while administrators, who
 * pass on subject-grade alone, mask it.
 *
 *   P1  own versions only — another user's version in the same subject-grade is never listed
 *   P2  one Subject Administrator who administers B, edits A and has lost C: different actions in each
 *   P3  an own Official is listed, marked, not deletable, and still editable
 *   P4  a teacher with editing access may delete their own (the `author` projection, P2 of the review)
 *   P5  a Site Administrator sees their own saves, never the uploaded (authorless) versions
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  MARK,
  createUserVerified,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
} from '../helpers/fixtures.js'
import { listPersonalVersions } from '../../src/lib/personalVersions.js'
import type { LessonBundleVersion, SubjectGrade, User } from '../../src/payload-types.js'

let fx: RoleFixture
let sgB: SubjectGrade
let sgC: SubjectGrade
let planB: number
let planC: number
let admin: User

const req = () => ({ payload: fx.payload, transactionID: undefined }) as unknown as PayloadRequest

let semverSeq = 0
/** A saved version authored by `authorId`, written the way save-as-new stamps it (system path). */
const saveAs = async (
  authorId: number,
  planId: number,
  subjectGradeId: number,
): Promise<LessonBundleVersion> =>
  (await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: planId,
      subjectGrade: subjectGradeId,
      semver: `1.0.${++semverSeq}`,
      title: `${MARK}Personal v1.0.${semverSeq}`,
      author: authorId,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as LessonBundleVersion

const rowFor = async (user: User, id: number) =>
  (await listPersonalVersions(req(), user)).find((r) => r.id === id)

beforeAll(async () => {
  fx = await setupRoleFixture()
  const sg = (grade: number) =>
    fx.payload.create({
      collection: 'subject-grades',
      data: { subject: fx.subject.id, grade },
      overrideAccess: true,
    }) as Promise<SubjectGrade>
  sgB = await sg(10)
  sgC = await sg(11)
  const plan = async (subjectGradeId: number, name: string) =>
    (
      await fx.payload.create({
        collection: 'lesson-plans',
        data: { title: `${MARK}${name}`, subjectGrade: subjectGradeId },
        overrideAccess: true,
      })
    ).id
  planB = await plan(sgB.id, 'Plan B')
  planC = await plan(sgC.id, 'Plan C')
  // Administers B, edits A (the fixture's subject-grade). Holds nothing in C: their versions there
  // were saved while they could, and the grant has since gone — keeping B and A so Manage stays theirs.
  admin = await createUserVerified(fx.payload, {
    name: `${MARK}scopedAdmin`,
    email: `${MARK.toLowerCase()}scoped_admin@example.com`,
    password: fx.password,
    assignments: [
      { subjectGrade: sgB.id, role: 'subjectAdmin' },
      { subjectGrade: fx.subjectGrade.id, role: 'editor' },
    ],
  })
}, 60_000)

afterAll(async () => {
  await fx?.teardown()
})

describe('listPersonalVersions', () => {
  it('P1: lists only the caller’s own versions, newest first', async () => {
    const mine = await saveAs(admin.id, fx.plan.id, fx.subjectGrade.id)
    const theirs = await saveAs(fx.users.editor.id, fx.plan.id, fx.subjectGrade.id)
    const newer = await saveAs(admin.id, fx.plan.id, fx.subjectGrade.id)
    const ids = (await listPersonalVersions(req(), admin)).map((r) => r.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(mine.id))
    expect((await listPersonalVersions(req(), fx.users.editor)).map((r) => r.id)).not.toContain(
      mine.id,
    )
  })

  it('P2: a Subject Administrator’s actions differ by scope — administers B, edits A, lost C', async () => {
    const inA = await saveAs(admin.id, fx.plan.id, fx.subjectGrade.id)
    const inB = await saveAs(admin.id, planB, sgB.id)
    const inC = await saveAs(admin.id, planC, sgC.id)

    expect(await rowFor(admin, inA.id)).toMatchObject({
      subjectGradeId: fx.subjectGrade.id,
      official: 'no',
      officialVersionId: fx.version.id,
      canDelete: true,
      canEdit: true,
    })
    // B has no Official yet: not Official, deletable, editable, nothing to compare against.
    expect(await rowFor(admin, inB.id)).toMatchObject({
      official: 'no',
      officialVersionId: null,
      canDelete: true,
      canEdit: true,
    })
    // C: still their work, still readable, still listed — but nothing they may change.
    expect(await rowFor(admin, inC.id)).toMatchObject({
      subjectGradeId: sgC.id,
      official: 'no',
      canDelete: false,
      canEdit: false,
    })
  })

  it('P3: an own Official is listed and marked, never deletable, still editable', async () => {
    const official = await saveAs(admin.id, planB, sgB.id)
    await fx.payload.update({
      collection: 'lesson-plans',
      id: planB,
      data: { officialVersion: official.id },
      overrideAccess: true,
    })
    try {
      expect(await rowFor(admin, official.id)).toMatchObject({
        official: 'yes',
        canDelete: false,
        canEdit: true,
      })
    } finally {
      await fx.payload.update({
        collection: 'lesson-plans',
        id: planB,
        data: { officialVersion: null },
        overrideAccess: true,
      })
    }
  })

  it('P4: a teacher with editing access may delete their own version (author is projected)', async () => {
    const own = await saveAs(fx.users.editor.id, fx.plan.id, fx.subjectGrade.id)
    expect(await rowFor(fx.users.editor, own.id)).toMatchObject({
      official: 'no',
      canDelete: true,
      canEdit: true,
    })
  })

  it('P5: a Site Administrator sees their own saves and never the uploaded versions', async () => {
    const own = await saveAs(fx.users.siteAdmin.id, fx.plan.id, fx.subjectGrade.id)
    const ids = (await listPersonalVersions(req(), fx.users.siteAdmin)).map((r) => r.id)
    expect(ids).toContain(own.id)
    // The fixture's uploaded 1.0.0 has no author.
    expect(ids).not.toContain(fx.version.id)
  })

  it('a plain Teacher with no saves has an empty list', async () => {
    expect(await listPersonalVersions(req(), fx.users.teacher)).toEqual([])
  })
})
