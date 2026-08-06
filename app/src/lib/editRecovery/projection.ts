/**
 * Edit-recovery projection — the pure, DB-free half of the feature (design §3).
 *
 * Two directions, and both are total functions over plain data so they can be unit-tested without
 * Payload, a database, or a request:
 *
 *   `projectCapture(doc)`  — form document → sparse map of PROSE leaves, keyed by row id.
 *   `applyCapture(doc, m)` — source document + map → document with that prose overlaid.
 *
 * ⚑ **The whitelists are imported, never restated.** `LESSON_PROSE`, `SLO_PROSE`, … are the same
 * constants `applyEditorFieldSplit` uses at the save boundary, so "what an Editor may write" and
 * "what a capture may hold" cannot drift apart — and `tests/unit/proseWhitelistDrift.spec.ts` already
 * pins those constants to the `canEditProse` field factories. That inheritance covers the CONSTANTS
 * drifting; it does not cover this file misusing them, so the projection has its own negative and
 * symmetry tests. An admin/system field added later is excluded here automatically, in the secure
 * direction: `resourceLinks`, `phase`, `duration`, `number`, `exemplar`, `rubric`, META, `semver` and
 * `author` cannot enter a capture at all.
 *
 * ⚑ **Row ids are KEYS, never values.** A key locates a leaf; it is validated against the current
 * source on apply and dropped when unrecognised, never created. No id is ever written back as a field
 * value, and no capture can add, remove or reorder a row — structure is not editable through this
 * path (SPEC §5: v1 is prose-only, because structural edits change row identity and a sparse overlay
 * would have nothing stable to key on).
 *
 * Key format is `<scope>:<rowId>`, plus one scope-only key for the singleton group that has no row:
 *
 *   lesson:<id>         title, overview, teacherReflection
 *   slo:<id>            the lesson's `slo` group        (keyed by the LESSON's row id)
 *   prompt:<id>         the lesson's `summaryTablePrompt` (keyed by the LESSON's row id)
 *   framework:<id>      a framework row inside a lesson
 *   finalExplanation    instructions                    (singleton — no row id exists)
 *   section:<id>        a finalExplanation section row
 *   summaryLesson:<id>  a summaryTable lesson row
 *
 * `summaryTable`'s own leaves (`subStrand`, `drivingQuestion`) are admin-only and deliberately absent,
 * matching `applyEditorFieldSplit`, which overlays it with an empty key list.
 *
 * **Captures hold values, not diffs** — but this is still a CONTEXT-LIGHT LEAF MAP, not a snapshot.
 * Storing values rather than deltas means a capture can be read without recomputing against a source
 * that may have moved, which matters because SPEC §5 requires stale and schema-mismatched captures to
 * remain displayable for copy-out. It does NOT make a capture self-explanatory: what it holds is
 * prose keyed by opaque row ids, with no titles, ordering or parentage of its own. For a framework
 * row that has since been deleted from the source, copy-out has an id and some prose and nothing
 * else to say what it belonged to. Making that intelligible is PR 2's problem at the restore UI, and
 * it is a real one — not something this format has already solved. If the hard byte cap bites,
 * revisit here rather than at the cap.
 */
import {
  FINAL_EXPLANATION_PROSE,
  FRAMEWORK_PROSE,
  LESSON_PROSE,
  SECTION_PROSE,
  SLO_PROSE,
  SUMMARY_LESSON_PROSE,
  SUMMARY_PROMPT_PROSE,
} from '../../hooks/fieldSplit'

type Doc = Record<string, unknown>
type Row = Doc & { id?: unknown }

/**
 * A capture: `<scope>:<rowId>` (or a bare scope for the singleton) → prose leaves.
 *
 * ⚑ **`null` is a VALUE here, not an absence.** Payload's generated prose fields are `string | null`,
 * and `applyEditorFieldSplit` overlays whatever the submission holds, `null` included. Omitting
 * `null` from a capture would mean a cleared field silently restores its OLD text — the user's
 * deletion is exactly the unsaved edit this feature exists to preserve, so dropping it would lose
 * work in the one direction nobody would notice. A form textarea yields `''` rather than `null`
 * today, so this is defensive rather than load-bearing; it is typed and tested so the answer is
 * recorded rather than incidental. Importing the whitelist synchronises field NAMES, never value
 * semantics — that part is this file's own contract.
 *
 * `undefined` remains an absence: a key the source never had is not captured and never restored.
 */
export type ProseValue = string | null
export type CaptureMap = Record<string, Record<string, ProseValue>>

/** The one key with no row id, because `finalExplanation` is a group rather than an array row. */
export const FINAL_EXPLANATION_KEY = 'finalExplanation'

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
const asDoc = (v: unknown): Doc | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : undefined

