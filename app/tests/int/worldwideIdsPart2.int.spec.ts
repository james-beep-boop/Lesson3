/**
 * Worldwide identity, part 2 (2026-10-29; `docs/PLAN-worldwide-ids-part2-2026-10-29.md`).
 *
 * Against the isolated test database:
 *   - version ancestry is stamped by worldwide key, aligned with the numeric lineage, and survives the
 *     deletion of the parents it names — releases by their shared fingerprint, even when two local
 *     rows carry it;
 *   - every new user, version, message, topic and reply is stamped with this installation, which no
 *     caller can choose or change, and a create fails when the installation cannot be read;
 *   - the copy reset refuses while other clients are connected, maps every identity consistently
 *     (row-less ancestors included), and rolls back completely on failure;
 *   - the migration backfills from each version's whole recorded closure and is idempotent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import config from '../../src/payload.config.js'
import { ingestItems, type IngestItem } from '../../src/ingest/index.js'
import { withReleaseFingerprint } from '../../src/ingest/releaseFingerprintContext.js'
import { readInstallationId } from '../../src/lib/identity/installationId.js'
import { resetInstallationIdentity } from '../../src/lib/identity/resetIdentity.js'
import { up } from '../../src/migrations/20261029_102600_worldwide_ids_part2.js'
import type { LessonBundleVersion, User } from '../../src/payload-types.js'
import {
  MARK,
  createUserVerified,
  deleteUserFixture,
  minimalBundleContent,
  minimalResourceLinks,
  purgeMarked,
  setForumEnabled,
} from '../helpers/fixtures.js'
import { drizzleOf, rowsOf } from '../helpers/db.js'

const GRADE = 7 // owned by this suite
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
let payload: Payload
let subjectGradeId: number
let user: User
let semverCounter = 0

const db = () => drizzleOf(payload)
const readVersion = async (id: number) =>
  (await payload.findByID({
    collection: 'lesson-bundle-versions',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundleVersion

const rawBundle = (substrandId: string): Record<string, unknown> => ({
  schemaVersion: '1.0.0',
  META: {
    subject: `${MARK}Physics`,
    grade: GRADE,
    substrand_id: substrandId,
    substrand_name: `${MARK}${substrandId} name`,
    titleDoc: `${MARK}Ancestry ${substrandId}`,
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

async function ingestRelease(substrandId: string) {
  const item: IngestItem = { name: `${substrandId}.json`, extract: () => rawBundle(substrandId) }
  const [result] = await ingestItems(payload, [item])
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: result.id } },
    depth: 0,
    overrideAccess: true,
  })
  return { planId: result.id as number, release: docs[0] as LessonBundleVersion }
}

/** A version of `planId` whose parents are `sourceVersion` (and `mergedFrom`), as save-as-new and
 *  Combine create them; `stampVersionLineage` does the stamping either way. */
const child = async (
  planId: number,
  sourceVersion: number,
  extra: Record<string, unknown> = {},
  req?: Awaited<ReturnType<typeof createLocalReq>>,
) =>
  (await payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      title: `${MARK}Ancestry child`,
      semver: `3.0.${++semverCounter}`,
      lessonPlan: planId,
      subjectGrade: subjectGradeId,
      sourceVersion,
      ...minimalBundleContent(),
      ...extra,
    } as never,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })) as LessonBundleVersion

/** A second local row carrying `release`'s fingerprint — what another school's import looks like here. */
async function twinRelease(planId: number, release: LessonBundleVersion) {
  const req = await createLocalReq({}, payload)
  return withReleaseFingerprint(req, release.releaseFingerprint!, () =>
    payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        title: `${MARK}Twin release`,
        semver: '2.0.0',
        lessonPlan: planId,
        subjectGrade: subjectGradeId,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
      req,
    }),
  ) as Promise<LessonBundleVersion>
}

const removeVersion = (id: number) =>
  payload.delete({ collection: 'lesson-bundle-versions', id, overrideAccess: true })

