/**
 * Minimal semver bump (SPEC §6). Mirrors the helper inside `hooks/bundleIntegrity.ts`; lives here so
 * the version fork endpoint can reuse it without importing the bundle-integrity module.
 */
import type { Payload, PayloadRequest } from 'payload'

export const bumpSemver = (current: string | null | undefined, bump: 'major' | 'minor' | 'patch' = 'patch'): string => {
  const [major = 1, minor = 0, patch = 0] = (current ?? '1.0.0').split('.').map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

const parseSemver = (s: string | null | undefined): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = (s ?? '0.0.0').split('.').map((n) => Number(n) || 0)
  return [major, minor, patch]
}

/** Order two semvers: <0 if a<b, >0 if a>b, 0 if equal. Numeric per component (not lexical). */
export const compareSemver = (a: string, b: string): number => {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/**
 * True ONLY for the unique `(lessonPlan, semver)` index violation (`lessonPlan_semver_idx`) — the one
 * race the endpoint retries: two concurrent `save-as-new` calls on the same plan can both compute the
 * same next patch before either commits, and the loser hits this. Retrying recomputes the semver against
 * freshly-committed state instead of surfacing a 500. Deliberately NARROW: any OTHER uniqueness failure
 * (a real bug) must surface immediately, not be masked by retries. Postgres reports SQLSTATE `23505` and
 * names the constraint both on the error's `constraint` field and inside the message; drizzle wraps the
 * pg error, so we check the error and its `cause`, and match the index name (not a bare `23505`).
 */
export function isSemverConflict(e: unknown): boolean {
  const err = e as {
    constraint?: string
    message?: string
    cause?: { constraint?: string; message?: string }
  }
  if ((err?.constraint ?? err?.cause?.constraint) === 'lessonPlan_semver_idx') return true
  const msg = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`
  return /lessonPlan_semver_idx/i.test(msg)
}

/**
 * Next free PATCH for a plan: (max existing semver across the plan's versions) + 1 patch. So two forks
 * of `1.0.0` yield `1.0.1` then `1.0.2` — never a duplicate (the old code blindly patch-bumped the
 * SOURCE, so both forks of 1.0.0 produced 1.0.1). The unique `(lessonPlan, semver)` index is the
 * concurrency backstop for two forks that race before either is persisted.
 */
export async function nextSemverForPlan(
  payload: Payload,
  planId: number | string,
  req?: PayloadRequest,
): Promise<string> {
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: planId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const max = docs
    .map((d) => (d as { semver?: string | null }).semver ?? '0.0.0')
    .reduce((acc, s) => (compareSemver(s, acc) > 0 ? s : acc), '0.0.0')
  return bumpSemver(max, 'patch')
}
