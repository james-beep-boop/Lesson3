import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import type { Assignment } from '../access'
import { isSiteAdmin, isSubjectAdminFor, toId } from '../access'

const rowSignature = (a: Assignment): string => `${toId(a.subjectGrade)}:${a.role}`

/**
 * Bootstrap: make the very first user a Site Administrator (SPEC §8).
 *
 * `access.admin` (adminPanelAccess) admits only site admins / assigned users, and
 * `roles` defaults to []. Without this, the first user created on a fresh deployment
 * would be locked out of the admin panel — a bootstrap deadlock. On the first create
 * (no users yet) we force `roles` to include 'siteAdmin'.
 */
export const grantSiteAdminToFirstUser: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data) return data
  const { totalDocs } = await req.payload.count({ collection: 'users', req })
  if (totalDocs === 0) {
    data.roles = [...new Set([...(data.roles ?? []), 'siteAdmin' as const])]
  }
  return data
}

/**
 * Guard password changes (SPEC §8 / least privilege).
 *
 * Subject Admins hold collection-level update on every user (so `enforceAssignmentScope`
 * can validate assignment edits). But Payload's update pipeline saves `data.password`
 * outside normal field access (verified in installed source: `collections/operations/
 * utilities/update.js` saves it with no password-specific check), so without this guard a
 * Subject Admin could reset *any* user's password → account takeover. Only the user
 * themselves or a Site Admin may change a password here.
 *
 * Safe against the legitimate flows: the token reset (`auth/operations/resetPassword.js`)
 * writes hash/salt directly via `payload.db.updateOne` and never puts `password` in hook
 * data; trusted system calls run with `overrideAccess` and no `req.user` (and an
 * unauthenticated REST update is already denied at collection access, so it never reaches
 * here) — hence `!actor` is treated as a trusted system operation.
 */
export const guardPasswordChange: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || !data?.password) return data
  const actor = (req.user as User) ?? null
  if (!actor || isSiteAdmin(actor) || actor.id === originalDoc?.id) return data
  throw new Forbidden(req.t)
}

/**
 * Scope assignment edits for non-site-admin actors (SPEC §8).
 *
 * A Subject Admin may manage roles only within the subject-grades they administer.
 * Field access already gates *whether* assignments may be touched; this hook gates
 * *which* rows. We diff incoming vs existing assignments and require the actor to be
 * Subject Admin for every subject-grade whose row was added, removed, or changed.
 * Site Admins are unrestricted.
 *
 * Additionally (Codex round-3 #2): a SITE ADMIN's assignment rows may be changed only by Site
 * Admins. `roles` is field-HIDDEN from Subject Admins, so a client cannot even reliably know the
 * target is one — the server owns this rule for every write path (assignment endpoints, generic
 * PATCH, the native admin form). Applied only when rows actually change, so an incidental
 * unchanged-array resubmit stays a no-op.
 */
export const enforceAssignmentScope: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const actor = (req.user as User) ?? null
  if (!actor || isSiteAdmin(actor)) return data
  if (!data || !('assignments' in data)) return data

  const before: Assignment[] = originalDoc?.assignments ?? []
  const after: Assignment[] = data.assignments ?? []
  const beforeSigs = new Set(before.map(rowSignature))
  const afterSigs = new Set(after.map(rowSignature))

  const touchedSubjectGradeIds = new Set<number | undefined>()
  for (const a of after) if (!beforeSigs.has(rowSignature(a))) touchedSubjectGradeIds.add(toId(a.subjectGrade))
  for (const b of before) if (!afterSigs.has(rowSignature(b))) touchedSubjectGradeIds.add(toId(b.subjectGrade))

  if (touchedSubjectGradeIds.size > 0 && (originalDoc as User | undefined)?.roles?.includes('siteAdmin')) {
    throw new Forbidden(req.t)
  }

  for (const sgId of touchedSubjectGradeIds) {
    if (!isSubjectAdminFor(actor, sgId)) {
      throw new Forbidden(req.t)
    }
  }
  return data
}

/**
 * Enforce "≤1 Subject Admin per subject-grade" (SPEC §8): when a user is granted
 * Subject Admin for a subject-grade, demote any *other* holder of that grant to
 * Editor — in the same transaction (`req` threaded) and guarded by a context flag
 * so the cascading update doesn't re-trigger this hook.
 */
export const autoDemotePriorSubjectAdmins: CollectionAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  if (context?.skipAutoDemote) return doc

  const grantedSubjectGradeIds = (doc.assignments ?? [])
    .filter((a: Assignment) => a.role === 'subjectAdmin')
    .map((a: Assignment) => toId(a.subjectGrade))
    .filter((id: number | undefined): id is number => id != null)

  for (const sgId of grantedSubjectGradeIds) {
    // depth: 0 → assignment.subjectGrade comes back as raw IDs (no normalization needed).
    const others = await req.payload.find({
      collection: 'users',
      depth: 0,
      limit: 1000,
      where: {
        and: [{ id: { not_equals: doc.id } }, { 'assignments.subjectGrade': { equals: sgId } }],
      },
      req,
    })

    for (const other of others.docs) {
      let changed = false
      const assignments = (other.assignments ?? []).map((a) => {
        if (toId(a.subjectGrade) === sgId && a.role === 'subjectAdmin') {
          changed = true
          return { ...a, role: 'editor' as const }
        }
        return a
      })
      if (changed) {
        await req.payload.update({
          collection: 'users',
          id: other.id,
          data: { assignments },
          req,
          overrideAccess: true, // system invariant; the triggering change was already authorized
          context: { skipAutoDemote: true },
        })
      }
    }
  }
  return doc
}
