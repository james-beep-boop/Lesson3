import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * `system-settings` — the project's FIRST Payload global (Manage → System, 2026-08-21).
 *
 * Two tables, because a global with an array field is a parent row plus a child table:
 * `system_settings` holds the runtime capability flags, and `system_settings_flag_changes` holds one
 * per-flag provenance row (who turned it on or off, and when). Design:
 * `docs/DESIGN-system-panel-2026-08-21.md`.
 *
 * ⚑ BOTH FLAGS DEFAULT TRUE, which is deliberate and is NOT a hole in the fail-closed rule. Fail-closed
 * governs a failed READ — absence, an error, a stale cache all mean off. The stored DEFAULT has the
 * opposite job: preserve today's behaviour so the enforcement PR is not a silent outage on every
 * installation. And `features_public_library_live` cannot over-grant, because `PUBLIC_LIBRARY_ENABLED`
 * is the boot-time ceiling above it: on an installation that never set that variable the column is
 * unreachable whatever it says.
 *
 * ⚑ `ON DELETE set null` on `changed_by_id`, with the same honesty as `users_assignments.granted_by_id`
 * (#258): delete the account that flipped a flag and the surviving row degrades to "unknown", which is
 * exactly what it should mean. A null is UNKNOWN, never NOBODY.
 *
 * ⚑ NOTHING READS THE FLAGS YET. `PUBLIC_LIBRARY_ENABLED` alone still governs public discovery and
 * outbound email is still unconditional; this migration is here so the enforcement PR is a change to
 * readers only, with no second schema change. Verified UP and DOWN against a real database — DOWN drops
 * both tables, which is correct for a global nothing has read yet.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "system_settings_flag_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"flag" varchar NOT NULL,
  	"enabled" boolean,
  	"changed_by_id" integer,
  	"changed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "system_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"features_public_library_live" boolean DEFAULT true,
  	"features_outbound_email" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "system_settings_flag_changes" ADD CONSTRAINT "system_settings_flag_changes_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "system_settings_flag_changes" ADD CONSTRAINT "system_settings_flag_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."system_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "system_settings_flag_changes_order_idx" ON "system_settings_flag_changes" USING btree ("_order");
  CREATE INDEX "system_settings_flag_changes_parent_id_idx" ON "system_settings_flag_changes" USING btree ("_parent_id");
  CREATE INDEX "system_settings_flag_changes_changed_by_idx" ON "system_settings_flag_changes" USING btree ("changed_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "system_settings_flag_changes" CASCADE;
  DROP TABLE "system_settings" CASCADE;`)
}