/**
 * Row ids are stringified defensively. Payload's array child tables key rows with `character
 * varying` (verified against `lesson_bundle_versions_lessons` and its framework/summary siblings), so
 * `String()` is a no-op today — but a map key must be a string regardless of what the adapter hands
 * back, and this is the single place that assumption lives.
 */
const keyFor = (scope: string, id: unknown): string | null =>
  id === undefined || id === null ? null : `${scope}:${String(id)}`

/**
 * The decode half, exported so the key format never has a second owner.
 *
 * `applyCapture` itself never decodes — it rebuilds keys by walking the source, which is what makes
 * "no id is ever restored as a value" structural. But `ApplyReport.droppedKeys` hands encoded strings
 * across this module's boundary, and the restore UI (PR 2, matrix case 28) has to explain a partial
 * restore, which needs the scope. Without this the only way to get it is `key.split(':')` written in
 * a React component — at which point the delimiter is a wire contract rather than a private detail,
 * and "what if a row id contains a colon" becomes someone else's question to get wrong.
 *
 * Splits on the FIRST colon only, so an id containing one round-trips.
 */
export const parseKey = (key: string): { scope: string; rowId: string | null } => {
  const i = key.indexOf(':')
  return i === -1
    ? { scope: key, rowId: null }
    : { scope: key.slice(0, i), rowId: key.slice(i + 1) }
}

/** A prose leaf: a string, or `null` for a cleared field. Anything else is malformed. */
const isProseValue = (v: unknown): v is ProseValue => v === null || typeof v === 'string'

/**
 * Code units the storage column cannot carry, replaced with U+FFFD.
 *
 * ⚑ **This is a RULE, not two special cases**, and it is stated that way because the first version was
 * an instance. Postgres rejects both of these outright — they are not merely awkward:
 *
 *   - an unpaired surrogate → `invalid input syntax for type json`
 *   - `U+0000` (NUL)        → `unsupported Unicode escape sequence: \u0000 cannot be converted to text`
 *
 * The first fix handled surrogates only, and NUL went straight through it — which matters because a
 * JSON request body may legally contain `"\u0000"` and `JSON.parse` yields a real NUL, so it arrives
 * off the wire with no textarea involved. Anything unstorable made `capture` THROW rather than return
 * a result, which is the contract that fix existed to protect. Verified against the live database
 * rather than reasoned about.
 *
 * It belongs HERE, not in the kernel. `pickProse` already owns "what a prose leaf may be", and it
 * already justifies itself with the same design law: prose is `\n`-separated plain text, so a value
 * carrying a shape the grammar forbids is dropped rather than coerced. "Must be well-formed, storable
 * text" is the same predicate — just the half discovered later.
 *
 * ⚑ `applyCapture` does NOT re-normalise, and does not need to: the guarantee on the read path is the
 * COLUMN, not a second sanitiser. `jsonb` physically cannot store either of these, so no capture in
 * the table can carry one, whatever build wrote it. The asymmetry is real and harmless — stating that
 * is better than adding unreachable defensive code and implying it does something.
 *
 * Replaced rather than rejected: this is a recovery feature, and losing a whole capture over one
 * unrenderable code unit is the wrong trade. One replacement character for both, because a rule with
 * two different remedies invites a third.
 */
const UNSTORABLE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u0000/g

export const normaliseProseValue = (v: ProseValue): ProseValue =>
  typeof v === 'string' ? v.replace(UNSTORABLE, '\uFFFD') : v

/**
 * Pick the whitelisted leaves that are present AND are prose values. A number or object under a
 * prose key is dropped rather than coerced: prose is `\n`-separated plain text by design law
 * (CLAUDE.md), so storing one would let a capture reintroduce a shape the editor grammar forbids.
 * `null` IS kept — see the note on `CaptureMap`.
 */
const pickProse = (src: Doc | undefined, keys: readonly string[]): Record<string, ProseValue> => {
  const out: Record<string, ProseValue> = {}
  if (!src) return out
  for (const k of keys) {
    const v = src[k]
    if (isProseValue(v)) out[k] = normaliseProseValue(v)
  }
  return out
}

/** Assign only when non-empty, so the map stays sparse and an untouched row costs nothing. */
const put = (map: CaptureMap, key: string | null, leaves: Record<string, ProseValue>): void => {
  if (key && Object.keys(leaves).length > 0) map[key] = leaves
}

