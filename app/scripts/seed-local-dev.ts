/**
 * Seed a minimal, browsable world into a LOCAL dev database so UI work can be verified in a browser
 * BEFORE it ships, rather than post-deploy on the Rock (docs/DECISIONS.md 2026-07-30: three visual
 * defects in the button-system batch reached the deployed site because no local stack existed).
 *
 * Creates a subject + subject-grade, four role logins with STABLE credentials, and one lesson plan
 * whose Official 1.0.0 version uses the same `minimalBundleContent()` the test suite uses — so it
 * passes `validateGeneratable` and the lesson page renders for real.
 *
 *   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres
 *   cd app && npx payload run scripts/seed-local-dev.ts
 *
 * Logins (all password `local1234`):
 *   siteadmin@local.test · subjectadmin@local.test · editor@local.test · teacher@local.test
 * The editor and subject admin are scoped to the seeded subject-grade, so the ≤640px editing
 * affordances and the role-gated Edit button can both be exercised.
 *
 * ⚑ REFUSES to run unless DATABASE_URI points at localhost/127.0.0.1. This script creates users with
 * known passwords; it must be impossible to point it at the Rock by accident. That guard is the
 * reason it is safe to keep in `scripts/` at all.
 *
 * Idempotent: re-running clears anything it previously created (matched by the `local.test` email
 * domain and the seeded plan title) before recreating it.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import { createUserVerified, minimalBundleContent } from '../tests/helpers/fixtures'

const PASSWORD = 'local1234'
const EMAIL_DOMAIN = 'local.test'
const PLAN_TITLE = 'Local Dev: Cell Structure'
const SUBJECT = 'Biology'
const GRADE = 10

function assertLocalDatabase(): void {
  const uri = process.env.DATABASE_URI ?? ''
  // `new URL` rather than a hand-rolled split: it handles credentials correctly, where a password
  // containing '@' would fool a regex into reading the wrong segment as the host.
  let host: string
  try {
    host = new URL(uri).hostname
  } catch {
    host = '' // unparseable → not local → refuse, which is the safe direction
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!isLocal) {
    throw new Error(
      `seed-local-dev: refusing to run — DATABASE_URI host is "${host}", not localhost.\n` +
        'This script creates accounts with a known password and must never touch a shared or ' +
        'production database.',
    )
  }
}

async function main(): Promise<void> {
  assertLocalDatabase()
  const payload = await getPayload({ config })

  // ---- Clear a previous run ------------------------------------------------------------------
  // Order matters: a plan's Official pointer must be cleared before its versions can be deleted
  // (the Official-not-deletable guard), and versions before the plan.
  const { docs: oldPlans } = await payload.find({
    collection: 'lesson-plans',
    where: { title: { equals: PLAN_TITLE } },
    limit: 100,
    overrideAccess: true,
  })
  for (const plan of oldPlans) {
    await payload.update({
      collection: 'lesson-plans',
      id: plan.id,
      data: { officialVersion: null },
      overrideAccess: true,
    })
    await payload.delete({
      collection: 'lesson-bundle-versions',
      where: { lessonPlan: { equals: plan.id } },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'lesson-plans', id: plan.id, overrideAccess: true })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: `@${EMAIL_DOMAIN}` } },
    overrideAccess: true,
  })

  // ---- Taxonomy ------------------------------------------------------------------------------
  // Subject and SubjectGrade are SHARED with anything else already in this database, so they are
  // found-or-created rather than recreated — unlike the plan and users below, which this script owns
  // and replaces wholesale.
  const findOrCreate = async <T extends 'subjects' | 'subject-grades'>(
    collection: T,
    where: Where,
    data: Record<string, unknown>,
  ) => {
    const { docs } = await payload.find({ collection, where, limit: 1, overrideAccess: true })
    return docs[0] ?? (await payload.create({ collection, data: data as never, overrideAccess: true }))
  }

  const subject = await findOrCreate('subjects', { name: { equals: SUBJECT } }, { name: SUBJECT })
  const subjectGrade = await findOrCreate(
    'subject-grades',
    { and: [{ subject: { equals: subject.id } }, { grade: { equals: GRADE } }] },
    { subject: subject.id, grade: GRADE },
  )

  // ---- Logins --------------------------------------------------------------------------------
  // `createUserVerified` (tests/helpers/fixtures.ts) owns the "born verified, send no mail" contract
  // — imported rather than restated, so a future change to it reaches this script too. Only the
  // IDENTITY differs from the test fixture: stable, typeable addresses instead of its randomised
  // `MARK` namespace, because these are logins a human signs in with.
  const mkUser = (key: string, extra: Partial<Parameters<typeof createUserVerified>[1]>) =>
    createUserVerified(payload, {
      name: `Local ${key}`,
      email: `${key.toLowerCase()}@${EMAIL_DOMAIN}`,
      password: PASSWORD,
      ...extra,
    })

  await mkUser('siteadmin', { roles: ['siteAdmin'] })
  // Editor BEFORE subjectAdmin: the ≤1-subject-admin auto-demote hook fires on the subjectAdmin
  // create and would otherwise touch the editor (same ordering constraint as the test fixture).
  await mkUser('editor', { assignments: [{ subjectGrade: subjectGrade.id, role: 'editor' }] })
  await mkUser('subjectadmin', {
    assignments: [{ subjectGrade: subjectGrade.id, role: 'subjectAdmin' }],
  })
  await mkUser('teacher', {})

  // ---- One browsable plan ---------------------------------------------------------------------
  // Ingest order: plan → its 1.0.0 version → point the plan's Official pointer at that version.
  const plan = await payload.create({
    collection: 'lesson-plans',
    data: { title: PLAN_TITLE, subjectGrade: subjectGrade.id },
    overrideAccess: true,
  })
  const content = minimalBundleContent()
  const version = await payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      lessonPlan: plan.id,
      subjectGrade: subjectGrade.id,
      semver: '1.0.0',
      title: `${PLAN_TITLE} v1.0.0`,
      ...content,
      meta: { ...content.meta, subject: SUBJECT, grade: GRADE, substrand_name: 'Cell Structure' },
    } as never,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: { officialVersion: version.id },
    overrideAccess: true,
  })

  payload.logger.info(
    `seed-local-dev: ready — plan ${plan.id}, version ${version.id} (/lessons/${plan.id}). ` +
      `Logins: {siteadmin,subjectadmin,editor,teacher}@${EMAIL_DOMAIN} / ${PASSWORD}`,
  )
  process.exit(0)
}

await main()
