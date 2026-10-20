import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Advanced tools (2026-10-20; `lib/advancedTools.ts`). One site-wide switch, stored with the other
 * System → Features flags. DEFAULT false — Standard — so existing installations also start in
 * Standard, as the operator decided; the release notes announce it, and a Site Administrator switches
 * it on in Manage → System → Features. Display only: no permission changes with it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "features_advanced_tools" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "features_advanced_tools";`)
}
