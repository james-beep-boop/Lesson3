import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Add `features_forum_enabled` (default ON), and make sure the settings row exists.
 *
 * The column is generated. The INSERT is hand-written, and it is the part that matters.
 *
 * ⚑ WHY THE ROW. `system_settings` is a Payload global, and a global's row is created by its first
 * write — but until 2026-10-09 nothing could write it (`access.update` is `() => false`, and the Save
 * endpoint did not exist). Measured on a database migrated from scratch: **zero rows**. With no row,
 * `lib/systemFlags.ts` reads every flag as absent, and absent fails CLOSED — so a fresh installation would
 * have the forum OFF, contradicting the operator's "on by default" (`docs/DESIGN-discussions-2026-10-09.md`
 * §16.1), and the first Save would have no row for its freshness token to describe. Inserting the
 * singleton here makes the stored defaults what an installation actually gets, and leaves "absent" to
 * mean only what fail-closed is for: something is broken.
 *
 * `WHERE NOT EXISTS`, so an installation that already has its row keeps it; the `ADD COLUMN … DEFAULT
 * true` above has already given that row the new flag's default.
 *
 * ⚑ THE DOWN MIGRATION LEAVES THE ROW. Deleting it would also delete the provenance rows that cascade
 * from it, and a settings row with every remaining column at its default is what a later re-run of `up`
 * would produce anyway.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" ADD COLUMN "features_forum_enabled" boolean DEFAULT true;
  INSERT INTO "system_settings" ("updated_at", "created_at")
    SELECT now(), now() WHERE NOT EXISTS (SELECT 1 FROM "system_settings");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" DROP COLUMN "features_forum_enabled";`)
}
