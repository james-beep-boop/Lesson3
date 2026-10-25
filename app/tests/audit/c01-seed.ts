// Reused from historical audit package 3b5dc1a; adapted for the current isolated target.
/** Synthetic C01 fixture. Refuses a database not marked for this exact audit run. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { createUserVerified, minimalBundleContent } from '../helpers/fixtures'
import { drizzleOf, rowsOf } from '../helpers/db'

const run = process.env.LESSON3_AUDIT_RUN_ID
const password = process.env.LESSON3_AUDIT_PASSWORD
const output = process.env.LESSON3_AUDIT_FIXTURE_FILE
if (!run?.startsWith('l3audit-') || !password || !output || process.env.NODE_ENV !== 'production') {
  throw new Error(
    'C01 seed requires a marked audit target, private fixture output and production mode',
  )
}
const payload = await getPayload({ config })
const marker = rowsOf<{ marker: string }>(
  await drizzleOf(payload).execute(
    sql`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`,
  ),
)[0]?.marker
if (marker !== run) throw new Error('Database is not marked for this audit run')
if ((await payload.count({ collection: 'users', overrideAccess: true })).totalDocs !== 0) {
  throw new Error('C01 seed requires an empty audit users collection')
}

const subject = await payload.create({
  collection: 'subjects',
  data: { name: 'ZZ_AUDIT_Synthetic_Science' },
  overrideAccess: true,
})
const scopes: Record<string, number> = {}
for (const [key, grade] of [
  ['A', 10],
  ['B', 11],
] as const) {
  const sg = await payload.create({
    collection: 'subject-grades',
    data: { subject: subject.id, grade },
    overrideAccess: true,
  })
  scopes[key] = sg.id
}
const definitions = {
  siteAdmin: { roles: ['siteAdmin'] },
  teacher: {},
  teacherPeer: {},
  editorA: { assignments: [{ subjectGrade: scopes.A, role: 'editor' }] },
  editorAPeer: { assignments: [{ subjectGrade: scopes.A, role: 'editor' }] },
  editorB: { assignments: [{ subjectGrade: scopes.B, role: 'editor' }] },
  subjectAdminA: {
    assignments: [
      { subjectGrade: scopes.A, role: 'subjectAdmin' },
      { subjectGrade: scopes.B, role: 'editor' },
    ],
  },
  subjectAdminB: { assignments: [{ subjectGrade: scopes.B, role: 'subjectAdmin' }] },
  unverified: { _verified: false },
} as const
const accounts: Record<
  string,
  {
    id: number
    email: string
    verified: boolean
    roles: string[]
    assignments: Array<{ subjectGrade: number; role: string }>
  }
> = {}
for (const [key, extra] of Object.entries(definitions)) {
  const email = `${key.toLowerCase()}@lesson3.local`
  const user = await createUserVerified(payload, {
    name: `ZZ_AUDIT_${key}`,
    email,
    password,
    ...extra,
  } as Parameters<typeof createUserVerified>[1])
  const expected = extra as {
    roles?: readonly string[]
    assignments?: ReadonlyArray<{ subjectGrade: number; role: string }>
  }
  accounts[key] = {
    id: user.id,
    email,
    verified: key !== 'unverified',
    roles: [...(expected.roles ?? [])],
    assignments: [...(expected.assignments ?? [])],
  }
}
for (const account of Object.values(accounts)) {
  const stored = await payload.findByID({
    collection: 'users',
    id: account.id,
    depth: 0,
    overrideAccess: true,
  })
  assert.deepEqual(stored.roles ?? [], account.roles)
  assert.deepEqual(
    (stored.assignments ?? []).map((row) => ({
      subjectGrade: typeof row.subjectGrade === 'object' ? row.subjectGrade.id : row.subjectGrade,
      role: row.role,
    })),
    account.assignments,
  )
}
const plans: Record<string, { plan: number; version: number }> = {}
for (const key of ['A', 'B']) {
  const plan = await payload.create({
    collection: 'lesson-plans',
    data: { title: `ZZ_AUDIT_Plan_${key}`, subjectGrade: scopes[key] },
    overrideAccess: true,
  })
  const content = minimalBundleContent()
  const version = await payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      ...content,
      lessonPlan: plan.id,
      subjectGrade: scopes[key],
      semver: '1.0.0',
      title: `ZZ_AUDIT_Plan_${key}`,
      meta: { ...content.meta, subject: subject.name, grade: key === 'A' ? 10 : 11 },
    } as never,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'lesson-plans',
    id: plan.id,
    data: { officialVersion: version.id },
    overrideAccess: true,
  })
  plans[key] = { plan: plan.id, version: version.id }
}
await writeFile(output, JSON.stringify({ run, password, accounts, scopes, plans }, null, 2), {
  mode: 0o600,
})
console.log('C01 synthetic fixture created: nine accounts, two scopes, two Official plans.')
process.exit(0)
