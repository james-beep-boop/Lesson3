/**
 * Worldwide identity (2026-10-19; `fields/identity.ts`, the `worldwide_ids` migration).
 *
 * Against the isolated test database: every creation path gets a fresh uid that no caller can choose
 * or change; only ingest stamps a release fingerprint, and it equals the fingerprint of the version AS
 * STORED (so the backfill, which only has the stored copy, agrees with ingest); the installation id is
 * stable until deliberately reset; and the migration fills only what is missing, recognises releases
 * with the audited rule, is idempotent, and leaves the columns NOT NULL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { ingestItems, type IngestItem } from '../../src/ingest/index.js'
import { releaseFingerprint } from '../../src/lib/identity/releaseFingerprint.js'
import { stripIds } from '../../src/lib/stripIds.js'
import { withReleaseFingerprint } from '../../src/ingest/releaseFingerprintContext.js'
import { readInstallationId, resetInstallationId } from '../../src/lib/identity/installationId.js'
import { up } from '../../src/migrations/20261019_211325_worldwide_ids.js'
import {
  MARK,
  createUserVerified,
  deleteUserFixture,
  minimalResourceLinks,
  purgeMarked,
} from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'

const GRADE = 8 // owned by this suite
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
let payload: Payload
let userId: number | undefined

const rawBundle = (substrandId: string): Record<string, unknown> => ({
  schemaVersion: '1.0.0',
  META: {
    subject: `${MARK}Chemistry`,
    grade: GRADE,
    substrand_id: substrandId,
    substrand_name: `${MARK}${substrandId} name`,
    titleDoc: `${MARK}Identity ${substrandId}`,
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
})
const item = (name: string, raw: Record<string, unknown>): IngestItem => ({
  name,
  extract: () => raw,
})

const db = () => drizzleOf(payload)
const readVersion = (id: number) =>
  payload.findByID({ collection: 'lesson-bundle-versions', id, depth: 0, overrideAccess: true })

beforeAll(async () => {
  payload = await getPayload({ config })
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Chemistry` },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: GRADE },
    overrideAccess: true,
  })
}, 60_000)

afterAll(async () => {
  if (userId != null) await deleteUserFixture(payload, userId).catch(() => undefined)
  if (payload) await purgeMarked(payload, MARK)
})

/** Ingest one release and return its plan and version ids. */
async function ingestRelease(substrandId: string) {
  const [result] = await ingestItems(payload, [item(`${substrandId}.json`, rawBundle(substrandId))])
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: result.id } },
    depth: 0,
    overrideAccess: true,
  })
  return { planId: result.id as number, versionId: docs[0].id }
}

describe('creation', () => {
  it('ingest gives the plan and version uids, and the version the fingerprint of its stored self', async () => {
    const { planId, versionId } = await ingestRelease('96.1')
    const plan = await payload.findByID({
      collection: 'lesson-plans',
      id: planId,
      depth: 0,
      overrideAccess: true,
    })
    const version = await readVersion(versionId)
    expect(plan.uid).toMatch(UUID)
    expect(version.uid).toMatch(UUID)
    expect(version.releaseFingerprint).toMatch(/^ares-content-v1:sha256:[0-9a-f]{64}$/)
    // Upload-time and stored-copy fingerprints agree — the property the backfill depends on.
    expect(version.releaseFingerprint).toBe(releaseFingerprint(version as never))
  })

  it('a trusted copy of a release gets a fresh uid and no fingerprint, whatever it is handed', async () => {
    const { planId, versionId } = await ingestRelease('96.2')
    const source = await readVersion(versionId)
    // Precondition: there is a fingerprint to leak, so a pass below means it was refused.
    expect(source.releaseFingerprint).toMatch(/^ares-content-v1:/)
    // What a careless trusted copy would do: strip row ids as save-as-new does, but hand the
    // source's identity straight back.
    const copy = await payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        ...(stripIds(source) as Record<string, unknown>),
        uid: source.uid,
        releaseFingerprint: source.releaseFingerprint,
        semver: '1.0.1',
        lessonPlan: planId,
      } as never,
      overrideAccess: true,
    })
    expect(copy.uid).toMatch(UUID)
    expect(copy.uid).not.toBe(source.uid)
    expect(copy.releaseFingerprint ?? null).toBeNull()
  })

  it('a later create sharing ingest’s request does not inherit the fingerprint (#416 review)', async () => {
    const { planId, versionId } = await ingestRelease('96.4')
    const release = await readVersion(versionId)
    const data = (semver: string) =>
      ({ ...(stripIds(release) as Record<string, unknown>), semver, lessonPlan: planId }) as never
    // ONE request for both creates, as ingest's batch shares one — real Payload replaces
    // `req.context` during each create, which is what left the key behind before the fix.
    const req = await createLocalReq({}, payload)
    const stamped = await withReleaseFingerprint(req, release, () =>
      payload.create({
        collection: 'lesson-bundle-versions',
        data: data('1.0.7'),
        overrideAccess: true,
        req,
      }),
    )
    expect(stamped.releaseFingerprint).toMatch(/^ares-content-v1:/)
    const later = await payload.create({
      collection: 'lesson-bundle-versions',
      data: data('1.0.8'),
      overrideAccess: true,
      req,
    })
    expect(later.releaseFingerprint ?? null).toBeNull()
  })

  it('users get a uid, and no update — even a trusted one — changes any uid', async () => {
    const user = await createUserVerified(payload, {
      name: `${MARK}Identity user`,
      email: `${MARK.toLowerCase()}identity@example.com`,
      password: 'identity-1234',
    })
    userId = user.id
    const before = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(before.uid).toMatch(UUID)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { uid: '00000000-0000-4000-8000-000000000000', name: `${MARK}Renamed` } as never,
      overrideAccess: true,
    })
    const after = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
    expect(after.name).toBe(`${MARK}Renamed`)
    expect(after.uid).toBe(before.uid)
  })
})

