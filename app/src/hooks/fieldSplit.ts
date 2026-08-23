/**
 * editing-access field-split (SPEC §5) — the WHITELIST that constrains a non-admin writes made under editing access to prose
 * values, preserving all structure / admin / system fields from the original. Enforces the teacher with editing access/
 * Admin boundary for the `lesson-bundle-versions` working copies (via `enforceVersionFieldSplit`).
 *
 * Site Admins (and trusted system / overrideAccess calls with no `req.user`) are unrestricted.
 * Subject Admins are unrestricted EXCEPT the META identity fields (subject / grade / substrand_id),
 * which are Site-Admin-only repair data and preserved from the original. For a teacher with editing access this:
 *   1. Rejects any change to array cardinality or order (teachers with editing access edit values, not structure).
 *   2. Writes = the original with ONLY the editing-access-editable *prose* fields overlaid from the
 *      submission. Everything not on the prose whitelist (META, phase, durations, answer keys,
 *      structure, system fields, identity/version metadata…) is preserved from the original.
 *
 * Why a whitelist (not field-level access): Payload field access NULLS optional admin-only subfields
 * inside open arrays when a non-admin submits the array, so those subfields carry no field-level
 * `access` and protection lives here. A whitelist is also secure by default: a NEW admin/system field
 * is preserved automatically — forgetting to list a field can only make it non-editable by a teacher with editing access
 * (a visible annoyance), never silently writable under editing access (a security hole).
 *
 * The set of TOP-LEVEL keys a teacher with editing access may influence is passed in (`editorTopLevelKeys`), so the
 * whitelist stays decoupled from any one collection's identity/version metadata.
 */
import type { CollectionBeforeChangeHook } from 'payload'
import { Forbidden } from 'payload'

import type { User } from '@/payload-types'
import { isSiteAdmin, isSubjectAdminFor, toId } from '../access'
import { isObject } from '../ingest/resourceLinks'
import { canonicalJson } from '../lib/canonicalJson'
import { stripIds } from '../lib/stripIds'

type Doc = Record<string, unknown> & { id?: string | number }
type Row = { id?: string | number }
type Req = Parameters<CollectionBeforeChangeHook>[0]['req']

/** Ids in order — the structural fingerprint the teacher with editing access guard compares. */
const idsOf = (rows: Row[]): Array<string | number | undefined> => rows.map((r) => r.id)

/** Rows from a STORED field. The DB always yields an array (or nothing) for an array field. */
const storedRows = (value: unknown): Row[] => (Array.isArray(value) ? value : [])

/**
 * Rows from a SUBMITTED array field, or reject.
 *
 * ⚑ A submitted array field can legitimately arrive as the NUMBER `0`. Payload's
 * `reduceFieldsToValues` — what the editor's Save posts (`currentContent()` in
 * components/LessonControls) — reduces an array field's container to its ROW COUNT, and sets
 * `disableFormData` (which is what makes the container drop out in favour of the unflattened rows)
 * ONLY when the array is non-empty:
 *
 *     // @payloadcms/ui/dist/forms/fieldSchemasToFormState/addFieldStatePromise.js
 *     fieldState.value = forceFullValue ? arrayValue : arrayValue.length
 *     if (arrayValue.length > 0) fieldState.disableFormData = true
 *
 * So an EMPTY array field posts as `0` — and ONLY ever `0`, since every non-empty count takes the
 * `disableFormData` branch. Calling `.map` on it threw a TypeError that surfaced as a bare 500: no
 * a teacher with editing access could save a bundle with an empty `finalExplanation.sections`, `finalExplanation.rubric` or
 * `summaryTable.lessons` (fixed 2026-07-31).
 *
 * `0` is therefore the ONLY non-array this accepts, and the allowance is exactly as wide as the
 * serializer that produces it. Anything else — `2`, `'bad'`, `{}` — is malformed and REJECTED rather
 * than read as "no rows": this feeds a SECURITY control (teachers with editing access may not change structure), so a
 * blanket coercion would silently pass junk whenever the stored field happened to be empty, and would
 * hide a future client-side serialization change instead of failing loudly. Rejecting is also the
 * safe direction — the guard's job is to refuse what it cannot verify, and it has no way to tell a
 * malformed client from a hostile one.
 *
 * Nullish is the one carve-out: `?? []` was the pre-existing contract here, so `null`/`undefined`
 * still read as no rows. Narrowing THAT is a separate behavioural change, not part of this fix.
 */
