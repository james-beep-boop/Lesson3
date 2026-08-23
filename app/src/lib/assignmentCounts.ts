import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * The stored assignment-role values, named so the SQL below and the collection cannot disagree.
 * `'editor'` is the CAPABILITY a Teacher holds, never a user type (SPEC §8, CLAUDE.md).
 */
const EDITOR_ROLE = 'editor'
const SUBJECT_ADMIN_ROLE = 'subjectAdmin'

import { poolDb, rowsOf } from './txDb'

// Re-exported from its own dependency-free module so existing importers here are unchanged. It
// lives in `lib/plural.ts` because this file imports the DB layer, and the newest caller
// (`lib/compareGroups.ts`) is covered by the DB-free `test:unit` suite.
export { plural } from './plural'

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
  // ⚑ THE ROLE VALUES ARE BOUND PARAMETERS, not literals in the SQL text — about failure mode, not
  // injection (they are constants). A table or column rename fails LOUDLY; a renamed assignment role
  // spelled inline would not: the query would still parse, still succeed, and simply return zero
  // editors for every subject-grade, so the cascade warning would stop appearing. Silently.
  const result = await poolDb(payload).execute(sql`
    SELECT
      "subject_grade_id" AS "subjectGradeId",
      COUNT(*) FILTER (WHERE "role" = ${EDITOR_ROLE})::integer        AS "editors",
      COUNT(*) FILTER (WHERE "role" = ${SUBJECT_ADMIN_ROLE})::integer AS "subjectAdmins"
    FROM "users_assignments"
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

/**
 * ⚑ THE SENTENCE THE SUBJECT-GRADES PANEL EXISTS TO SAY. `guardSubjectGradeDelete` refuses a delete
 * that would orphan lesson plans or versions, but role assignments do NOT block it — they are
 * CASCADED, stripped from every holder without a word. That is deliberate and predates the panel;
 * what the panel changes is reach, which is the situation the design doc's §2.8 names ("these gaps
 * matter more once a convenient delete button exists"). An administrator may still choose to delete
 * — that is their call — but revoking three teachers' editing access should not be something they
 * discover afterwards.
 *
 * ⚑ IT LIVES HERE, NOT IN THE PANEL, so it can be tested as what it is. Inside the component it was
 * reachable only through an import that drags `@payloadcms/ui` (and its CSS) into a DB-free unit
 * config, which pushed its coverage into the E2E — where the first attempt asserted "1 person loses
 * editing access" and was really counting how many accounts that spec happened to seed. Agreement
 * between a number and its verb is logic, and it belongs beside the counts it describes.
 *
 * ⚑ THE NUMBER IS A SNAPSHOT, and knowingly so. It is resolved in the same server render as the rows
 * and refreshed by `router.refresh()` after every write on this page — so a grant made in Manage →
 * Editing access IS reflected here. What it cannot see is a grant made by ANOTHER administrator in
 * another session between this page rendering and the delete being confirmed, which would leave the
 * sentence understating the loss by one.
 *
 * Left as a snapshot deliberately. Re-counting at confirm time needs an endpoint, and PR 3 adds none
 * — the panels drive existing REST routes precisely so there is no new gate to get wrong. The
 * trade is sound because this number is ADVISORY: the cascade itself runs server-side in
 * `guardSubjectGradeDelete`, against the rows as they are at delete time, and is unaffected by
 * anything stale on a client. A warning that is occasionally one short is worth far more than no
 * warning, which is what this replaced.
 */
export function deleteConsequences({
  displayName,
  assignments,
}: {
  displayName: string
  assignments: AssignmentCounts
}): string {
  const losses = [
    assignments.editors > 0 &&
      `${assignments.editors} ${assignments.editors === 1 ? 'person loses' : 'people lose'} editing access`,
    assignments.subjectAdmins > 0 &&
      `${assignments.subjectAdmins} Subject ${assignments.subjectAdmins === 1 ? 'Administrator is' : 'Administrators are'} demoted`,
  ].filter((line): line is string => line !== false)

  return losses.length === 0
    ? `Delete ${displayName}? This cannot be undone.`
    : `Delete ${displayName}? ${losses.join(' and ')}. This cannot be undone.`
}
