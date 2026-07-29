import type { Payload } from 'payload'
import type { User } from '@/payload-types'

import { adminScopeIds, editingAccessScopeIds, isSiteAdmin, userTypeLabel } from '../access'
import type { UserTypeLabel } from '../access'
import { subjectGradeLabel } from './substrand'

/**
 * Resolve a user's access-scope display lines (DESIGN-user-model-language, 2026-07-29).
 *
 * The session/JWT `user` carries each assignment's `subjectGrade` as an **id** (auth depth 0), not a
 * populated object, so the human labels ("Biology · Grade 10") have to be resolved at render. This is
 * the one real engineering wrinkle the design called out — kept in one place so every surface that
 * shows access (the user menu via `AppNav`, and the Manage page) resolves it identically instead of
 * each running its own query.
 *
 * Presentation only: the ids come from the unchanged authorization helpers (`adminScopeIds` /
 * `editingAccessScopeIds`). Disjointness is **enforced here**, not merely assumed: if a user holds
 * both a `subjectAdmin` and an `editor` row for the same subject-grade (reachable via the demote
 * path — `hooks/userRoles.ts`), that subject-grade lists only under "Administrator:" (the higher
 * grant), never under both. Order follows the assignment order the helpers preserve.
 */
export interface AccessScopes {
  /** Subject-grades administered (role `subjectAdmin`) — the "Administrator:" line. */
  adminScopes: string[]
  /** Subject-grades with an `editor` grant and NOT also administered — the "Editing access:" line. */
  editingScopes: string[]
}

export async function resolveAccessScopes(
  payload: Payload,
  user: User | null | undefined,
): Promise<AccessScopes> {
  const adminIds = adminScopeIds(user)
  const adminSet = new Set(adminIds)
  // A subject-grade you administer implies you may edit it — list it once, under Administrator.
  const editingIds = editingAccessScopeIds(user).filter((id) => !adminSet.has(id))
  const ids = [...new Set([...adminIds, ...editingIds])]
  if (ids.length === 0) return { adminScopes: [], editingScopes: [] }

  const labelById = await subjectGradeLabelMap(payload, ids)
  const toLabels = (scopeIds: number[]): string[] =>
    scopeIds.map((id) => labelById.get(id)).filter((v): v is string => v !== undefined)

  return { adminScopes: toLabels(adminIds), editingScopes: toLabels(editingIds) }
}

/**
 * The scope lines shown beneath a user's type — admin first — with the "Administrator:" /
 * "Editing access:" wording. Kept next to the resolver so the two surfaces can't drift on the
 * prefixes; resolving ids→labels alone wasn't enough, because the line wording was still being
 * rebuilt in each renderer.
 */
export const scopeLines = ({ adminScopes, editingScopes }: AccessScopes): string[] => [
  ...(adminScopes.length > 0 ? [`Administrator: ${adminScopes.join(', ')}`] : []),
  ...(editingScopes.length > 0 ? [`Editing access: ${editingScopes.join(', ')}`] : []),
]

/** The complete displayed access model for a user: the type, plus the scope lines beneath it. */
export interface AccessSummary {
  typeLabel: UserTypeLabel
  lines: string[]
}

/**
 * The ONE source of truth for how a user's access is displayed, shared by the user menu (`AppNav`)
 * and the Manage page — so the type, the scope wording, AND the site-admin treatment stay identical
 * across surfaces (previously the menu had no site-admin case and would show per-grant lines for a
 * site admin who also held assignment rows, diverging from Manage).
 *
 * A site admin has global access, so per-subject-grade grant lines would be noise (and they may still
 * hold assignment rows); they get one "full access" line and no scope query is issued.
 */
export async function resolveAccessSummary(
  payload: Payload,
  user: User | null | undefined,
): Promise<AccessSummary> {
  const typeLabel = userTypeLabel(user)
  if (isSiteAdmin(user)) return { typeLabel, lines: ['All subjects and grades'] }
  return { typeLabel, lines: scopeLines(await resolveAccessScopes(payload, user)) }
}

/**
 * Map subject-grade ids → "Subject · Grade N". A trusted server-side projection (`overrideAccess`):
 * the labels are the user's own grants, and the ids are already known to the caller — nothing foreign
 * leaks. Mirrors the format used on the lesson page and request-editing email so scope reads the same
 * everywhere.
 */
async function subjectGradeLabelMap(payload: Payload, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (ids.length === 0) return map
  const { docs } = await payload.find({
    collection: 'subject-grades',
    where: { id: { in: ids } },
    depth: 1,
    limit: ids.length,
    overrideAccess: true,
  })
  for (const sg of docs) {
    const subject = typeof sg.subject === 'object' ? sg.subject : null
    map.set(sg.id, subjectGradeLabel(subject?.name ?? 'Subject', sg.grade))
  }
  return map
}
