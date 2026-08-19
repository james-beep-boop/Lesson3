/**
 * The Users-panel wire contract: the shapes the search endpoint produces, the closed type vocabulary
 * both ends filter by, and the labels that name a grant.
 *
 * ⚑ DECLARED IN `lib/`, NOT IN `endpoints/userSearch.ts`. The panel is a CLIENT component, and it
 * needs part of this contract as a VALUE — `USER_SEARCH_TYPES` and its labels drive the filter's
 * options, `grantRoleLabel` names a grant row. Type-only imports erase, so the panel could reach into
 * the endpoint module for the interfaces; a value import would drag the endpoint's server world
 * (`sql`, `txDb`, the access helpers) onto a client import path. `lib/` is the leaf both sides may
 * depend on, so the contract lives here and the endpoint imports it like anyone else.
 */
import type { UserTypeLabel } from '../access'

export const USER_SEARCH_TYPES = ['siteAdmin', 'subjectAdmin', 'teacher'] as const
export type UserSearchType = (typeof USER_SEARCH_TYPES)[number]

/**
 * What the filter calls each type — and deliberately `UserTypeLabel`, the same union
 * `access/index.ts` returns for the type shown on the row itself. Filtering by "Teacher" and then
 * reading "Teacher" on every result is the contract; two independently spelled vocabularies on one
 * screen is how that quietly stops being true.
 */
export const USER_SEARCH_TYPE_LABELS: Record<UserSearchType, UserTypeLabel> = {
  siteAdmin: 'Site administrator',
  subjectAdmin: 'Subject-grade administrator',
  teacher: 'Teacher',
}

/**
 * What one grant row is called.
 *
 * ⚑ `'editor'` is the STORED value for a capability, not a user type (SPEC §8, CLAUDE.md). The
 * displayed wording therefore has to say "Editing access", and it is decided here rather than inline
 * because `lib/accessScopes.ts` already spells the same two words for the user menu's scope lines —
 * a third hand-written copy on a third surface is exactly what the 2026-08-17 vocabulary sweep was
 * cleaning up.
 */
export const grantRoleLabel = (role: UserSearchGrant['role']): string =>
  role === 'subjectAdmin' ? 'Subject Administrator' : 'Editing access'

export interface UserSearchGrant {
  role: 'editor' | 'subjectAdmin'
  subjectGradeId: number
  subjectGradeLabel: string
}

export interface UserSearchDocument {
  authoredVersions: number
  id: number
  name: string
  email: string
  officialVersions: number
  type: UserTypeLabel
  verified: boolean
  signInDisabled: boolean
  siteAdmin: boolean
  grants: UserSearchGrant[]
  updatedAt: string
}

export interface UserSearchResponse {
  docs: UserSearchDocument[]
  hasNextPage: boolean
  hasPrevPage: boolean
  limit: number
  page: number
  totalDocs: number
  totalPages: number
}
