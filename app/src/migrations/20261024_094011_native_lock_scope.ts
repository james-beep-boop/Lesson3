import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Native document locks stay only where the built-in admin form is used (audit F-C22-002; DECISIONS
 * 2026-10-24 "Native document locks", decision 2). Payload keeps one relationship column per lockable
 * collection in its lock table, so turning locking off for favorites, messages, edit recovery and the
 * three discussion collections drops those columns. (`users_id` stays: it records who holds a lock.
 * Users and the system-settings global lose locking without a schema change.) Lock rows are transient
 * presence state, nothing of record: the rows that point at those collections are deleted first, so
 * none survive pointing nowhere.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_locked_documents" WHERE "global_slug" = 'system-settings' OR "id" IN (
     SELECT "parent_id" FROM "payload_locked_documents_rels" WHERE "path" = 'document' AND (
       "users_id" IS NOT NULL OR "favorites_id" IS NOT NULL OR "messages_id" IS NOT NULL
       OR "edit_recovery_id" IS NOT NULL OR "discussion_topics_id" IS NOT NULL
       OR "discussion_replies_id" IS NOT NULL OR "discussion_participation_id" IS NOT NULL));

   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_favorites_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_edit_recovery_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_topics_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_replies_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_participation_fk";
  
  DROP INDEX "payload_locked_documents_rels_favorites_id_idx";
  DROP INDEX "payload_locked_documents_rels_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_edit_recovery_id_idx";
  DROP INDEX "payload_locked_documents_rels_discussion_topics_id_idx";
  DROP INDEX "payload_locked_documents_rels_discussion_replies_id_idx";
  DROP INDEX "payload_locked_documents_rels_discussion_participation_i_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "favorites_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "edit_recovery_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_topics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_replies_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_participation_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "favorites_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "messages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "edit_recovery_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_topics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_replies_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_participation_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_favorites_fk" FOREIGN KEY ("favorites_id") REFERENCES "public"."favorites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_messages_fk" FOREIGN KEY ("messages_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_edit_recovery_fk" FOREIGN KEY ("edit_recovery_id") REFERENCES "public"."edit_recovery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_topics_fk" FOREIGN KEY ("discussion_topics_id") REFERENCES "public"."discussion_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_replies_fk" FOREIGN KEY ("discussion_replies_id") REFERENCES "public"."discussion_replies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_participation_fk" FOREIGN KEY ("discussion_participation_id") REFERENCES "public"."discussion_participation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_favorites_id_idx" ON "payload_locked_documents_rels" USING btree ("favorites_id");
  CREATE INDEX "payload_locked_documents_rels_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("messages_id");
  CREATE INDEX "payload_locked_documents_rels_edit_recovery_id_idx" ON "payload_locked_documents_rels" USING btree ("edit_recovery_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_topics_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_replies_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_replies_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_participation_i_idx" ON "payload_locked_documents_rels" USING btree ("discussion_participation_id");`)
}
