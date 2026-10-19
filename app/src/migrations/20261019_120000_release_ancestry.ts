import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { auditReleaseAncestry, type ReleaseRow } from '../ingest/releaseAncestry'
import { rowsOf } from '../lib/txDb'

/** Metadata-only, forward data repair. The runner supplies the transaction; no Payload save hooks. */
export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const plans = rowsOf(
    await db.execute(sql`
    SELECT DISTINCT lesson_plan_id AS id FROM lesson_bundle_versions ORDER BY lesson_plan_id
  `),
  ) as { id: number }[]
  for (const plan of plans) {
    const rows = rowsOf(
      await db.execute(sql`
      SELECT v.id, v.semver, v.author_id AS author, v.meta_substrand_id AS "substrandId",
        v.source_version_id AS source, v.merged_from_id AS second,
        COALESCE((SELECT json_agg(n.number::integer ORDER BY n."order")
          FROM lesson_bundle_versions_numbers n WHERE n.parent_id = v.id AND n.path = 'lineage'),
          '[]'::json) AS lineage
      FROM lesson_bundle_versions v WHERE v.lesson_plan_id = ${plan.id}
      ORDER BY v.id FOR UPDATE
    `),
    ) as unknown as ReleaseRow[]
    const audit = auditReleaseAncestry(rows)
    for (const skipped of audit.skipped)
      payload.logger.warn(
        { plan: plan.id, version: skipped.id, reason: skipped.reason },
        'Release ancestry backfill skipped history',
      )
    for (const [id, source] of audit.parents) {
      await db.execute(sql`
        UPDATE lesson_bundle_versions SET source_version_id = ${source}
        WHERE id = ${id} AND source_version_id IS NULL
      `)
    }
    for (const [id, lineage] of audit.lineage) {
      if (JSON.stringify(rows.find((r) => r.id === id)?.lineage ?? []) === JSON.stringify(lineage))
        continue
      await db.execute(sql`
        DELETE FROM lesson_bundle_versions_numbers WHERE parent_id = ${id} AND path = 'lineage'
      `)
      if (lineage.length)
        await db.execute(sql`
        INSERT INTO lesson_bundle_versions_numbers (number, "order", parent_id, path)
        VALUES ${sql.join(
          lineage.map((ancestor, i) => sql`(${ancestor}, ${i + 1}, ${id}, 'lineage')`),
          sql`, `,
        )}
      `)
    }
    if (audit.parents.size)
      payload.logger.info(
        { plan: plan.id, linked: audit.parents.size },
        'Release ancestry backfilled; content and timestamps unchanged',
      )
  }
}

/**
 * Intentionally preserve the added ancestry: earlier code tolerates these links, and later saves
 * may depend on them. A no-op also lets later migrations in the batch down/reset/refresh normally.
 */
export async function down(): Promise<void> {}