describe('installation id', () => {
  it('is stable across reads, unchanged by a dry run, and replaced only by a deliberate reset', async () => {
    // A push-built test database may have no settings row yet; a reset creates it with an id.
    const initial =
      (await readInstallationId(payload)) ?? (await resetInstallationId(payload, true)).current
    expect(initial).toMatch(UUID)
    expect(await readInstallationId(payload)).toBe(initial)
    expect(await resetInstallationId(payload, false)).toEqual({
      previous: initial,
      current: initial,
    })
    const { previous, current } = await resetInstallationId(payload, true)
    expect(previous).toBe(initial)
    expect(current).toMatch(UUID)
    expect(current).not.toBe(initial)
    expect(await readInstallationId(payload)).toBe(current)
  })
})

describe('the worldwide_ids migration on existing data', () => {
  it('fills only what is missing, recognises releases by the audited rule, and is idempotent', async () => {
    const { planId, versionId } = await ingestRelease('96.3')
    const release = await readVersion(versionId)
    const teacher = await createUserVerified(payload, {
      name: `${MARK}Identity teacher`,
      email: `${MARK.toLowerCase()}identity-teacher@example.com`,
      password: 'identity-1234',
    })
    try {
      // A teacher's version: authored, so never a release, even though it copies release content.
      const authored = await payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          ...(stripIds(release) as Record<string, unknown>),
          semver: '1.0.1',
          lessonPlan: planId,
          author: teacher.id,
        } as never,
        overrideAccess: true,
      })
      // Simulate rows from before the migration: no fingerprint, and one missing uid.
      await db().execute(
        sql`UPDATE lesson_bundle_versions SET release_fingerprint = NULL WHERE id = ${versionId}`,
      )
      await db().execute(sql`ALTER TABLE users ALTER COLUMN uid DROP NOT NULL`)
      await db().execute(sql`UPDATE users SET uid = NULL WHERE id = ${teacher.id}`)
      const keptPlanUid = (
        await payload.findByID({
          collection: 'lesson-plans',
          id: planId,
          depth: 0,
          overrideAccess: true,
        })
      ).uid

      const args = { db: db(), payload, req: undefined } as unknown as Parameters<typeof up>[0]
      await up(args)
      const snapshot = async () =>
        rowsOf(
          await db().execute(sql`
            SELECT v.id, v.uid, v.release_fingerprint, p.uid AS plan_uid,
              (SELECT uid FROM users WHERE id = ${teacher.id}) AS teacher_uid
            FROM lesson_bundle_versions v JOIN lesson_plans p ON p.id = v.lesson_plan_id
            WHERE v.id IN (${versionId}, ${authored.id}) ORDER BY v.id
          `),
        )
      const first = await snapshot()
      expect(first[0].release_fingerprint).toBe(release.releaseFingerprint)
      expect(first[1].release_fingerprint).toBeNull()
      expect(first[0].plan_uid).toBe(keptPlanUid) // an id once given never changes
      expect(first[0].teacher_uid).toMatch(UUID)

      await up(args) // a rerun changes nothing
      expect(await snapshot()).toEqual(first)

      // And the columns are NOT NULL now.
      await expect(
        db().execute(sql`UPDATE users SET uid = NULL WHERE id = ${teacher.id}`),
      ).rejects.toThrow()
    } finally {
      await deleteUserFixture(payload, teacher.id).catch(() => undefined)
    }
  })
})