beforeAll(async () => {
  payload = await getPayload({ config })
  const subject = await payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Physics` },
    overrideAccess: true,
  })
  subjectGradeId = (
    await payload.create({
      collection: 'subject-grades',
      data: { subject: subject.id, grade: GRADE },
      overrideAccess: true,
    })
  ).id
  user = (await createUserVerified(payload, {
    name: `${MARK}Ancestry teacher`,
    email: `${MARK.toLowerCase()}ancestry@example.com`,
    password: 'ancestry-1234',
  })) as User
}, 60_000)

afterAll(async () => {
  if (user) await deleteUserFixture(payload, user.id).catch(() => undefined)
  if (payload) await purgeMarked(payload, MARK)
})

describe('ancestry by worldwide key', () => {
  it('names a release by its fingerprint, stays aligned, and survives deleted parents', async () => {
    const { planId, release } = await ingestRelease('97.1')
    const fp = release.releaseFingerprint!
    expect(fp).toMatch(/^ares-content-v1:/) // precondition: there is a fingerprint to carry

    const c1 = await child(planId, release.id)
    expect(c1.sourceVersionKey).toBe(fp)
    expect(c1.lineage).toEqual([release.id])
    expect(c1.lineageKeys).toEqual([fp])

    // The same release as a second local row (another school's import), with its own chain.
    const twin = await twinRelease(planId, release)
    expect(twin.releaseFingerprint).toBe(fp)
    expect(twin.uid).not.toBe(release.uid)
    const c2 = await child(planId, twin.id)
    const g2 = await child(planId, c2.id)
    expect(g2.lineageKeys).toEqual([fp, c2.uid]) // transitive: the grandchild names the release

    await removeVersion(c2.id)
    await removeVersion(twin.id)
    const g2After = await readVersion(g2.id)
    expect(g2After.sourceVersion ?? null).toBeNull() // the local link is gone…
    expect(g2After.sourceVersionKey).toBe(c2.uid) // …the worldwide one is not
    expect(g2After.lineage).toEqual([twin.id, c2.id])
    expect(g2After.lineageKeys).toEqual([fp, c2.uid])

    // Combine across both chains: the shared release appears once per local row, still aligned.
    const merged = await child(planId, c1.id, { mergedFrom: g2.id })
    expect(merged.lineage).toEqual([release.id, c1.id, twin.id, c2.id, g2.id])
    expect(merged.lineageKeys).toEqual([fp, c1.uid, fp, c2.uid, g2.uid])
    expect(merged.sourceVersionKey).toBe(c1.uid)
    expect(merged.mergedFromKey).toBe(g2.uid)
  })

  it('no caller can choose the keys on create or change them on update', async () => {
    const { planId, release } = await ingestRelease('97.2')
    const forged = await child(planId, release.id, {
      sourceVersionKey: 'forged',
      mergedFromKey: 'forged',
      lineageKeys: ['forged'],
      originInstallation: 'forged',
    })
    expect(forged.sourceVersionKey).toBe(release.releaseFingerprint)
    expect(forged.mergedFromKey ?? null).toBeNull()
    expect(forged.lineageKeys).toEqual([release.releaseFingerprint])
    expect(forged.originInstallation).toBe(await readInstallationId(payload))
    await payload.update({
      collection: 'lesson-bundle-versions',
      id: forged.id,
      data: {
        sourceVersionKey: 'x',
        lineageKeys: ['x'],
        originInstallation: 'x',
      } as never,
      overrideAccess: true,
    })
    const after = await readVersion(forged.id)
    expect(after.sourceVersionKey).toBe(forged.sourceVersionKey)
    expect(after.lineageKeys).toEqual(forged.lineageKeys)
    expect(after.originInstallation).toBe(forged.originInstallation)
  })
})

describe('origin installation', () => {
  it('stamps every new user, message, topic and reply with this installation', async () => {
    const installation = await readInstallationId(payload)
    expect(installation).toMatch(UUID)
    const me = await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
    expect(me.originInstallation).toBe(installation)

    const message = await payload.create({
      collection: 'messages',
      data: {
        sender: user.id,
        recipient: user.id,
        body: `${MARK}origin`,
        uid: 'forged',
        originInstallation: 'forged',
      } as never,
      overrideAccess: true,
    })
    expect(message.uid).toMatch(UUID)
    expect(message.originInstallation).toBe(installation)

    await setForumEnabled(payload, true)
    const topic = await payload.create({
      collection: 'discussion-topics',
      data: {
        title: `${MARK}Origin topic`,
        body: 'Opening post',
        submissionKey: crypto.randomUUID(),
      } as never,
      overrideAccess: false,
      user,
    })
    expect(topic.uid).toMatch(UUID)
    expect(topic.originInstallation).toBe(installation)
    const reply = await payload.create({
      collection: 'discussion-replies',
      data: {
        topic: topic.id,
        body: 'A reply',
        submissionKey: crypto.randomUUID(),
        joinedAtSeq: 0,
      } as never,
      overrideAccess: false,
      user,
    })
    expect(reply.uid).toMatch(UUID)
    expect(reply.originInstallation).toBe(installation)
  })

  it('refuses to create a record when the installation id cannot be read', async () => {
    const { planId, release } = await ingestRelease('97.3')
    const installation = await readInstallationId(payload)
    // Push-built test schema: the column is nullable here (NOT NULL only in the migrated schema).
    await db().execute(sql`UPDATE system_settings SET installation_id = NULL`)
    try {
      await expect(child(planId, release.id)).rejects.toThrow(/Installation ID/)
    } finally {
      await db().execute(sql`UPDATE system_settings SET installation_id = ${installation}`)
    }
  })
})

describe('the copy reset', () => {
  const snapshot = async () =>
    rowsOf(
      await db().execute(sql`
        SELECT
          (SELECT installation_id FROM system_settings ORDER BY id LIMIT 1) AS installation,
          (SELECT string_agg(uid, ',' ORDER BY id) FROM lesson_bundle_versions) AS version_uids,
          (SELECT string_agg(uid, ',' ORDER BY id) FROM users) AS user_uids,
          (SELECT string_agg(text, ',' ORDER BY parent_id, "order") FROM lesson_bundle_versions_texts
            WHERE path = 'lineageKeys') AS keys
      `),
    )[0]

  it('refuses while any other client is connected', async () => {
    // This suite's own pool counts: nothing here is named as the reset script.
    const before = await snapshot()
    await expect(resetInstallationIdentity(payload, { apply: true })).rejects.toThrow(
      /other connection/,
    )
    expect(await snapshot()).toEqual(before)
  })

  it('rolls everything back when any step fails', async () => {
    const { planId, release } = await ingestRelease('97.4')
    await child(planId, release.id)
    const before = await snapshot()
    // The settings row is rewritten LAST, so failing it proves every earlier statement rolls back.
    await db().execute(sql`
      CREATE FUNCTION identity_reset_fail() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected'; END $$ LANGUAGE plpgsql`)
    await db().execute(sql`
      CREATE TRIGGER identity_reset_fail BEFORE UPDATE ON system_settings
      FOR EACH ROW EXECUTE FUNCTION identity_reset_fail()`)
    try {
      // drizzle wraps the database error; the trigger's message is its cause.
      await expect(
        resetInstallationIdentity(payload, { apply: true, requireSoleClient: false }),
      ).rejects.toMatchObject({ cause: { message: 'injected' } })
    } finally {
      await db().execute(sql`DROP TRIGGER identity_reset_fail ON system_settings`)
      await db().execute(sql`DROP FUNCTION identity_reset_fail()`)
    }
    expect(await snapshot()).toEqual(before)
  })

  it('maps every identity once — row-less ancestors included — so later forks still connect', async () => {
    const { planId, release } = await ingestRelease('97.5')
    const fp = release.releaseFingerprint!
    const parent = await child(planId, release.id)
    const kid = await child(planId, parent.id)
    await removeVersion(parent.id) // `parent` now exists only as a key in `kid`
    const survivor = await child(planId, release.id)
    const merged = await child(planId, kid.id, { mergedFrom: survivor.id })
    // A local key, as the backfill writes for an ancestor lost before keys existed.
    const oldInstallation = (await readInstallationId(payload))!
    await db().execute(sql`
      UPDATE lesson_bundle_versions_texts SET text = ${`local:${oldInstallation}:${release.id}`}
      WHERE parent_id = ${survivor.id} AND path = 'lineageKeys'`)
    const oldMessage = await payload.create({
      collection: 'messages',
      data: { sender: user.id, recipient: user.id, body: `${MARK}reset` },
      overrideAccess: true,
    })

    const report = await resetInstallationIdentity(payload, {
      apply: true,
      requireSoleClient: false,
    })
    expect(report.previous).toBe(oldInstallation)
    const installation = report.current!
    expect(installation).toMatch(UUID)
    expect(installation).not.toBe(oldInstallation)

    const [kidAfter, survivorAfter, mergedAfter] = await Promise.all(
      [kid.id, survivor.id, merged.id].map(readVersion),
    )
    // The deleted parent's key changed, and identically in both places that name it.
    expect(kidAfter.sourceVersionKey).toMatch(UUID)
    expect(kidAfter.sourceVersionKey).not.toBe(parent.uid)
    expect(mergedAfter.lineageKeys).toEqual([
      fp,
      kidAfter.sourceVersionKey,
      kidAfter.uid,
      survivorAfter.uid,
    ])
    // Live rows: the new uid IS the new key everywhere.
    expect(kidAfter.uid).not.toBe(kid.uid)
    expect(mergedAfter.sourceVersionKey).toBe(kidAfter.uid)
    expect(mergedAfter.mergedFromKey).toBe(survivorAfter.uid)
    // Release fingerprints are content and stay; local keys move to the new installation.
    expect((await readVersion(release.id)).releaseFingerprint).toBe(fp)
    expect(survivorAfter.lineageKeys).toEqual([`local:${installation}:${release.id}`])
    // Every origin is the new installation; every other uid is new.
    expect(mergedAfter.originInstallation).toBe(installation)
    const messageAfter = await payload.findByID({
      collection: 'messages',
      id: oldMessage.id,
      overrideAccess: true,
    })
    expect(messageAfter.uid).not.toBe(oldMessage.uid)
    expect(messageAfter.originInstallation).toBe(installation)

    // A fork and a Combine made after the reset build on the remapped keys.
    const fork = await child(planId, merged.id)
    expect(fork.lineageKeys).toEqual([...mergedAfter.lineageKeys!, mergedAfter.uid])
    expect(fork.originInstallation).toBe(installation)
  })
})

