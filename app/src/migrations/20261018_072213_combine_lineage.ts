import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { backfillLineages, type LineageRow } from '../lib/combine/backfill'
import { rowsOf } from '../lib/txDb'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lesson_bundle_versions_numbers" (
      "id" serial PRIMARY KEY NOT NULL,
      "number" numeric,
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL
    );
    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "merged_from_id" integer;
    DO $$ BEGIN
      ALTER TABLE "lesson_bundle_versions_numbers" ADD CONSTRAINT "lesson_bundle_versions_numbers_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE cascade;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_numbers_order_parent_idx"
      ON "lesson_bundle_versions_numbers" USING btree ("order", "parent_id");
    DO $$ BEGIN
      ALTER TABLE "lesson_bundle_versions" ADD CONSTRAINT "lesson_bundle_versions_merged_from_id_lesson_bundle_versions_id_fk"
        FOREIGN KEY ("merged_from_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_merged_from_idx" ON "lesson_bundle_versions" ("merged_from_id");
  `)
  // Metadata only, one plan at a time. Preserve existing closures on rerun and leave timestamps alone.
  const plans = rowsOf(
    await db.execute(sql`SELECT DISTINCT lesson_plan_id AS id FROM lesson_bundle_versions`),
  ) as { id: number }[]
  for (const plan of plans) {
    const rows = rowsOf(
      await db.execute(sql`
      SELECT v.id, v.source_version_id AS source, v.merged_from_id AS second,
        COALESCE((SELECT json_agg(n.number::integer) FROM lesson_bundle_versions_numbers n
          WHERE n.parent_id = v.id AND n.path = 'lineage'), '[]'::json) AS lineage
      FROM lesson_bundle_versions v WHERE v.lesson_plan_id = ${plan.id}
    `),
    ) as unknown as LineageRow[]
    for (const [id, lineage] of backfillLineages(rows)) {
      await db.execute(
        sql`DELETE FROM lesson_bundle_versions_numbers WHERE parent_id = ${id} AND path = 'lineage'`,
      )
      if (lineage.length) {
        const values = lineage.map(
          (ancestor, index) => sql`(${ancestor}, ${index + 1}, ${id}, 'lineage')`,
        )
        await db.execute(sql`
          INSERT INTO lesson_bundle_versions_numbers (number, "order", parent_id, path)
          VALUES ${sql.join(values, sql`, `)}
        `)
      }
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "lesson_bundle_versions_numbers" CASCADE;
    ALTER TABLE "lesson_bundle_versions" DROP CONSTRAINT IF EXISTS "lesson_bundle_versions_merged_from_id_lesson_bundle_versions_id_fk";
    DROP INDEX IF EXISTS "lesson_bundle_versions_merged_from_idx";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "merged_from_id";
  `)
}
