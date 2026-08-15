/**
 * Public slugs: the permanent, human-readable half of a shared lesson URL
 * (`docs/DESIGN-public-library.md`; SPEC §2 deployment modes).
 *
 * A slug is the thing a teacher forwards to another teacher on WhatsApp. That single fact settles
 * most of the design:
 *
 *   - it must be **stable** — the slug is frozen once the plan is first published, so a forwarded
 *     link cannot rot (enforced in `hooks/lessonPlan.ts`, not here);
 *   - it must be **typeable and quotable** — lowercase, hyphens, no punctuation to lose in a chat
 *     client or a printed footer;
 *   - it must never be **mistaken for an id**. A purely numeric slug would collide conceptually with
 *     the version/plan ids used everywhere else in this system, and a public URL that looks like an
 *     internal id invites people to guess neighbours. {@link isValidPublicSlug} rejects it.
 *
 * Pure and dependency-free so the rules are unit-testable without a database — the uniqueness probe
 * and the immutability rule, which both need one, live in the hook.
 */

/** Bounds. Short enough to survive a printed footer and a chat preview; long enough for real titles. */
export const MIN_PUBLIC_SLUG_LENGTH = 3
export const MAX_PUBLIC_SLUG_LENGTH = 80

/**
 * Fold arbitrary text into slug shape: lowercase, accents stripped, runs of anything else collapsed
 * to single hyphens, no leading/trailing hyphen, truncated to the maximum length.
 *
 * ⚑ The truncation happens BEFORE the trailing-hyphen trim, deliberately — cutting at the limit can
 * land mid-separator and leave `foo-`, which {@link isValidPublicSlug} would then reject. Trimming
 * after is what makes "derive, then validate" total rather than occasionally self-contradictory.
 *
 * NFD + combining-mark removal handles the accented characters that appear in curriculum titles
 * (and would otherwise vanish entirely into hyphens, turning "Café" into "caf").
 */
export function normalisePublicSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_PUBLIC_SLUG_LENGTH)
    .replace(/-+$/, '')
}

/**
 * Is this an acceptable stored slug?
 *
 * Stricter than "what `normalisePublicSlug` happens to emit", because a slug can also arrive typed by
 * a Site Admin. Rejecting the all-numeric case is the one rule that is about meaning rather than
 * form — see the module header.
 */
export function isValidPublicSlug(slug: string): boolean {
  if (slug.length < MIN_PUBLIC_SLUG_LENGTH || slug.length > MAX_PUBLIC_SLUG_LENGTH) return false
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false
  if (/^\d+$/.test(slug)) return false
  return true
}

/**
 * The candidate slug for a plan that is being published without one.
 *
 * Subject and grade lead the title so that sibling sub-strands of one subject sort and read together
 * in a shared link, and so two subjects may legitimately hold the same sub-strand name. Absent parts
 * are simply skipped rather than rendered as placeholders — a slug carrying the word "unknown" would
 * be permanent.
 *
 * Returns '' when nothing usable survives normalisation, which the caller must treat as "cannot
 * derive" rather than as a slug; publishing then fails loudly instead of minting a nameless URL.
 */
export function derivePublicSlug(parts: {
  subjectName?: string | null
  grade?: number | null
  title?: string | null
}): string {
  const { subjectName, grade, title } = parts
  const candidate = [
    subjectName?.trim() || '',
    grade == null ? '' : `grade-${grade}`,
    title?.trim() || '',
  ]
    .filter(Boolean)
    .join(' ')

  const slug = normalisePublicSlug(candidate)
  return isValidPublicSlug(slug) ? slug : ''
}

/**
 * The nth attempt at a slug, used to walk past a collision: `biology-grade-10-cells`,
 * `biology-grade-10-cells-2`, `biology-grade-10-cells-3`…
 *
 * ⚑ The suffix is applied to a base that has been shortened to fit it, so a maximum-length slug does
 * not silently produce a duplicate of itself when the suffix is truncated away — the failure that
 * would otherwise appear only for the longest titles, and only on the second one.
 */
export function suffixedPublicSlug(base: string, attempt: number): string {
  if (attempt <= 1) return base
  const suffix = `-${attempt}`
  const room = MAX_PUBLIC_SLUG_LENGTH - suffix.length
  return `${base.slice(0, room).replace(/-+$/, '')}${suffix}`
}
