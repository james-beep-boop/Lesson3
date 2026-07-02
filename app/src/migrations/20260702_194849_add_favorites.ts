import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the `favorites` collection (§10 PR ① — per-user lesson-plan bookmarks): the table, its FKs,
 * the compound unique index (one favorite per user per plan), and the locked-documents wiring
 * Payload adds for every collection. Generated on the Rock (deps image, Node 22), then guarded so
 * up/down are idempotent (project rule). `down` drops only what this migration owns.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "favorites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"lesson_plan_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "favorites_id" integer;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_user_id_users_id_fk') THEN
      ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorites_lesson_plan_id_lesson_plans_id_fk') THEN
      ALTER TABLE "favorites" ADD CONSTRAINT "favorites_lesson_plan_id_lesson_plans_id_fk"
        FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payload_locked_documents_rels_favorites_fk') THEN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_favorites_fk"
        FOREIGN KEY ("favorites_id") REFERENCES "public"."favorites"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS "favorites_user_idx" ON "favorites" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "favorites_lesson_plan_idx" ON "favorites" USING btree ("lesson_plan_id");
  CREATE INDEX IF NOT EXISTS "favorites_updated_at_idx" ON "favorites" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "favorites_created_at_idx" ON "favorites" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "user_lessonPlan_idx" ON "favorites" USING btree ("user_id","lesson_plan_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_favorites_id_idx" ON "payload_locked_documents_rels" USING btree ("favorites_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "favorites" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_favorites_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_favorites_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "favorites_id";`)
}