const submittedRows = (value: unknown, reject: () => never): Row[] => {
  if (Array.isArray(value)) return value
  if (value === 0 || value == null) return []
  return reject()
}

/** The submitted group when it is one, else undefined — for the overlay, which tolerates absence. */
const asSubmittedGroup = (value: unknown): Doc | undefined => (isObject(value) ? value : undefined)

/**
 * A SUBMITTED group container (`finalExplanation`, `summaryTable`), or reject.
 *
 * The group counterpart to {@link submittedRows}, and it exists for the same reason: this feeds a
 * SECURITY control, so a shape the guard cannot verify is refused rather than read as "nothing to
 * check". `null` is rejected rather than treated as absence — Payload's form state posts a group as
 * an object, so a null container is not a shape any real client produces, and silently accepting it
 * is precisely how the whole group used to reach the write unguarded.
 *
 * Derived from `asSubmittedGroup` rather than repeating the predicate: a group is never nullish when
 * it matches, so `?? reject()` fires on exactly the values the long form rejected. Two hand-written
 * copies of one security predicate is the drift hazard this whole fix was about.
 */
const submittedGroup = (value: unknown, reject: () => never): Doc =>
  asSubmittedGroup(value) ?? reject()

const sameSequence = (
  a: Array<string | number | undefined>,
  b: Array<string | number | undefined>,
): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// editing-access-editable prose fields, by container. Anything NOT listed is admin/system and is preserved
// from the original. Must stay in sync with the `prose()` fields in fields/lessonContent.ts —
// exported so tests/unit/proseWhitelistDrift.spec.ts can enforce that sync mechanically (a field is
// "intended editing-access prose" exactly when its factory attached `canEditProse`).
// META identity — Site-Admin-only corruption-repair fields (decided 2026-07-05): subject/grade only
// label the printed document (the plan's subjectGrade relationship is the categorization truth) and
// substrand_id is the re-ingest matching key. SINGLE SOURCE for the rule's key list: the carve-out
// below loops it, the three `siteAdminField` markers in fields/lessonContent.ts mirror it, and
// tests/unit/metaIdentitySplit.spec.ts asserts the two layers agree (a field marked identity in the
// schema but missing here would LEAK write access — the hook is the write-time authority).
export const META_IDENTITY_KEYS = ['subject', 'grade', 'substrand_id'] as const

export const LESSON_PROSE = ['title', 'overview', 'teacherReflection']
export const SLO_PROSE = [
  'purpose',
  'knowledge',
  'skills',
  'attitudes',
  'keyInquiry',
  'purposeInStoryline',
  'safetyNotes',
]
export const FRAMEWORK_PROSE = [
  'learnerExperience',
  'teacherMoves',
  'sensemakingStrategy',
  'formativeAssessment',
]
export const SUMMARY_PROMPT_PROSE = ['observed', 'learned', 'explained']
export const FINAL_EXPLANATION_PROSE = ['instructions']
export const SECTION_PROSE = ['prompt']
// ⚑ NO `title` — SPEC §205 grants a teacher with editing access `SUMMARY_TABLE.lessons[].{observed,
// learned, explained}` and nothing else. It was listed here (and rendered by `prose()`), so the
// implementation was WIDER than the permission it implements: a teacher could rewrite a Summary Table
// row's title. It is now administrator-only, and the drift spec ties this list to the field
// definitions so the two halves cannot part company again.
export const SUMMARY_LESSON_PROSE = ['observed', 'learned', 'explained']

