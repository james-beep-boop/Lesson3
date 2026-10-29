import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { rowsOf } from '../lib/txDb'

/**
 * Worldwide identity, part 2 (2026-10-29; `docs/PLAN-worldwide-ids-part2-2026-10-29.md`).
 *
 * Adds a `uid` to messages, discussion topics and replies; `origin_installation` to those and to users
 * and versions; and version ancestry by worldwide key (`source_version_key`, `merged_from_key`, and
 * `lineageKeys` aligned with the numeric `lineage`; `lib/identity/ancestorKey.ts`). Additive: nothing
 * reads them yet.
 *
 * Hand-edited from `migrate:create` like `20261019_211325_worldwide_ids`: columns are added nullable,
 * filled only where empty, then constrained, so a rerun keeps every value already written.
 *
 * Ancestry is backfilled from each version's WHOLE recorded closure, not only its direct parents: with
 * A → B → C and B deleted, C's `lineage` still holds A and B, so C gets A's real key and B a local key
 * (`local:<installation>:<serial>`), the only part that is lost. A cleared parent relationship cannot
 * say which closure entry it was, so its key stays empty.
 */
export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lesson_bundle_versions_texts" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "text" varchar
    );
    DO $$ BEGIN
      ALTER TABLE "lesson_bundle_versions_texts" ADD CONSTRAINT "lesson_bundle_versions_texts_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "public"."lesson_bundle_versions"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_texts_order_parent" ON "lesson_bundle_versions_texts" USING btree ("order","parent_id");

    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "origin_installation" varchar;
    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "source_version_key" varchar;
    ALTER TABLE "lesson_bundle_versions" ADD COLUMN IF NOT EXISTS "merged_from_key" varchar;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "origin_installation" varchar;
    ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "origin_installation" varchar;
    ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "discussion_topics" ADD COLUMN IF NOT EXISTS "origin_installation" varchar;
    ALTER TABLE "discussion_replies" ADD COLUMN IF NOT EXISTS "uid" varchar;
    ALTER TABLE "discussion_replies" ADD COLUMN IF NOT EXISTS "origin_installation" varchar;

    UPDATE "messages" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
    UPDATE "discussion_topics" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
    UPDATE "discussion_replies" SET "uid" = gen_random_uuid()::text WHERE "uid" IS NULL;
  `)

  // Every existing row was written here. The singleton and its NOT NULL id exist since worldwide_ids.
  for (const table of [
    'lesson_bundle_versions',
    'users',
    'messages',
    'discussion_topics',
    'discussion_replies',
  ]) {
    await db.execute(sql`
      UPDATE ${sql.identifier(table)}
      SET "origin_installation" = (SELECT "installation_id" FROM "system_settings" ORDER BY "id" LIMIT 1)
      WHERE "origin_installation" IS NULL
    `)
  }

  // Count before filling: only versions that have no keys yet are filled, and reported.
  const [{ lost }] = rowsOf(
    await db.execute(sql`
      SELECT count(*)::int AS lost FROM "lesson_bundle_versions_numbers" n
      WHERE n."path" = 'lineage'
        AND NOT EXISTS (SELECT 1 FROM "lesson_bundle_versions" a WHERE a."id" = n."number")
        AND NOT EXISTS (SELECT 1 FROM "lesson_bundle_versions_texts" t
                        WHERE t."parent_id" = n."parent_id" AND t."path" = 'lineageKeys')
    `),
  )
  await db.execute(sql`
    INSERT INTO "lesson_bundle_versions_texts" ("order", "parent_id", "path", "text")
    SELECT n."order", n."parent_id", 'lineageKeys',
      COALESCE(a."release_fingerprint", a."uid",
        'local:' || (SELECT "installation_id" FROM "system_settings" ORDER BY "id" LIMIT 1)
          || ':' || n."number"::bigint::text)
    FROM "lesson_bundle_versions_numbers" n
    LEFT JOIN "lesson_bundle_versions" a ON a."id" = n."number"
    WHERE n."path" = 'lineage'
      AND NOT EXISTS (SELECT 1 FROM "lesson_bundle_versions_texts" t
                      WHERE t."parent_id" = n."parent_id" AND t."path" = 'lineageKeys');

    UPDATE "lesson_bundle_versions" v
    SET "source_version_key" = COALESCE(p."release_fingerprint", p."uid")
    FROM "lesson_bundle_versions" p
    WHERE p."id" = v."source_version_id" AND v."source_version_key" IS NULL;

    UPDATE "lesson_bundle_versions" v
    SET "merged_from_key" = COALESCE(p."release_fingerprint", p."uid")
    FROM "lesson_bundle_versions" p
    WHERE p."id" = v."merged_from_id" AND v."merged_from_key" IS NULL;
  `)
  // A version with ancestors always had a source; a NULL source on one means its parent was deleted.
  const [{ unresolved }] = rowsOf(
    await db.execute(sql`
      SELECT count(*)::int AS unresolved FROM "lesson_bundle_versions" v
      WHERE v."source_version_key" IS NULL
        AND EXISTS (SELECT 1 FROM "lesson_bundle_versions_numbers" n
                    WHERE n."parent_id" = v."id" AND n."path" = 'lineage')
    `),
  )

  await db.execute(sql`
    ALTER TABLE "lesson_bundle_versions" ALTER COLUMN "origin_installation" SET NOT NULL;
    ALTER TABLE "users" ALTER COLUMN "origin_installation" SET NOT NULL;
    ALTER TABLE "messages" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "messages" ALTER COLUMN "origin_installation" SET NOT NULL;
    ALTER TABLE "discussion_topics" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "discussion_topics" ALTER COLUMN "origin_installation" SET NOT NULL;
    ALTER TABLE "discussion_replies" ALTER COLUMN "uid" SET NOT NULL;
    ALTER TABLE "discussion_replies" ALTER COLUMN "origin_installation" SET NOT NULL;

    CREATE INDEX IF NOT EXISTS "lesson_bundle_versions_origin_installation_idx" ON "lesson_bundle_versions" USING btree ("origin_installation");
    CREATE INDEX IF NOT EXISTS "users_origin_installation_idx" ON "users" USING btree ("origin_installation");
    CREATE UNIQUE INDEX IF NOT EXISTS "messages_uid_idx" ON "messages" USING btree ("uid");
    CREATE INDEX IF NOT EXISTS "messages_origin_installation_idx" ON "messages" USING btree ("origin_installation");
    CREATE UNIQUE INDEX IF NOT EXISTS "discussion_topics_uid_idx" ON "discussion_topics" USING btree ("uid");
    CREATE INDEX IF NOT EXISTS "discussion_topics_origin_installation_idx" ON "discussion_topics" USING btree ("origin_installation");
    CREATE UNIQUE INDEX IF NOT EXISTS "discussion_replies_uid_idx" ON "discussion_replies" USING btree ("uid");
    CREATE INDEX IF NOT EXISTS "discussion_replies_origin_installation_idx" ON "discussion_replies" USING btree ("origin_installation");
  `)
  if (lost || unresolved) {
    payload.logger.info(
      { lostAncestors: lost, unresolvedParents: unresolved },
      'Worldwide ancestry backfilled; ancestors deleted earlier keep only a local key',
    )
  }
}

/** Removes the columns and keys. Values issued before a down are lost; an up afterwards issues new ones. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "lesson_bundle_versions_texts" CASCADE;
    DROP INDEX IF EXISTS "lesson_bundle_versions_origin_installation_idx";
    DROP INDEX IF EXISTS "users_origin_installation_idx";
    DROP INDEX IF EXISTS "messages_uid_idx";
    DROP INDEX IF EXISTS "messages_origin_installation_idx";
    DROP INDEX IF EXISTS "discussion_topics_uid_idx";
    DROP INDEX IF EXISTS "discussion_topics_origin_installation_idx";
    DROP INDEX IF EXISTS "discussion_replies_uid_idx";
    DROP INDEX IF EXISTS "discussion_replies_origin_installation_idx";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "origin_installation";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "source_version_key";
    ALTER TABLE "lesson_bundle_versions" DROP COLUMN IF EXISTS "merged_from_key";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "origin_installation";
    ALTER TABLE "messages" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "messages" DROP COLUMN IF EXISTS "origin_installation";
    ALTER TABLE "discussion_topics" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "discussion_topics" DROP COLUMN IF EXISTS "origin_installation";
    ALTER TABLE "discussion_replies" DROP COLUMN IF EXISTS "uid";
    ALTER TABLE "discussion_replies" DROP COLUMN IF EXISTS "origin_installation";
  `)
}
