import type { Access, FieldAccess, PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

/**
 * Authorization helpers and access functions (SPEC §8, §5).
 *
 * Roles:
 *  - Site Administrator  — global; `roles` includes 'siteAdmin'. Can do everything.
 *  - Subject Administrator — per subject-grade; an `assignments[]` row with role
 *    'subjectAdmin'. Structural + admin-only fields, mark official, scoped role mgmt.
 *  - Editor — per subject-grade; an `assignments[]` row with role 'editor'. Prose values.
 *  - Teacher — any authenticated user with no grant. View/export only (implicit default).
 *
 * `req.user` is the full user document (the JWT strategy re-fetches it via findByID),
 * so `roles` and `assignments` are always present here. Relationships inside
 * `assignments` are populated to the auth depth (default 0 → raw IDs); `toId`
 * normalizes ID-or-object so callers don't care which.
 */

export type Assignment = NonNullable<User['assignments']>[number]
type SubjectGradeRef = Assignment['subjectGrade']

export const toId = (ref: SubjectGradeRef | null | undefined): number | undefined => {
  if (ref == null) return undefined
  return typeof ref === 'object' ? ref.id : ref
}

const asUser = (user: unknown): User | null => (user as User) ?? null

export const isSiteAdmin = (user: User | null | undefined): boolean =>
  Boolean(user?.roles?.includes('siteAdmin'))

const assignmentsForSubjectGrade = (
  user: User | null | undefined,
  subjectGradeId: number | undefined,
): Assignment[] => {
  if (!user?.assignments || subjectGradeId == null) return []
  return user.assignments.filter((a) => toId(a.subjectGrade) === subjectGradeId)
}

/** Site admin, or holds a Subject Admin grant for this subject-grade. */
export const isSubjectAdminFor = (
  user: User | null | undefined,
  subjectGradeId: number | undefined,
): boolean =>
  isSiteAdmin(user) ||
  assignmentsForSubjectGrade(user, subjectGradeId).some((a) => a.role === 'subjectAdmin')

/** Site admin, Subject Admin, or Editor for this subject-grade (anyone who may edit prose). */
export const isEditorFor = (
  user: User | null | undefined,
  subjectGradeId: number | undefined,
): boolean =>
  isSiteAdmin(user) ||
  assignmentsForSubjectGrade(user, subjectGradeId).some(
    (a) => a.role === 'subjectAdmin' || a.role === 'editor',
  )

/** Holds a Subject Admin grant for at least one subject-grade. */
export const isSubjectAdminForAny = (user: User | null | undefined): boolean =>
  Boolean(user?.assignments?.some((a) => a.role === 'subjectAdmin'))

/** Distinct subject-grade ids where the user holds any of the given roles. */
export const subjectGradeIdsByRole = (
  user: User | null | undefined,
  roles: Assignment['role'][],
): number[] => {
  if (!user?.assignments) return []
  const ids = user.assignments
    .filter((a) => roles.includes(a.role))
    .map((a) => toId(a.subjectGrade))
    .filter((id): id is number => id != null)
  return [...new Set(ids)]
}

// ---------------------------------------------------------------------------
// Collection-level access
// ---------------------------------------------------------------------------

export const authenticated: Access = ({ req: { user } }) => Boolean(user)

export const siteAdminOnly: Access = ({ req: { user } }) => isSiteAdmin(asUser(user))

/**
 * Admin-panel access. SPEC §5: Phase-1 editing happens in the Payload admin edit
 * screen, so Editors and Subject Admins must be allowed in — only plain Teachers
 * (authenticated, no grant) are excluded. (Resolves the NEXT-SESSION note that
 * said "Site Admins only"; SPEC §5 is canonical — see docs/DECISIONS.md.)
 */
// `access.admin` must return a plain boolean (not a Where query), so it has a
// narrower signature than collection `Access`.
export const adminPanelAccess = ({ req: { user } }: { req: PayloadRequest }): boolean => {
  const u = asUser(user)
  if (!u) return false
  if (isSiteAdmin(u)) return true
  return Boolean(u.assignments?.length)
}

// ---------------------------------------------------------------------------
// Users collection access
// ---------------------------------------------------------------------------

/** Any signed-in user may read user docs (for attribution); the `email` field is
 *  separately hidden from non-site-admins via `emailReadAccess`. */
export const usersCollectionRead: Access = ({ req: { user } }) => Boolean(user)

/** Update self, or any user if site admin / a subject admin (field access + the
 *  beforeChange scoping hook then constrain *what* a subject admin may change). */
export const usersCollectionUpdate: Access = ({ req: { user }, id }) => {
  const u = asUser(user)
  if (!u) return false
  if (isSiteAdmin(u)) return true
  if (isSubjectAdminForAny(u)) return true
  return u.id === id
}

// ---------------------------------------------------------------------------
// Field-level access (boolean only)
// ---------------------------------------------------------------------------

/** Email is visible only to the owner and site admins (SPEC §8 email privacy). */
export const emailReadAccess: FieldAccess = ({ req: { user }, id }) => {
  const u = asUser(user)
  if (!u) return false
  return isSiteAdmin(u) || u.id === id
}

/** Self or site admin may change a personal field (name, email). */
export const selfOrSiteAdminField: FieldAccess = ({ req: { user }, id }) => {
  const u = asUser(user)
  if (!u) return false
  return isSiteAdmin(u) || u.id === id
}

export const siteAdminField: FieldAccess = ({ req: { user } }) => isSiteAdmin(asUser(user))

/** Entry gate for editing assignments; the beforeChange hook scopes a subject
 *  admin to only the subject-grades they administer. */
export const assignmentsUpdateField: FieldAccess = ({ req: { user } }) => {
  const u = asUser(user)
  return isSiteAdmin(u) || isSubjectAdminForAny(u)
}
