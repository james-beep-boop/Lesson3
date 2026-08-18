import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { rowsOf } from './txDb'

/** How many people hold each kind of grant on one subject-grade. */
export interface AssignmentCounts {
  /** Teachers with editing access there (stored role `editor` — a capability, not a user type). */
  editors: number
  /** Subject Administrators there. At most one by policy, but counted rather than assumed. */
  subjectAdmins: number
}

export const NO_ASSIGNMENTS: AssignmentCounts = { editors: 0, subjectAdmins: 0 }

/**
 * Grant counts per subject-grade, for the delete confirmation in Manage → Subject grades.
 *
 * ⚑ WHY THIS EXISTS AT ALL. `guardSubjectGradeDelete` blocks a delete that would orphan lesson plans
 * or versions, but role assignments do NOT block it — they are CASCADED, silently stripped from
 * every holder. That is deliberate (a grant scoped to a subject-grade that is going away is
 * meaningless) and it predates this panel. What changes with the panel is reach: the cascade used to
 * sit behind Payload's native collection table and now sits behind a button on Manage. The design
 * doc's own §2.8 says these gaps "matter more once a convenient delete button exists", so the
 * confirmation names the consequence instead of letting an administrator revoke three people's
 * editing access without being told.
 *
 * ⚑ COUNTS, NOT PEOPLE — which is the whole reason this can be a plain trusted query while
 * `lib/editorGroups.ts` has to be a guarded privacy boundary. Nothing here identifies anyone: no
 * name, no address, no id. There is therefore no email carve-out to respect and no second projection
 * being introduced, and the caller (a Site-Admin-only panel) learns only a number it is about to
 * destroy. If this ever grows to return WHO holds a grant, it stops being this function and belongs
 * behind `editorGroups`' boundary instead.
 *
 * One grouped query rather than one per subject-grade, on the same reasoning and in the same shape as
 * `versionCountsByPlan`: the panel renders every subject-grade, so the per-row alternative is N
 * round-trips to render one bounded list.
 */
export async function assignmentCountsBySubjectGrade(
  payload: Payload,
): Promise<Map<number, AssignmentCounts>> {
  const adapter = payload.db as unknown as {
    drizzle: { execute: (query: unknown) => Promise<unknown> }
  }
  const result = await adapter.drizzle.execute(sql`
    SELECT
      "subject_grade_id" AS "subjectGradeId",
      COUNT(*) FILTER (WHERE "role" = 'editor')::integer       AS "editors",
      COUNT(*) FILTER (WHERE "role" = 'subjectAdmin')::integer AS "subjectAdmins"
    FROM "users_assignments"
    WHERE "subject_grade_id" IS NOT NULL
    GROUP BY "subject_grade_id"
  `)
  const counts = new Map<number, AssignmentCounts>()
  for (const row of rowsOf(result)) {
    const subjectGradeId = Number(row.subjectGradeId)
    const editors = Number(row.editors)
    const subjectAdmins = Number(row.subjectAdmins)
    // Skip a row rather than emit a NaN the confirmation would render as "NaN people lose editing
    // access" — an absent entry reads as zero through NO_ASSIGNMENTS, which is the safe direction
    // for a message, and the delete itself is guarded server-side regardless.
    if (
      Number.isSafeInteger(subjectGradeId) &&
      Number.isSafeInteger(editors) &&
      Number.isSafeInteger(subjectAdmins)
    ) {
      counts.set(subjectGradeId, { editors, subjectAdmins })
    }
  }
  return counts
}
