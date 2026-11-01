import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "reset_code_hash" varchar;
  ALTER TABLE "users" ADD COLUMN "reset_code_expires_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "reset_code_attempts" numeric DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "reset_code_hash";
  ALTER TABLE "users" DROP COLUMN "reset_code_expires_at";
  ALTER TABLE "users" DROP COLUMN "reset_code_attempts";`)
}