/** Form document → capture map. Pure; ignores everything outside the prose whitelists. */
export const projectCapture = (doc: Doc | undefined | null): CaptureMap => {
  const map: CaptureMap = {}
  if (!doc) return map

  for (const lesson of asRows(doc.lessons)) {
    put(map, keyFor('lesson', lesson.id), pickProse(lesson, LESSON_PROSE))
    put(map, keyFor('slo', lesson.id), pickProse(asDoc(lesson.slo), SLO_PROSE))
    put(
      map,
      keyFor('prompt', lesson.id),
      pickProse(asDoc(lesson.summaryTablePrompt), SUMMARY_PROMPT_PROSE),
    )
    for (const fw of asRows(lesson.framework)) {
      put(map, keyFor('framework', fw.id), pickProse(fw, FRAMEWORK_PROSE))
    }
  }

  const fe = asDoc(doc.finalExplanation)
  if (fe) {
    put(map, FINAL_EXPLANATION_KEY, pickProse(fe, FINAL_EXPLANATION_PROSE))
    for (const s of asRows(fe.sections)) {
      put(map, keyFor('section', s.id), pickProse(s, SECTION_PROSE))
    }
  }

  for (const sl of asRows(asDoc(doc.summaryTable)?.lessons)) {
    put(map, keyFor('summaryLesson', sl.id), pickProse(sl, SUMMARY_LESSON_PROSE))
  }

  return map
}

/** What `applyCapture` did, so the caller can surface a partial restore rather than pretend. */
export type ApplyReport = {
  /** Keys in the capture with no counterpart in the current source — dropped, never created. */
  droppedKeys: string[]
  /** Leaves actually overlaid. */
  applied: number
}

/** Overlay `leaves` onto a copy of `base`, restricted to `keys`. Never introduces a key. */
const overlay = (
  base: Doc,
  leaves: Record<string, ProseValue> | undefined,
  keys: readonly string[],
  report: { applied: number },
): Doc => {
  const out: Doc = { ...base }
  if (!leaves) return out
  for (const k of keys) {
    // `in` rather than a truthiness or undefined check, so a stored `null` is applied as the cleared
    // value it represents instead of being read as "not present".
    if (k in leaves && isProseValue(leaves[k])) {
      out[k] = leaves[k]
      report.applied += 1
    }
  }
  return out
}

/**
 * Source document + capture → document with prose overlaid.
 *
 * Structure comes ENTIRELY from `base`: rows are walked from the source and looked up in the map, so
 * a key naming a row that no longer exists is simply never visited (and is reported as dropped),
 * and no map key can add a row. `id` is copied from the source row as part of the spread — it is
 * never read from the capture, which is what makes "no id is restored as a field value" structural
 * rather than a check that could be forgotten.
 */
export const applyCapture = (
  base: Doc,
  capture: CaptureMap | null | undefined,
): { doc: Doc; report: ApplyReport } => {
  const report = { applied: 0 }
  const seen = new Set<string>()
  const map = capture ?? {}
  const take = (key: string | null): Record<string, ProseValue> | undefined => {
    if (!key) return undefined
    seen.add(key)
    return map[key]
  }

  const out: Doc = { ...base }

  if (Array.isArray(base.lessons)) {
    out.lessons = (base.lessons as Row[]).map((lesson) => {
      const l = overlay(lesson, take(keyFor('lesson', lesson.id)), LESSON_PROSE, report)
      const slo = asDoc(lesson.slo)
      if (slo) l.slo = overlay(slo, take(keyFor('slo', lesson.id)), SLO_PROSE, report)
      const prompt = asDoc(lesson.summaryTablePrompt)
      if (prompt) {
        l.summaryTablePrompt = overlay(
          prompt,
          take(keyFor('prompt', lesson.id)),
          SUMMARY_PROMPT_PROSE,
          report,
        )
      }
      if (Array.isArray(lesson.framework)) {
        l.framework = (lesson.framework as Row[]).map((fw) =>
          overlay(fw, take(keyFor('framework', fw.id)), FRAMEWORK_PROSE, report),
        )
      }
      return l
    })
  }

  const fe = asDoc(base.finalExplanation)
  if (fe) {
    const f = overlay(fe, take(FINAL_EXPLANATION_KEY), FINAL_EXPLANATION_PROSE, report)
    if (Array.isArray(fe.sections)) {
      f.sections = (fe.sections as Row[]).map((s) =>
        overlay(s, take(keyFor('section', s.id)), SECTION_PROSE, report),
      )
    }
    out.finalExplanation = f
  }

  const st = asDoc(base.summaryTable)
  if (st && Array.isArray(st.lessons)) {
    out.summaryTable = {
      ...st,
      lessons: (st.lessons as Row[]).map((sl) =>
        overlay(sl, take(keyFor('summaryLesson', sl.id)), SUMMARY_LESSON_PROSE, report),
      ),
    }
  }

  return {
    doc: out,
    report: { ...report, droppedKeys: Object.keys(map).filter((k) => !seen.has(k)) },
  }
}
