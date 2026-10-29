/**
 * Make a COPIED database another school (2026-10-29; `docs/PLAN-worldwide-ids-part2-2026-10-29.md` §D).
 *
 * A prepared database copied to a second machine would otherwise give two schools the same people,
 * lesson plans, versions, messages and posts. In one transaction this replaces:
 *   - the Installation ID, and every `originInstallation` with it;
 *   - every `uid` (users, lesson plans, versions, messages, topics, replies);
 *   - every worldwide ancestry key, mapped ONCE per distinct old key so a fork or Combine after the
 *     reset still finds its ancestors: a UUID key gets one fresh UUID wherever it appears — the version
 *     row's new `uid` when the row still exists, the same value for an ancestor with no row left;
 *     `local:<old>:<n>` becomes `local:<new>:<n>`; a release fingerprint is unchanged (it names the
 *     content, which both machines really do hold).
 *
 * ⚑ SOLE CLIENT. A transaction cannot stop a create that read the old Installation ID a moment before,
 * so the reset refuses while any other client is connected to the database: the app (and its
 * in-process jobs) must be stopped first. The script names its own connections (`application_name`)
 * so they are not counted.
 *
 * Never after restoring a school's own backup: that must keep its identity (docs/OPS.md).
 */
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { readInstallationId } from './installationId'
import { rowsOf, txDb } from '../txDb'

export const RESET_APPLICATION_NAME = 'lesson3-identity-reset'

const UUID_KEY = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

const UID_TABLES = [
  'users',
  'lesson_plans',
  'lesson_bundle_versions',
  'messages',
  'discussion_topics',
  'discussion_replies',
] as const
const ORIGIN_TABLES = [
  'users',
  'lesson_bundle_versions',
  'messages',
  'discussion_topics',
  'discussion_replies',
] as const

type Handle = { execute: (q: unknown) => Promise<unknown> }

export interface IdentityResetReport {
  previous: string | null
  current: string | null
  /** Other clients connected to the database; any at all blocks `apply`. */
  otherClients: number
  /** Rows (or distinct ancestry keys) that get new values. */
  counts: Record<string, number>
}

const count = async (db: Handle, query: ReturnType<typeof sql>): Promise<number> =>
  Number(rowsOf(await db.execute(query))[0]?.n ?? 0)

async function countOtherClients(db: Handle): Promise<number> {
  return count(
    db,
    sql`SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND backend_type = 'client backend'
          AND pid <> pg_backend_pid() AND application_name <> ${RESET_APPLICATION_NAME}`,
  )
}

async function countChanges(db: Handle): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of UID_TABLES) {
    counts[table] = await count(db, sql`SELECT count(*) AS n FROM ${sql.identifier(table)}`)
  }
  counts.ancestryKeys = await count(
    db,
    sql`SELECT count(DISTINCT k) AS n FROM (
          SELECT source_version_key AS k FROM lesson_bundle_versions
          UNION ALL SELECT merged_from_key FROM lesson_bundle_versions
          UNION ALL SELECT text FROM lesson_bundle_versions_texts WHERE path = 'lineageKeys'
        ) keys WHERE k ~ ${UUID_KEY} OR k LIKE 'local:%'`,
  )
  return counts
}

async function rewrite(db: Handle, current: string): Promise<void> {
  // node-postgres sends a parameterised query as ONE statement, so each runs on its own.
  const run = (query: ReturnType<typeof sql>) => db.execute(query)
  // One mapping per distinct UUID: every version uid, and every UUID key still referenced by ancestry
  // (including ancestors whose rows are gone).
  await run(
    sql`CREATE TEMP TABLE identity_reset_map (old text PRIMARY KEY, new text NOT NULL) ON COMMIT DROP`,
  )
  await run(sql`
    INSERT INTO identity_reset_map (old, new)
    SELECT k, gen_random_uuid()::text FROM (
      SELECT uid AS k FROM lesson_bundle_versions
      UNION SELECT source_version_key FROM lesson_bundle_versions
      UNION SELECT merged_from_key FROM lesson_bundle_versions
      UNION SELECT text FROM lesson_bundle_versions_texts WHERE path = 'lineageKeys'
    ) keys WHERE k ~ ${UUID_KEY}`)
  await run(
    sql`UPDATE lesson_bundle_versions v SET uid = m.new FROM identity_reset_map m WHERE m.old = v.uid`,
  )
  for (const column of ['source_version_key', 'merged_from_key']) {
    const col = sql.identifier(column)
    await run(sql`UPDATE lesson_bundle_versions v SET ${col} = m.new
                  FROM identity_reset_map m WHERE m.old = v.${col}`)
    await run(sql`UPDATE lesson_bundle_versions
                  SET ${col} = regexp_replace(${col}, '^local:[^:]+:', ${`local:${current}:`})
                  WHERE ${col} LIKE 'local:%'`)
  }
  await run(sql`UPDATE lesson_bundle_versions_texts t SET text = m.new
                FROM identity_reset_map m WHERE t.path = 'lineageKeys' AND m.old = t.text`)
  await run(sql`UPDATE lesson_bundle_versions_texts
                SET text = regexp_replace(text, '^local:[^:]+:', ${`local:${current}:`})
                WHERE path = 'lineageKeys' AND text LIKE 'local:%'`)
  for (const table of UID_TABLES) {
    if (table === 'lesson_bundle_versions') continue // mapped above, consistently with ancestry
    await run(sql`UPDATE ${sql.identifier(table)} SET uid = gen_random_uuid()::text`)
  }
  for (const table of ORIGIN_TABLES) {
    await run(sql`UPDATE ${sql.identifier(table)} SET origin_installation = ${current}`)
  }
  await run(sql`UPDATE system_settings SET installation_id = ${current}`)
}

/**
 * Report what a reset would change and, with `apply`, do it. `requireSoleClient: false` exists for
 * the integration tests, whose own connection pool is the "other client"; the script never passes it.
 * `beforeCommit` is a test seam for proving that a failure rolls everything back.
 */
export async function resetInstallationIdentity(
  payload: Payload,
  options: {
    apply: boolean
    requireSoleClient?: boolean
    beforeCommit?: (db: Handle) => Promise<void>
  },
): Promise<IdentityResetReport> {
  const previous = await readInstallationId(payload)
  const pool = (payload.db as unknown as { drizzle: Handle }).drizzle
  const otherClients = await countOtherClients(pool)
  const counts = await countChanges(pool)
  if (!options.apply) return { previous, current: previous, otherClients, counts }
  if (options.requireSoleClient !== false && otherClients > 0) {
    throw new Error(
      `${otherClients} other connection(s) to the database are open. Stop the app first ` +
        '(docker compose stop app), wait for any backup to finish, and run this again.',
    )
  }
  const transactionID = await payload.db.beginTransaction()
  if (transactionID == null) throw new Error('Could not start a database transaction.')
  try {
    const db = await txDb({ payload, transactionID }, { requireTransaction: true })
    const current = String(
      rowsOf(await db.execute(sql`SELECT gen_random_uuid()::text AS id`))[0].id,
    )
    await rewrite(db, current)
    await options.beforeCommit?.(db)
    await payload.db.commitTransaction(transactionID)
    return { previous, current, otherClients, counts }
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
