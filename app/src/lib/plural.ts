/**
 * "1 version" / "3 versions". Regular plurals only — a caller conjugating a VERB wants
 * `deleteConsequences` in `assignmentCounts.ts`.
 *
 * ⚑ Moved out of `UsersPanel.tsx` (so the third caller in `components/Manage/` could reach it
 * instead of inlining the ternary again), then out of `assignmentCounts.ts` into this module of its
 * own — because that file imports `@payloadcms/db-postgres` and `txDb`, and the fourth caller is
 * `lib/compareGroups.ts`, whose spec runs in the DB-free `test:unit` suite. `assignmentCounts.ts`
 * re-exports it, so its existing importers are unaffected.
 */
export const plural = (count: number, one: string): string =>
  `${count} ${count === 1 ? one : `${one}s`}`