/**
 * The teacher-facing label for each prose field — the SAME words the editor puts above the textarea.
 *
 * ⚑ Restated here rather than derived from the field name, because the authored labels are not
 * mechanical: `keyInquiry` is "Key inquiry question" and `purposeInStoryline` is "Purpose in the
 * storyline", and `tests/unit/editorPlainLanguage.spec.ts` exists because that plain-language wording
 * was chosen deliberately. A de-camelising regex gets both of those wrong, which is exactly what the
 * edit-recovery restore prompt did until it was measured — naming a field one thing in the panel and
 * another in the form the teacher was comparing it against.
 *
 * ⚑ A COPY, and therefore pinned: `tests/unit/proseWhitelistDrift.spec.ts` asserts every entry matches
 * the `prose()` label in `fields/lessonContent.ts`, and that none is missing. The alternative —
 * importing `lessonContentFields` — drags the access-control module into a client component.
 *
 * Names are unique across the sub-objects they appear in (`title` and `observed` recur with the same
 * label), so one flat map serves every scope.
 */
export const PROSE_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  teacherReflection: 'Teacher reflection',
  purpose: 'Purpose',
  knowledge: 'Knowledge',
  skills: 'Skills',
  attitudes: 'Attitudes',
  keyInquiry: 'Key inquiry question',
  purposeInStoryline: 'Purpose in the storyline',
  safetyNotes: 'Safety notes',
  learnerExperience: 'Learner experience',
  teacherMoves: 'Teacher moves',
  sensemakingStrategy: 'Sensemaking strategy',
  formativeAssessment: 'Formative assessment',
  observed: 'Observed',
  learned: 'Learned',
  explained: 'Explained',
  instructions: 'Instructions',
  prompt: 'Prompt',
}

/** Return a copy of `base` with only `proseKeys` overlaid from `sub` (when present). */
const overlayProse = (base: Doc, sub: Doc | undefined, proseKeys: string[]): Doc => {
  const out: Doc = { ...base }
  if (sub) for (const key of proseKeys) if (key in sub) out[key] = sub[key]
  return out
}

/** Map submitted array rows back onto their originals by id, overlaying only prose. */
const overlayRows = (
  base: Doc[] | undefined,
  submitted: Doc[],
  proseKeys: string[],
  perRow?: (baseRow: Doc, subRow: Doc, out: Doc) => void,
): Doc[] => {
  const byId = new Map((base ?? []).map((r) => [r.id, r]))
  return submitted.map((sub) => {
    const baseRow = byId.get(sub.id)
    if (!baseRow) return sub // unreachable: cardinality/order already validated
    const out = overlayProse(baseRow, sub, proseKeys)
    perRow?.(baseRow, sub, out)
    return out
  })
}

/**
 * `resourceLinks` is system-owned for every authenticated role. Save-as-new creates through an
 * overrideAccess server path after applying this split, so Payload field access is not sufficient:
 * restore the stored map on existing lessons. Subject Admins may also duplicate a lesson row (SPEC
 * §5); that new row may reuse an EXACT resourceLinks value already present in the source version.
 * Match after stripping Payload row ids, then restore the server copy so callers can neither alter
 * resource values nor smuggle row ids into the new snapshot. Any other caller-supplied map is dropped
 * and the generatable gate rejects the new lesson rather than storing invented system data.
 */
