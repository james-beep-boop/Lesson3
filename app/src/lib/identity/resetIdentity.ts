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
import { randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import { readInstallationId } from './installationId'
import { poolDb, rowsOf, txDb, type DrizzleHandle as Handle } from '../txDb'

export const RESET_APPLICATION_NAME = 'lesson3-identity-reset'

const UUID_KEY = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

/** Tables whose rows carry a `uid`, apart from versions (whose uids are mapped with their ancestry). */
const PLAIN_UID_TABLES = [
  'users',
  'lesson_plans',
  'messages',
  'discussion_topics',
  'discussion_replies',
] as const
/** Tables whose rows carry an `originInstallation`: every uid table but lesson plans. */
const ORIGIN_TABLES = [
  'lesson_bundle_versions',
  ...PLAIN_UID_TABLES.filter((table) => table !== 'lesson_plans'),
] as const

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
  for (const table of ['lesson_bundle_versions', ...PLAIN_UID_TABLES]) {
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
  // One mapping per distinct UUID: every version uid, and every UUID key still referenced by ancestry
  // (including ancestors whose rows are gone).
  await db.execute(
    sql`CREATE TEMP TABLE identity_reset_map (old text PRIMARY KEY, new text NOT NULL) ON COMMIT DROP`,
  )
  await db.execute(sql`
    INSERT INTO identity_reset_map (old, new)
    SELECT k, gen_random_uuid()::text FROM (
      SELECT uid AS k FROM lesson_bundle_versions
      UNION SELECT source_version_key FROM lesson_bundle_versions
      UNION SELECT merged_from_key FROM lesson_bundle_versions
      UNION SELECT text FROM lesson_bundle_versions_texts WHERE path = 'lineageKeys'
    ) keys WHERE k ~ ${UUID_KEY}`)
  await db.execute(
    sql`UPDATE lesson_bundle_versions v SET uid = m.new FROM identity_reset_map m WHERE m.old = v.uid`,
  )
  for (const column of ['source_version_key', 'merged_from_key']) {
    const col = sql.identifier(column)
    await db.execute(sql`UPDATE lesson_bundle_versions v SET ${col} = m.new
                  FROM identity_reset_map m WHERE m.old = v.${col}`)
    await db.execute(sql`UPDATE lesson_bundle_versions
                  SET ${col} = regexp_replace(${col}, '^local:[^:]+:', ${`local:${current}:`})
                  WHERE ${col} LIKE 'local:%'`)
  }
  await db.execute(sql`UPDATE lesson_bundle_versions_texts t SET text = m.new
                FROM identity_reset_map m WHERE t.path = 'lineageKeys' AND m.old = t.text`)
  await db.execute(sql`UPDATE lesson_bundle_versions_texts
                SET text = regexp_replace(text, '^local:[^:]+:', ${`local:${current}:`})
                WHERE path = 'lineageKeys' AND text LIKE 'local:%'`)
  for (const table of PLAIN_UID_TABLES) {
    await db.execute(sql`UPDATE ${sql.identifier(table)} SET uid = gen_random_uuid()::text`)
  }
  for (const table of ORIGIN_TABLES) {
    await db.execute(sql`UPDATE ${sql.identifier(table)} SET origin_installation = ${current}`)
  }
  await db.execute(sql`UPDATE system_settings SET installation_id = ${current}`)
}

/**
 * Report what a reset would change and, with `apply`, do it. `requireSoleClient: false` exists for
 * the integration tests, whose own connection pool is the "other client"; the script never passes it.
 */
export async function resetInstallationIdentity(
  payload: Payload,
  options: { apply: boolean; requireSoleClient?: boolean },
): Promise<IdentityResetReport> {
  const previous = await readInstallationId(payload)
  const otherClients = await countOtherClients(poolDb(payload))
  const counts = await countChanges(poolDb(payload))
  if (!options.apply) return { previous, current: previous, otherClients, counts }
  if (options.requireSoleClient !== false && otherClients > 0) {
    throw new Error(
      `${otherClients} other connection(s) to the database are open. Stop the app first ` +
        '(docker compose stop app), wait for any backup to finish, and run this again.',
    )
  }
  const current = randomUUID()
  const req = await createLocalReq({}, payload)
  const shouldCommit = await initTransaction(req)
  try {
    await rewrite(await txDb(req, { requireTransaction: true }), current)
    if (shouldCommit) await commitTransaction(req)
    return { previous, current, otherClients, counts }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
