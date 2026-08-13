import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { rowsOf } from './txDb'

/**
 * Count versions per lesson plan in PostgreSQL instead of transferring one relationship stub per
 * version. Caller authentication is required: this raw aggregate intentionally mirrors
 * `lessonBundleVersionRead`, whose complete policy is `Boolean(user)`.
 */
export async function versionCountsByPlan(payload: Payload): Promise<Map<number, number>> {
  const adapter = payload.db as unknown as {
    drizzle: { execute: (query: unknown) => Promise<unknown> }
  }
  const result = await adapter.drizzle.execute(sql`
    SELECT "lesson_plan_id" AS "planId", COUNT(*)::integer AS "versionCount"
    FROM "lesson_bundle_versions"
    WHERE "lesson_plan_id" IS NOT NULL
    GROUP BY "lesson_plan_id"
  `)
  const counts = new Map<number, number>()
  for (const row of rowsOf(result)) {
    const planId = Number(row.planId)
    const versionCount = Number(row.versionCount)
    if (Number.isSafeInteger(planId) && Number.isSafeInteger(versionCount)) {
      counts.set(planId, versionCount)
    }
  }
  return counts
}