/**
 * Payload's empty-array sentinel (`0`) → `[]`, on the array containers this content uses.
 *
 * Runs ABOVE the role fork, beside `preserveLessonResourceLinks`, because it is a SHAPE concern and
 * not a role one. The editing-access guard below defends itself regardless (see `submittedRows`), but admins
 * return before ever reaching it, so without this their `0` survives all the way into the merged
 * document — where it does not corrupt storage (Payload drops a non-array for an array column) but
 * DOES defeat the no-op guard in `endpoints/versionEdit.ts`: that compares
 * `canonicalJson` of the merge against the source, and `0` never equals `[]`, so a save that changed
 * nothing mints a byte-identical duplicate version instead of returning 400. Every bundle with an
 * empty `sections` / `rubric` / `summaryTable.lessons` was in that state.
 *
 * Only the exact `0` sentinel is rewritten. Anything else is left untouched for the teacher with editing access guard to
 * reject; admins are not structurally constrained, so silently reshaping their input is not this
 * function's business.
 */
const normalizeEmptyArrayContainers = (data: Doc): void => {
  const fix = (holder: Doc | undefined, key: string): void => {
    if (holder && holder[key] === 0) holder[key] = []
  }
  fix(data, 'lessons')
  if (Array.isArray(data.lessons))
    for (const lesson of data.lessons) fix(lesson as Doc, 'framework')
  fix(data.finalExplanation as Doc | undefined, 'sections')
  fix(data.finalExplanation as Doc | undefined, 'rubric')
  fix(data.summaryTable as Doc | undefined, 'lessons')
}

export const preserveLessonResourceLinks = (data: Doc, originalDoc: Doc): void => {
  if (!Array.isArray(data.lessons)) return
  const originalLessons = (originalDoc.lessons ?? []) as Doc[]
  const originals = new Map<string | number | undefined, Doc>(
    originalLessons.map((lesson) => [lesson.id, lesson] as const),
  )
  const storedResources = new Map<string, unknown>()
  for (const lesson of originalLessons) {
    if (Array.isArray(lesson.resourceLinks)) {
      storedResources.set(canonicalJson(stripIds(lesson.resourceLinks)), lesson.resourceLinks)
    }
  }
  data.lessons = data.lessons.map((lesson: Doc) => {
    const out = { ...lesson }
    const original = originals.get(lesson.id)
    if (original) out.resourceLinks = original.resourceLinks
    else if (Array.isArray(lesson.resourceLinks)) {
      const stored = storedResources.get(canonicalJson(stripIds(lesson.resourceLinks)))
      if (stored) out.resourceLinks = stored
      else delete out.resourceLinks
    } else delete out.resourceLinks
    return out
  })
}

/**
 * Apply the teacher with editing access whitelist to `data` (an UPDATE candidate), parameterised by the top-level keys an
 * editing access may influence on this collection. Mutates and returns `data`. Caller is responsible for any
 * numbering/versioning that should run for ALL users (kept out of here).
 */