describe('the worldwide_ids_part2 migration on existing data', () => {
  it('backfills from the whole recorded closure, keeps what is set, and is idempotent', async () => {
    const { planId, release: a } = await ingestRelease('97.6')
    const b = await child(planId, a.id)
    const c = await child(planId, b.id)
    const other = await child(planId, a.id)
    await removeVersion(b.id) // A → B → C with B deleted
    const installation = (await readInstallationId(payload))!

    // Simulate C from before the migration: no keys at all, and its local parent link cleared.
    await db().execute(sql`
      DELETE FROM lesson_bundle_versions_texts WHERE parent_id = ${c.id} AND path = 'lineageKeys'`)
    await db().execute(sql`
      UPDATE lesson_bundle_versions SET source_version_key = NULL, merged_from_key = NULL
      WHERE id = ${c.id}`)
    const otherBefore = await readVersion(other.id)

    const args = { db: db(), payload, req: undefined } as unknown as Parameters<typeof up>[0]
    await up(args)
    const cAfter = await readVersion(c.id)
    expect(cAfter.lineage).toEqual([a.id, b.id])
    // A survives, so its real key is recovered across the deleted B; B gets this school's local key.
    expect(cAfter.lineageKeys).toEqual([a.releaseFingerprint, `local:${installation}:${b.id}`])
    expect(cAfter.sourceVersionKey ?? null).toBeNull() // which entry was the parent is not recoverable
    // A version that already had keys is untouched.
    const otherAfter = await readVersion(other.id)
    expect(otherAfter.lineageKeys).toEqual(otherBefore.lineageKeys)
    expect(otherAfter.sourceVersionKey).toBe(otherBefore.sourceVersionKey)

    await up(args) // a rerun changes nothing
    expect(await readVersion(c.id)).toEqual(cAfter)
    expect(await readVersion(other.id)).toEqual(otherAfter)
  })
})
