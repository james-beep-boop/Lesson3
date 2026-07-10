/**
 * Hermetic role + content fixture for Vitest integration tests (`tests/int`).
 *
 * Seeds, via the Local API with `overrideAccess: true`, a complete authorization world that the
 * access-control specs assert against, then tears it all down:
 *   - one Subject + one SubjectGrade (the scope the unit roles attach to),
 *   - one user per role: Site Admin, Subject Admin, Editor (both scoped to the SG), Teacher,
 *   - one LessonPlan + its Official `1.0.0` LessonBundleVersion (a MINIMAL but generatable bundle).
 *
 * Unlike `scripts/verify-*.ts` (which lean on pre-seeded Rock corpus + users via `payload run`),
 * this fixture creates everything it needs, so the specs are repeatable on any DB and CI-gateable.
 * Every record is tagged with {@link MARK} and removed in {@link teardownRoleFixture} (reverse order).
 *
 * The minimal bundle deliberately carries NO FINAL_EXPLANATION / SUMMARY_TABLE content — per SPEC §3
 * (resolved 2026-06-26) single-document sub-strands are legitimate, and an empty FE/ST is skipped by
 * the generator, so the bundle still passes `validateGeneratable` (META + 1 lesson with SLO,
 * summaryTablePrompt, and 1 valid framework phase).
 *
 * NOTE: requires a database → runs on the Rock only (like all of `tests/int`).
 */
import { randomUUID } from 'node:crypto'

import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

import type { LessonBundleVersion, LessonPlan, Subject, SubjectGrade, User } from '../../src/payload-types.js'
import { jobMatchesVersion } from '../../src/jobs/generateVersionArtifact.js'

/**
 * Stable namespace prefix shared by every fixture run. Used ONLY for the crashed-run safety sweep at
 * setup (clear leftovers from any prior run, whatever its run id). Never tag records with this alone.
 */
export const MARK_BASE = 'ZZ_INT_'

/**
 * Per-run marker: every record THIS run seeds (here and in the specs) is tagged with it, so teardown
 * deletes ONLY this run's rows — not a concurrent run's, and not unrelated live data that merely shares
 * the namespace. Generated once per test process; the specs import this same module binding, so their
 * ad-hoc records inherit the run marker for free (no spec changes needed). Bounds the blast radius of
 * the broad `like`-delete against the live `lesson3` DB the HTTP suite runs against.
 */
export const MARK = `${MARK_BASE}${randomUUID()}_`

export type RoleKey = 'siteAdmin' | 'subjectAdmin' | 'editor' | 'teacher'

/**
 * Every Local-API user create in specs goes through here (auth.verify, 2026-07-09): seeded users
 * are born `_verified: true` — the JWT strategy rejects falsy `_verified` — and never send the
 * verification email (a relay bounce on a fixture address would fail the create itself). One
 * owner so the next scratch-user spec can't forget the flags; a caller testing unverified
 * behavior overrides `_verified` via `data`.
 */
export const createUserVerified = (
  payload: Payload,
  data: Partial<User> & { email: string; name: string; password: string },
): Promise<User> =>
  payload.create({
    collection: 'users',
    data: { _verified: true, ...data } as never,
    disableVerificationEmail: true,
    overrideAccess: true,
  })

export interface RoleFixture {
  payload: Payload
  subject: Subject
  subjectGrade: SubjectGrade
  users: Record<RoleKey, User>
  /** Known password for every seeded user (for HTTP login fixtures). */
  password: string
  plan: LessonPlan
  /** The plan's Official, immutable 1.0.0 version. */
  version: LessonBundleVersion
  teardown: () => Promise<void>
}

/**
 * The smallest bundle that satisfies `validateGeneratable`: META present, ≥1 lesson carrying an
 * `slo` group, a `summaryTablePrompt` group, and ≥1 framework phase from the controlled vocabulary.
 * FINAL_EXPLANATION / SUMMARY_TABLE intentionally omitted (legitimate single-doc bundle, SPEC §3).
 */
export function minimalBundleContent() {
  return {
    meta: {
      subject: 'Biology',
      grade: 99,
      substrand_id: '99.1',
      substrand_name: `${MARK}Sub-strand`,
      titleDoc: `${MARK}Lesson Sequence`,
      col3Label: 'Sensemaking',
      col5Label: 'Resources',
    },
    unit: {},
    lessons: [
      {
        title: `${MARK}Lesson One`,
        duration: '40 min',
        slo: {
          purpose: 'Understand the fixture.',
          knowledge: 'Knows the fixture.',
          skills: 'Builds the fixture.',
          attitudes: 'Values the fixture.',
          keyInquiry: 'What is a fixture?',
        },
        overview: 'A minimal generatable lesson.',
        framework: [
          {
            phase: 'Predict Phase',
            learnerExperience: 'Predict the outcome.',
            teacherMoves: 'Elicit predictions.',
            sensemakingStrategy: 'Discussion.',
            formativeAssessment: 'Observe responses.',
          },
        ],
        teacherReflection: 'Reflect on the fixture.',
        summaryTablePrompt: {
          observed: 'Observed the fixture.',
          learned: 'Learned the fixture.',
          explained: 'Explained the fixture.',
        },
      },
    ],
    finalExplanation: {},
    summaryTable: {},
  }
}