export const applyEditorFieldSplit = ({
  data,
  originalDoc,
  operation,
  req,
  editorTopLevelKeys,
}: {
  data: Doc | undefined
  originalDoc: Doc | undefined
  operation: string
  req: Req
  editorTopLevelKeys: Set<string>
}): Doc | undefined => {
  if (operation !== 'update' || !originalDoc || !data) return data
  // Shape first, for EVERY role — see the function's own note for why it cannot live below the fork.
  normalizeEmptyArrayContainers(data)
  if (req.user) preserveLessonResourceLinks(data, originalDoc)
  // AUTHORITY from the STORED doc first (hardened 2026-07-04): the actor's role is judged against
  // the subject-grade the document actually belongs to, never one the submission claims — a caller
  // who is Subject Admin elsewhere must not be able to name THAT grade and bypass the whitelist.
  // (`data.subjectGrade` is only a fallback for callers that pre-strip the original; on this
  // update-only path `originalDoc.subjectGrade` is required data and always present.)
  const subjectGradeId = toId((originalDoc.subjectGrade ?? data.subjectGrade) as never)
  // Site Admins (and trusted system / overrideAccess calls — a missing user; unauthenticated
  // updates are denied at collection access) are unrestricted apart from the system-owned
  // resourceLinks preservation already applied above.
  if (!req.user || isSiteAdmin(req.user as User)) return data
  // Subject Admins are unrestricted EXCEPT the META identity fields (META_IDENTITY_KEYS —
  // Site-Admin-only repair data, decided 2026-07-05): those are restored from the stored doc, the
  // same silent-preserve idiom as the teacher with editing access whitelist below. The rest of META (titleDoc, column
  // labels, …) stays Subject-Admin-editable per SPEC §5.
  if (isSubjectAdminFor(req.user as User, subjectGradeId)) {
    const origMeta = originalDoc.meta as Doc | undefined
    if (origMeta) {
      const meta = { ...((data.meta as Doc | undefined) ?? {}) }
      for (const key of META_IDENTITY_KEYS) meta[key] = origMeta[key]
      data.meta = meta
    }
    return data
  }

  const reject = (): never => {
    throw new Forbidden(req.t)
  }

  // 1. Cardinality / order is structural — teachers with editing access may not change it.
  // Stored side coerces (the DB always yields an array); submitted side VALIDATES — see
  // `submittedRows`, which admits only a real array or Payload's `0` empty-container sentinel.
  if ('lessons' in data) {
    // Validated once and reused: the `for…of` below must iterate the same checked value, and a
    // numeric container is not nullish, so an unchecked `data.lessons ?? []` would throw
    // "0 is not iterable" here even after the sequence check passed (both sides empty).
    const submittedLessons = submittedRows(data.lessons, reject)
    if (!sameSequence(idsOf(storedRows(originalDoc.lessons)), idsOf(submittedLessons))) reject()
    const prevById = new Map(
      storedRows(originalDoc.lessons).map((l: Row & { framework?: Row[] }) => [l.id, l]),
    )
    for (const lesson of submittedLessons) {
      const prev = prevById.get(lesson.id) as { framework?: Row[] } | undefined
      if (prev && 'framework' in lesson) {
        const submittedFramework = submittedRows((lesson as Doc).framework, reject)
        if (!sameSequence(idsOf(storedRows(prev.framework)), idsOf(submittedFramework))) reject()
      }
    }
  }
  // ⚑ THESE ROW CHECKS ARE STILL LOAD-BEARING after the step-2 rebuild, which is not obvious and was
  // nearly lost: `overlayRows` iterates the SUBMITTED array, and a row whose id has no match in the
  // original is returned RAW (`if (!baseRow) return sub`). So the rebuild guarantees only that
  // UNMENTIONED fields come from the original — it does nothing about added, deleted or reordered
  // rows. Without this, a teacher with editing access could append a section carrying arbitrary admin subfields and have
  // it pass straight through. The `unreachable` comment inside `overlayRows` is true only because
  // this runs first.
  const guardRows = (before: Doc, sub: Doc, key: string): void => {
    if (
      key in sub &&
      !sameSequence(idsOf(storedRows(before[key])), idsOf(submittedRows(sub[key], reject)))
    )
      reject()
  }

  // PRESENCE, not truthiness — see the rebuild note in step 2 for what the truthiness form let past.
  if ('finalExplanation' in data) {
    const fe = submittedGroup(data.finalExplanation, reject)
    const feBefore = (originalDoc.finalExplanation ?? {}) as Doc
    guardRows(feBefore, fe, 'sections')
    guardRows(feBefore, fe, 'rubric')
  }
  if ('summaryTable' in data) {
    const stBefore = (originalDoc.summaryTable ?? {}) as Doc
    guardRows(stBefore, submittedGroup(data.summaryTable, reject), 'lessons')
  }

  // 2. WHITELIST: write = original, with only prose overlaid from the submission.
  const orig = originalDoc as Doc
  const d = data as Doc

  // Restore EVERY top-level key from the original except the ones a teacher with editing access legitimately influences
  // (the content containers overlaid below + collection-specific version fields). So a NEW top-level
  // field nobody wired up is reset to the original automatically.
  for (const key of Object.keys(d)) {
    if (editorTopLevelKeys.has(key)) continue
    d[key] = orig[key]
  }

  if (Array.isArray(d.lessons)) {
    d.lessons = overlayRows(
      orig.lessons as Doc[] | undefined,
      d.lessons as Doc[],
      LESSON_PROSE,
      (baseRow, subRow, out) => {
        out.slo = overlayProse((baseRow.slo ?? {}) as Doc, subRow.slo as Doc, SLO_PROSE)
        out.summaryTablePrompt = overlayProse(
          (baseRow.summaryTablePrompt ?? {}) as Doc,
          subRow.summaryTablePrompt as Doc,
          SUMMARY_PROMPT_PROSE,
        )
        if (Array.isArray(subRow.framework)) {
          out.framework = overlayRows(
            baseRow.framework as Doc[] | undefined,
            subRow.framework as Doc[],
            FRAMEWORK_PROSE,
          )
        }
      },
    )
  }

  // ⚑ REBUILT FROM THE ORIGINAL, ALWAYS. A submission can only OVERLAY prose onto the stored
  // container, so an absent or null `finalExplanation` / `summaryTable` means "unchanged", never
  // "deleted".
  //
  // This and the structural guard above both used to test TRUTHINESS while the `lessons` guard tested
  // PRESENCE, and the gap between them was reachable: a submitted `null` — or simply OMITTING the key
  // — skipped the cardinality check AND the blanket restore in step 2, because `editorTopLevelKeys`
  // deliberately exempts these keys from it. The whole group then reached `payload.create` as null,
  // so a teacher with editing access's save-as-new could drop the admin-authored Final Explanation or Summary Table.
  //
  // `lessons` was never exposed the same way, which is why the asymmetry survived: a version with no
  // lessons is REFUSED by `validateGeneratable`, whereas a missing finalExplanation/summaryTable is
  // only a non-blocking `deliverableWarnings` entry — nothing downstream would have caught it. That
  // gate is also why `lessons` is left alone below rather than made symmetric here: restoring it
  // silently would turn today's loud 422 into a quiet pass.
  //
  // ⚑ BOTH HALVES OF THE CONDITION ARE LOAD-BEARING. Drop the `orig` half and an omitted key stops
  // being restored — the bug above returns. Drop the `d` half and a container the original never had
  // but the submission supplies is skipped entirely, so the RAW submission survives onto `d` with no
  // prose filtering at all. When both are absent nothing is written, which is correct: inventing an
  // empty container would be a false difference to the `comparableContent` no-op guard in
  // `endpoints/versionEdit.ts`, exactly like the `0` sentinel documented above.
  //
  // Parametrised because the two bodies were identical but for four values, and the change that
  // created this comment had to be made twice — which is the shape of the bug it fixes.
  const rebuildGroup = (
    key: string,
    prose: string[],
    rowsKey: string,
    rowProse: string[],
  ): void => {
    if (orig[key] == null && d[key] == null) return
    const base = (orig[key] ?? {}) as Doc
    const sub = asSubmittedGroup(d[key])
    const out = overlayProse(base, sub, prose)
    if (sub && Array.isArray(sub[rowsKey])) {
      out[rowsKey] = overlayRows(
        base[rowsKey] as Doc[] | undefined,
        sub[rowsKey] as Doc[],
        rowProse,
      )
    }
    d[key] = out
  }

  rebuildGroup('finalExplanation', FINAL_EXPLANATION_PROSE, 'sections', SECTION_PROSE)
  // No prose keys: `subStrand` and `drivingQuestion` are admin-only, so the headers are preserved
  // wholesale from the base. `rubric` is preserved the same way, by having no overlay above.
  rebuildGroup('summaryTable', [], 'lessons', SUMMARY_LESSON_PROSE)

  return data
}
