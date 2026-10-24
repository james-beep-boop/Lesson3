/** Fingerprint complete Payload snapshots, including nested native content rows, for restore proof. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { drizzleOf, rowsOf } from '../helpers/db'

const run = process.env.LESSON3_AUDIT_RUN_ID
const output = process.env.LESSON3_AUDIT_FINGERPRINT_FILE
assert(run?.startsWith('l3audit-') && output && process.env.NODE_ENV === 'production')
const payload = await getPayload({ config })
const marker = rowsOf<{ marker: string }>(
  await drizzleOf(payload).execute(
    sql`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`,
  ),
)[0]?.marker
assert.equal(marker, run)
const versions = await payload.find({
  collection: 'lesson-bundle-versions',
  depth: 0,
  limit: 100,
  sort: 'id',
  overrideAccess: true,
})
const plans = await payload.find({
  collection: 'lesson-plans',
  depth: 0,
  limit: 100,
  sort: 'id',
  overrideAccess: true,
})
const users = await payload.count({ collection: 'users', overrideAccess: true })
assert.equal(users.totalDocs, 9)
assert.equal(plans.totalDocs, 2)
assert.equal(versions.totalDocs, 2)
assert.equal(versions.docs.length, versions.totalDocs)
assert.equal(plans.docs.length, plans.totalDocs)
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value
const fingerprint = {
  users: users.totalDocs,
  plans: plans.totalDocs,
  versions: versions.totalDocs,
  contentSHA256: createHash('sha256')
    .update(JSON.stringify(stable({ versions: versions.docs, plans: plans.docs })))
    .digest('hex'),
}
await writeFile(output, JSON.stringify(fingerprint, null, 2), { mode: 0o600 })
console.log(
  JSON.stringify({
    users: fingerprint.users,
    plans: fingerprint.plans,
    versions: fingerprint.versions,
    fingerprintRecorded: true,
  }),
)
process.exit(0)