/**
 * Seed the full role world + a plan with an Official version. Idempotent w.r.t. prior runs: any
 * leftover `MARK`-tagged records (from a crashed run) are cleared first.
 */
export async function setupRoleFixture(password = 'test1234'): Promise<RoleFixture> {
  const payload = await getPayload({ config })
  // Crashed-run safety sweep: clear leftovers from ANY prior run (match the whole namespace).
  await purgeMarked(payload, MARK_BASE)

  const subject = await payload.create({
    collection: 'subjects',
    data: { name: `${MARK}Biology` },
    overrideAccess: true,
  })
  const subjectGrade = await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade: 99 },
    overrideAccess: true,
  })

  // RFC 2606-reserved domain: fixture users can now RECEIVE system email (the §10 message ping
  // goes to the recipient's account address), so on a live stack with SMTP the sends must go to
  // example.com's blackhole — same idiom as the email-a-doc http tests — not to a fake TLD that
  // would fail at the relay and leave failed job rows behind. createUserVerified supplies the
  // auth.verify defaults (born verified, no verification email).
  const mkUser = (key: RoleKey, data: Partial<User>) =>
    createUserVerified(payload, {
      ...data,
      name: `${MARK}${key}`,
      email: `${MARK.toLowerCase()}${key.toLowerCase()}@example.com`,
      password,
    })

  const users: Record<RoleKey, User> = {
    siteAdmin: await mkUser('siteAdmin', { roles: ['siteAdmin'] }),
    // Order matters: create the editor BEFORE the subjectAdmin so the ≤1-subject-admin auto-demote
    // hook (which fires on the subjectAdmin create) does not touch the editor.
    editor: await mkUser('editor', {
      assignments: [{ subjectGrade: subjectGrade.id, role: 'editor' }],
    }),
    subjectAdmin: await mkUser('subjectAdmin', {
      assignments: [{ subjectGrade: subjectGrade.id, role: 'subjectAdmin' }],
    }),
    teacher: await mkUser('teacher', {}), // no assignments → default Teacher
  }

  // Plan first, then its 1.0.0 version, then point the plan's Official pointer at it (ingest order).
  const plan = await payload.create({
    collection: 'lesson-plans',
    data: { title: `${MARK}Plan`, subjectGrade: subjectGrade.id },
    overrideAccess: true,
  })
  const version = (await payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: plan.id,
      subjectGrade: subjectGrade.id,
      semver: '1.0.0',
      title: `${MARK}Plan v1.0.0`,
      ...minimalBundleContent(),
    } as never,
    overrideAccess: true,
  })) as LessonBundleVersion
  const planWithOfficial = await payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: { officialVersion: version.id },
    overrideAccess: true,
  })

  const teardown = async () => {
    // Precise: delete only the records THIS run tagged with its unique marker.
    await purgeMarked(payload, MARK)
  }

  return {
    payload,
    subject,
    subjectGrade,
    users,
    password,
    plan: planWithOfficial,
    version,
    teardown,
  }
}

/**
 * Delete every record whose identifying text contains `mark`, in dependency order. Clears each plan's
 * Official pointer first so the Official-not-deletable guard does not block version deletion. Pass the
 * per-run {@link MARK} for a precise teardown, or {@link MARK_BASE} for the setup namespace sweep.
 */
export async function purgeMarked(payload: Payload, mark: string): Promise<void> {
  // Unset Official pointers on marked plans so their versions become deletable. Loop (rather than a
  // fixed cap) so an unbounded number of leftover plans is fully cleared.
  for (;;) {
    const { docs: plans } = await payload.find({
      collection: 'lesson-plans',
      where: { title: { like: mark }, officialVersion: { exists: true } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    if (plans.length === 0) break
    await Promise.all(
      plans.map((p) =>
        payload.update({
          collection: 'lesson-plans',
          id: p.id,
          data: { officialVersion: null },
          overrideAccess: true,
        }),
      ),
    )
  }

  await payload.delete({
    collection: 'lesson-bundle-versions',
    where: { title: { like: mark } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'lesson-plans',
    where: { title: { like: mark } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { name: { like: mark } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'subject-grades',
    where: { displayName: { like: mark } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'subjects',
    where: { name: { like: mark } },
    overrideAccess: true,
  })
}

/**
 * The `generateVersionArtifact` kinds enqueued (pending or done) for `versionId` — the assertion
 * both the make-official (http) and first-ingest (int) pre-warm tests share. Job rows persist
 * after completion (prune is a separate cron), so this is stable however fast autoRun drains.
 */
export async function enqueuedKindsFor(payload: Payload, versionId: number | string): Promise<Set<string>> {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: 'generateVersionArtifact' } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return new Set(
    docs.filter((j) => jobMatchesVersion(j, versionId)).map((j) => String((j.input as { kind?: string }).kind)),
  )
}

