import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The discussion forum's three tables (discussions PR 3a; `docs/DESIGN-discussions-2026-10-09.md`).
 *
 * Generated, and checked by hand for the delete behaviour of every foreign key (§16.4, "Lesson/version
 * deletion" and "Account deletion"). Every FK is Payload's `ON DELETE SET NULL`, which means:
 *
 *   - `ref_version_id` / `ref_plan_id` (nullable): deleting lesson material clears the reference and
 *     never blocks or removes a post;
 *   - `author_id` and the `*_redacted_by_id` columns (nullable): deleting an account leaves its posts,
 *     shown as "Deleted User";
 *   - `discussion_replies.topic_id` and `discussion_participation.user_id` / `topic_id` are NOT NULL, so
 *     SET NULL would fail — which is why the topic's `cascadeDeleteThread` and the user's
 *     `cascadeDeleteUserParticipation` remove those rows first.
 *
 * `joinedAtSeq` is a virtual field and has no column.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "discussion_topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"author_id" integer,
  	"submission_key" varchar,
  	"ref_version_id" integer,
  	"ref_plan_id" integer,
  	"ref_label" varchar,
  	"pinned_at" timestamp(3) with time zone,
  	"last_activity_at" timestamp(3) with time zone,
  	"last_seq" numeric DEFAULT 0,
  	"title_redacted_at" timestamp(3) with time zone,
  	"title_redacted_by_id" integer,
  	"redacted_at" timestamp(3) with time zone,
  	"redacted_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussion_replies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"topic_id" integer NOT NULL,
  	"seq" numeric NOT NULL,
  	"body" varchar,
  	"author_id" integer,
  	"submission_key" varchar,
  	"ref_version_id" integer,
  	"ref_plan_id" integer,
  	"ref_label" varchar,
  	"redacted_at" timestamp(3) with time zone,
  	"redacted_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "discussion_participation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"topic_id" integer NOT NULL,
  	"last_read_seq" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_topics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_replies_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "discussion_participation_id" integer;
  ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_ref_version_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("ref_version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_ref_plan_id_lesson_plans_id_fk" FOREIGN KEY ("ref_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_title_redacted_by_id_users_id_fk" FOREIGN KEY ("title_redacted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_topics" ADD CONSTRAINT "discussion_topics_redacted_by_id_users_id_fk" FOREIGN KEY ("redacted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_topic_id_discussion_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discussion_topics"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_ref_version_id_lesson_bundle_versions_id_fk" FOREIGN KEY ("ref_version_id") REFERENCES "public"."lesson_bundle_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_ref_plan_id_lesson_plans_id_fk" FOREIGN KEY ("ref_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_redacted_by_id_users_id_fk" FOREIGN KEY ("redacted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_participation" ADD CONSTRAINT "discussion_participation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discussion_participation" ADD CONSTRAINT "discussion_participation_topic_id_discussion_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."discussion_topics"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "discussion_topics_author_idx" ON "discussion_topics" USING btree ("author_id");
  CREATE INDEX "discussion_topics_ref_version_idx" ON "discussion_topics" USING btree ("ref_version_id");
  CREATE INDEX "discussion_topics_ref_plan_idx" ON "discussion_topics" USING btree ("ref_plan_id");
  CREATE INDEX "discussion_topics_pinned_at_idx" ON "discussion_topics" USING btree ("pinned_at");
  CREATE INDEX "discussion_topics_last_activity_at_idx" ON "discussion_topics" USING btree ("last_activity_at");
  CREATE INDEX "discussion_topics_title_redacted_by_idx" ON "discussion_topics" USING btree ("title_redacted_by_id");
  CREATE INDEX "discussion_topics_redacted_by_idx" ON "discussion_topics" USING btree ("redacted_by_id");
  CREATE INDEX "discussion_topics_updated_at_idx" ON "discussion_topics" USING btree ("updated_at");
  CREATE INDEX "discussion_topics_created_at_idx" ON "discussion_topics" USING btree ("created_at");
  CREATE UNIQUE INDEX "author_submissionKey_idx" ON "discussion_topics" USING btree ("author_id","submission_key");
  CREATE INDEX "discussion_replies_topic_idx" ON "discussion_replies" USING btree ("topic_id");
  CREATE INDEX "discussion_replies_author_idx" ON "discussion_replies" USING btree ("author_id");
  CREATE INDEX "discussion_replies_ref_version_idx" ON "discussion_replies" USING btree ("ref_version_id");
  CREATE INDEX "discussion_replies_ref_plan_idx" ON "discussion_replies" USING btree ("ref_plan_id");
  CREATE INDEX "discussion_replies_redacted_by_idx" ON "discussion_replies" USING btree ("redacted_by_id");
  CREATE INDEX "discussion_replies_updated_at_idx" ON "discussion_replies" USING btree ("updated_at");
  CREATE INDEX "discussion_replies_created_at_idx" ON "discussion_replies" USING btree ("created_at");
  CREATE UNIQUE INDEX "topic_seq_idx" ON "discussion_replies" USING btree ("topic_id","seq");
  CREATE UNIQUE INDEX "author_submissionKey_1_idx" ON "discussion_replies" USING btree ("author_id","submission_key");
  CREATE INDEX "discussion_participation_user_idx" ON "discussion_participation" USING btree ("user_id");
  CREATE INDEX "discussion_participation_topic_idx" ON "discussion_participation" USING btree ("topic_id");
  CREATE INDEX "discussion_participation_updated_at_idx" ON "discussion_participation" USING btree ("updated_at");
  CREATE INDEX "discussion_participation_created_at_idx" ON "discussion_participation" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_topic_idx" ON "discussion_participation" USING btree ("user_id","topic_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_topics_fk" FOREIGN KEY ("discussion_topics_id") REFERENCES "public"."discussion_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_replies_fk" FOREIGN KEY ("discussion_replies_id") REFERENCES "public"."discussion_replies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_discussion_participation_fk" FOREIGN KEY ("discussion_participation_id") REFERENCES "public"."discussion_participation"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_discussion_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_topics_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_replies_id_idx" ON "payload_locked_documents_rels" USING btree ("discussion_replies_id");
  CREATE INDEX "payload_locked_documents_rels_discussion_participation_i_idx" ON "payload_locked_documents_rels" USING btree ("discussion_participation_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "discussion_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discussion_replies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "discussion_participation" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "discussion_topics" CASCADE;
  DROP TABLE "discussion_replies" CASCADE;
  DROP TABLE "discussion_participation" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_topics_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_replies_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_discussion_participation_fk";
  
  DROP INDEX "payload_locked_documents_rels_discussion_topics_id_idx";
  DROP INDEX "payload_locked_documents_rels_discussion_replies_id_idx";
  DROP INDEX "payload_locked_documents_rels_discussion_participation_i_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_topics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_replies_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "discussion_participation_id";`)
}
