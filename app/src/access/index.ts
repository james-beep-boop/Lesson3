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
 * Who may use the Payload admin panel (SPEC §5): Site Admins + anyone holding a subject-grade
 * assignment (Editor / Subject Admin). Plain Teachers (authenticated, no grant) are excluded.
 * Exposed as a plain `User` predicate so "The App" nav can reuse the *same* rule — keeping the
 * Admin link's visibility tracking panel access exactly (no forbidden controls, §13).
 */
export const canUseAdminPanel = (user: User | null | undefined): boolean =>
  isSiteAdmin(user) || Boolean(user?.assignments?.length)

/**
 * Human-readable role label for the user menu (highest grant wins). Site Administrator > Subject
 * Administrator > Editor > Teacher. A plain authenticated user with no grant is a Teacher.
 */
export const userTypeLabel = (user: User | null | undefined): string => {
  if (isSiteAdmin(user)) return 'Site Administrator'
  if (user?.assignments?.some((a) => a.role === 'subjectAdmin')) return 'Subject Administrator'
  if (user?.assignments?.some((a) => a.role === 'editor')) return 'Editor'
  return 'Teacher'
}

export const canManageUsers = (user: User | null | undefined): boolean =>
  isSiteAdmin(user) || isSubjectAdminForAny(user)

export const canManageCurriculum = (user: User | null | undefined): boolean => isSiteAdmin(user)

// `access.admin` must return a plain boolean (not a Where query), so it has a narrower
// signature than collection `Access`.
export const adminPanelAccess = ({ req: { user } }: { req: PayloadRequest }): boolean =>
  canUseAdminPanel(asUser(user))

// ---------------------------------------------------------------------------
// Users collection access
// ---------------------------------------------------------------------------

/** Directory read = names-only roster for ALL authenticated users (SPEC §8 as amended 2026-07-02):
 *  messaging's user picker needs "any user may message any user" (§10). This is the DELIBERATE
 *  relaxation the 2026-07-01 tightening anticipated — collection-level only. What keeps it
 *  names-only is field access: `email` (emailReadAccess), `roles` (siteAdminField) and
 *  `assignments` (assignmentsReadField) are stripped for non-admins. Server-side decisions on
 *  admin-only fields must keep using trusted projections (DECISIONS 2026-07-02 round 3). */
/**
 * Users create = OPEN self-registration (user decision 2026-07-09, SPEC §8) or Site-Admin people
 * management. Anonymous visitors may create an account (rate-capped in hooks/authRateLimit;
 * `roles`/`assignments` are create-gated at field level, so a hostile signup body strips to a
 * plain Teacher). An AUTHENTICATED non-admin has no business creating users.
 */
export const usersCollectionCreate: Access = ({ req: { user } }) =>
  !user || isSiteAdmin(asUser(user))

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

/** Self or site admin may change a personal field (name — email became Site-Admin-only with
 *  verification, 2026-07-10: a self-service change would bypass address ownership). */
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

/** Assignments are readable by role managers (Site/Subject Admins) and the user themselves. Before
 *  the 2026-07-02 roster relaxation the collection read gate made this implicit; now that any
 *  authenticated user can read user docs, the field guard is what keeps grants non-public
 *  (SPEC §8: the public roster is display names only). */
export const assignmentsReadField: FieldAccess = ({ req: { user }, id }) => {
  const u = asUser(user)
  if (!u) return false
  return isSiteAdmin(u) || isSubjectAdminForAny(u) || u.id === id
}
