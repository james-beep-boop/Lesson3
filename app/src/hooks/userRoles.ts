import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import { isSiteAdmin, isSubjectAdminFor, toId } from '../access'

type Assignment = NonNullable<User['assignments']>[number]

const rowSignature = (a: Assignment): string => `${toId(a.subjectGrade)}:${a.role}`

/**
 * Scope assignment edits for non-site-admin actors (SPEC §8).
 *
 * A Subject Admin may manage roles only within the subject-grades they administer.
 * Field access already gates *whether* assignments may be touched; this hook gates
 * *which* rows. We diff incoming vs existing assignments and require the actor to be
 * Subject Admin for every subject-grade whose row was added, removed, or changed.
 * Site Admins are unrestricted.
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
