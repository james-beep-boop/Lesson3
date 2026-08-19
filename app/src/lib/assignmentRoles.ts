/**
 * The assignment-role vocabulary: the two stored values, and the routes that grant and revoke them.
 *
 * ⚑ ONE SPELLING, SHARED BY BOTH ENDS. The endpoint factory builds `/:id/assign-subject-admin` from
 * a table and the panel used to re-spell all four slugs as a hand-written union it interpolated into
 * a `fetch`. Renaming a route then compiled clean and 404'd at runtime, surfacing as a generic
 * "Update failed" — silent at build, uninformative in production. This is the lesson
 * `EditRecovery/protocol.ts` records ("two declarations that agree today are two declarations to keep
 * in step"), and it applies to strings as much as to types.
 *
 * ⚑ IN `lib/`, so a CLIENT component can import the slugs as VALUES without dragging the endpoint's
 * server world (`payload`, transactions, the access helpers) onto a client import path — the same
 * reason `lib/userSearchContract.ts` exists.
 *
 * ⚑ `'editor'` IS A CAPABILITY, NOT A USER TYPE (SPEC §8, CLAUDE.md). The stored value stays
 * `'editor'`; what must never appear is an "Editor" account type.
 */
export const ASSIGNMENT_ROLES = ['editor', 'subjectAdmin'] as const
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number]

/** Route slug per role — the URL half of the vocabulary. */
const ROLE_SLUG: Record<AssignmentRole, string> = {
  editor: 'editor',
  subjectAdmin: 'subject-admin',
}

/**
 * The path segment for one grant/revoke route, e.g. `assign-subject-admin`.
 *
 * Callers append it to `/users/:id/`; the endpoint factory uses the same function to declare the
 * route, so the two cannot drift.
 */
export const assignmentAction = (mode: 'assign' | 'unassign', role: AssignmentRole): string =>
  `${mode}-${ROLE_SLUG[role]}`
