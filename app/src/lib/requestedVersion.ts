/**
 * Resolve a version id named in a URL (`?version=`, `?from=`, `?to=`) against a plan's readable
 * versions — and say so honestly when it does not resolve.
 *
 * ⚑ WHY THIS EXISTS (operator decision 2026-10-09, `docs/DESIGN-discussions-2026-10-09.md` §16.1).
 * The lesson page used to fall back to the Official version, and the compare page to its default
 * pair, whenever an explicit id did not resolve. A link to a deleted version — from a message, a
 * bookmark, or a discussion — then quietly showed a DIFFERENT revision under the reader's nose. A
 * missing version is now stated, never substituted: the pages render a notice and no content.
 *
 * Three answers, because "no id was asked for" and "the id asked for is gone" must not collapse into
 * one: only the first may take the page's default.
 *
 *   - `absent`      — no id in the URL (or an empty one): the page's default applies.
 *   - `found`       — the id is one of this plan's readable versions.
 *   - `unavailable` — an id was given and it is not one of them: deleted, unreadable, another plan's,
 *                     malformed, or repeated (`?version=1&version=2` names no single version).
 *
 * Pure, so the rule is unit-testable without a database. Callers pass the access-gated list from
 * `findReadableVersions`, which is what makes `found` a proof of READ.
 */
export type RequestedVersion<V> =
  | { kind: 'absent' }
  | { kind: 'found'; version: V }
  | { kind: 'unavailable' }

export function resolveRequestedVersion<V extends { id: number }>(
  raw: string | string[] | undefined,
  versions: readonly V[],
): RequestedVersion<V> {
  if (raw === undefined || raw === '') return { kind: 'absent' }
  // Digits only: `Number()` would accept ' 12 ', '1e1' and '0x0c' as ids that were never written.
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return { kind: 'unavailable' }
  const id = Number(raw)
  const version = versions.find((v) => v.id === id)
  return version ? { kind: 'found', version } : { kind: 'unavailable' }
}
