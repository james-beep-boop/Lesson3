import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "edit_recovery" ALTER COLUMN "source_version_id" DROP NOT NULL;
    ALTER TABLE "edit_recovery" ALTER COLUMN "lesson_plan_id" DROP NOT NULL;
    ALTER TABLE "edit_recovery" ADD COLUMN "deck_version_id" integer;
    ALTER TABLE "edit_recovery" ADD CONSTRAINT "edit_recovery_deck_version_id_deck_versions_id_fk"
      FOREIGN KEY ("deck_version_id") REFERENCES "public"."deck_versions"("id") ON DELETE SET NULL;
    CREATE INDEX "edit_recovery_deck_version_idx" ON "edit_recovery" USING btree ("deck_version_id");
    CREATE UNIQUE INDEX "user_deckVersion_idx" ON "edit_recovery" USING btree ("user_id","deck_version_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "edit_recovery" WHERE "deck_version_id" IS NOT NULL;
    ALTER TABLE "edit_recovery" DROP COLUMN "deck_version_id";
    ALTER TABLE "edit_recovery" ALTER COLUMN "source_version_id" SET NOT NULL;
    ALTER TABLE "edit_recovery" ALTER COLUMN "lesson_plan_id" SET NOT NULL;
  `)
}
