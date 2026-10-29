/**
 * Missing-taxonomy classification for the web upload (SPEC §7, amended 2026-10-21).
 *
 * When uploaded files name a Subject or SubjectGrade that does not exist, the upload offers to create
 * it. Pure logic only — the database reads and writes live in `ingest/index.ts`. Three outcomes per
 * missing `(subject, grade)`:
 *
 *  - **blocked** — never offered: the grade is outside Grades 1–12, or the subject name differs from an
 *    existing subject (or from another new name in the same upload) only by letter case or whitespace.
 *    Two such subjects must never coexist; the fix belongs in the file.
 *  - **offered, similar** — the name resembles an existing or other new subject (`Maths` /
 *    `Mathematics`). Offered, but the UI asks "new subject or misspelling?" before it may be created.
 *  - **offered** — plainly new.
 *
 * ⚑ A near miss is never mapped onto the existing subject: `META.subject` prints on the document.
 */
import { MAX_GRADE, MIN_GRADE, isGradeLevel } from '../lib/gradeLevels'

export type TaxonomyKey = { subject: string; grade: number }

/** The longest Subject name an upload may create — shared by pre-flight (which must never offer a
 *  name) and the approval parser (which would then refuse it), audit F-C40-002. */
export const MAX_SUBJECT_NAME_LENGTH = 200

/** One offered item: a `(subject, grade)` the upload needs and the Site Administrator may create. */
export type MissingTaxonomy = TaxonomyKey & {
  /** True when the Subject itself is new (not only this grade of an existing subject). */
  newSubject: boolean
  /** Existing or other new subject names this one resembles; non-empty → ask before creating. */
  similarTo: string[]
  /** The files that need this item. */
  files: string[]
}

/** One file whose taxonomy is missing, as pre-flight found it. */
export type PendingTaxonomy = TaxonomyKey & { file: string; subjectExists: boolean }

export const taxonomyKey = ({ subject, grade }: TaxonomyKey): string => `${subject}::${grade}`

/**
 * The form two names must not share: case and ALL whitespace removed, so `"Life  skills"`,
 * `"LifeSkills"` and `"Life Skills"` are one name. Word boundaries are deliberately not preserved —
 * `ComputerScience` beside `Computer Science` is the stray near-duplicate this rule exists to stop.
 */
export const normalizeSubjectName = (name: string): string => name.replace(/\s+/g, '').toLowerCase()

/** Plain Levenshtein distance (subject names are short; O(n·m) is fine). */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]!
}

/**
 * Do two DIFFERENT normalized names look like the same subject? A shared prefix of 4+ letters
 * (`maths` / `mathematics`, `bio` is too short to count), or a small edit distance — up to 2 when both
 * are 5+ letters (`chemestry`), 1 otherwise (`art` / `arts`, but not `art` / `ict`). Deliberately
 * generous: a false positive costs one question, a false negative a stray subject.
 */
export function namesAreSimilar(a: string, b: string): boolean {
  const x = normalizeSubjectName(a)
  const y = normalizeSubjectName(b)
  if (x === y) return false
  let prefix = 0
  while (prefix < x.length && prefix < y.length && x[prefix] === y[prefix]) prefix++
  if (prefix >= 4) return true
  const limit = Math.min(x.length, y.length) >= 5 ? 2 : 1
  return editDistance(x, y) <= limit
}

/**
 * Sort the upload's missing taxonomy into offered items and per-file rejections.
 * `existingSubjects` is every Subject name in the database.
 */
export function classifyMissingTaxonomy(
  pending: PendingTaxonomy[],
  existingSubjects: string[],
): { offered: MissingTaxonomy[]; blocked: { file: string; error: string }[] } {
  const existingByNorm = new Map(existingSubjects.map((n) => [normalizeSubjectName(n), n]))
  // An exact existing name is never "new", even if the file was resolved before it was created.
  const existingNames = new Set(existingSubjects)
  const subjectExists = (p: PendingTaxonomy) => p.subjectExists || existingNames.has(p.subject)
  // Every distinct spelling of each new subject in this upload, by normalized name.
  const newSpellings = new Map<string, Set<string>>()
  for (const p of pending) {
    if (subjectExists(p)) continue
    const norm = normalizeSubjectName(p.subject)
    newSpellings.set(norm, (newSpellings.get(norm) ?? new Set()).add(p.subject))
  }

  const blockReason = (p: PendingTaxonomy): string | null => {
    if (!isGradeLevel(p.grade)) {
      return `Grade ${p.grade} is outside Grades ${MIN_GRADE}–${MAX_GRADE}, so it cannot be created. Correct META.grade in the file.`
    }
    if (subjectExists(p)) return null
    const norm = normalizeSubjectName(p.subject)
    const existing = existingByNorm.get(norm)
    if (existing) {
      return `Subject "${p.subject}" differs from the existing subject "${existing}" only in capitals or spacing, so it cannot be created. Correct META.subject in the file to "${existing}".`
    }
    const others = [...newSpellings.get(norm)!].filter((s) => s !== p.subject)
    if (others.length > 0) {
      return `Subject "${p.subject}" differs from "${others.join('", "')}" in this upload only in capitals or spacing, so neither can be created. Correct META.subject so the files match.`
    }
    return null
  }

  const offeredByKey = new Map<string, MissingTaxonomy>()
  const blocked: { file: string; error: string }[] = []
  for (const p of pending) {
    const reason = blockReason(p)
    if (reason) {
      blocked.push({ file: p.file, error: reason })
      continue
    }
    const key = taxonomyKey(p)
    const item = offeredByKey.get(key)
    if (item) item.files.push(p.file)
    else
      offeredByKey.set(key, {
        subject: p.subject,
        grade: p.grade,
        newSubject: !subjectExists(p),
        similarTo: [],
        files: [p.file],
      })
  }

  const offered = [...offeredByKey.values()]
  const newNames = [...new Set(offered.filter((o) => o.newSubject).map((o) => o.subject))]
  for (const item of offered) {
    if (!item.newSubject) continue
    item.similarTo = [...existingSubjects, ...newNames]
      .filter((n) => n !== item.subject && namesAreSimilar(n, item.subject))
      .sort((a, b) => a.localeCompare(b))
  }
  return { offered, blocked }
}
