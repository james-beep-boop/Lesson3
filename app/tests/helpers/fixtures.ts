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
import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

import type { LessonBundleVersion, LessonPlan, Subject, SubjectGrade, User } from '../../src/payload-types.js'

/** Marker prefix on every seeded record's identifying text — keeps fixture data identifiable + greppable. */
export const MARK = 'ZZ_INT_'

export type RoleKey = 'siteAdmin' | 'subjectAdmin' | 'editor' | 'teacher'

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
            phase: 'Predict',
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
  await purgeMarked(payload)

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

  const mkUser = (key: RoleKey, data: Partial<User>) =>
    payload.create({
      collection: 'users',
      data: {
        name: `${MARK}${key}`,
        email: `${MARK.toLowerCase()}${key.toLowerCase()}@test.local`,
        password,
        ...data,
      } as never,
      overrideAccess: true,
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
    await purgeMarked(payload)
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
 * Delete every `MARK`-tagged record in dependency order. Clears the plan's Official pointer first so
 * the Official-not-deletable guard does not block version deletion.
 */
export async function purgeMarked(payload: Payload): Promise<void> {
  // Unset Official pointers on marked plans so their versions become deletable.
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    where: { title: { like: MARK } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  await Promise.all(
    plans
      .filter((p) => p.officialVersion)
      .map((p) =>
        payload.update({
          collection: 'lesson-plans',
          id: p.id,
          data: { officialVersion: null },
          overrideAccess: true,
        }),
      ),
  )

  await payload.delete({
    collection: 'lesson-bundle-versions',
    where: { title: { like: MARK } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'lesson-plans',
    where: { title: { like: MARK } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { name: { like: MARK } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'subject-grades',
    where: { displayName: { like: MARK } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'subjects',
    where: { name: { like: MARK } },
    overrideAccess: true,
  })
}
