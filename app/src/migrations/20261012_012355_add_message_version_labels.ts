import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { versionReferenceLabel } from '../lib/lessonReference'
import { rowsOf } from '../lib/txDb'

/** Backfill only surviving version references, using exactly the live label formatter. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "messages" ADD COLUMN "version_label" varchar`)
  let afterId = 0
  for (;;) {
    const rows = rowsOf(
      await db.execute(sql`
      SELECT m.id, v.title, v.semver, v.meta_substrand_name AS substrand_name
        FROM messages m JOIN lesson_bundle_versions v ON v.id = m.version_id
       WHERE m.id > ${afterId} AND m.version_label IS NULL
       ORDER BY m.id LIMIT 500
    `),
    ) as { id: number; title: string; semver: string; substrand_name: string | null }[]
    if (rows.length === 0) break
    const values = rows.map(
      (row) =>
        sql`(${row.id}::integer, ${versionReferenceLabel({
          title: row.title,
          semver: row.semver,
          meta: { substrand_name: row.substrand_name },
        })}::varchar)`,
    )
    await db.execute(sql`
      UPDATE messages m SET version_label = labels.label
        FROM (VALUES ${sql.join(values, sql`, `)}) AS labels(id, label)
       WHERE m.id = labels.id AND m.version_label IS NULL
    `)
    afterId = rows[rows.length - 1].id
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "messages" DROP COLUMN "version_label"`)
}
