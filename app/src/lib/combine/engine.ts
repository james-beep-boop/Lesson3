/**
 * The Combine versions engine (SPEC §6) — pure, DB-free: given a common ancestor and two versions,
 * work out what one combined version should contain, and what a person must decide.
 *
 * ⚑ A COMBINE IS AN EDIT SESSION WITH TWO PARENTS, NOT A NEW WRITE PATH. The engine's output is shaped
 * like an edit-recovery capture — prose leaves keyed by the STARTING version's row ids — so the editor
 * can apply it with `applyCapture` and show it with the existing restore preview, and the result is
 * saved through the unchanged `save-as-new` (field split, no-op guard, stale guard, semver retry).
 * Nothing here writes anything.
 *
 * Rows pair by position only AFTER shape and correspondence checks. Saves regenerate row ids, so
 * equal scope sequences alone cannot detect reordering. `rowsCorrespond` requires unique upload
 * identities for multiple lessons and unique phase/section/summary labels in unchanged order.
 * Ambiguous arrays are refused until stable row identity is available. An unaligned ancestor is
 * ignored; the aligned sides can still be compared two-way.
 *
 * ⚑ WHICH VERSION THE EDITOR OPENS. Everything that is not prose — phases, durations, rubrics, answer
 * keys, META, structure — must come whole from ONE side, because the saved result is checked against
 * the version it was opened from. If only one side changed non-prose content since the ancestor, the
 * combine starts from that side; otherwise from `a`. Both sides changing it differently is refused
 * (version 1); so is differing structure. With a usable ancestor, resource links may come from the
 * sole changed side. If administrator and resource choices require different sides, refuse rather
 * than splice protected fields. Differing resource links without a usable ancestor are refused.
 *
 * ⚑ PER PROSE FIELD: one side changed it → take that side; both made the same change → take it; one
 * emptied it and the other edited it → conflict (never silently); both changed it differently → merge
 * paragraph by paragraph (`merge3`), conflicting where the same paragraph was edited. Without a usable
 * ancestor every difference is a conflict ("two-way"), which is never wrong — only less automatic.
 */
import {
  FINAL_EXPLANATION_PROSE,
  FRAMEWORK_PROSE,
  LESSON_PROSE,
  PROSE_LABELS,
  SECTION_PROSE,
  SLO_PROSE,
  SUMMARY_LESSON_PROSE,
  SUMMARY_PROMPT_PROSE,
} from '../proseFields'
import { canonicalJson } from '../canonicalJson'
import {
  asDoc,
  asRows,
  captureAnchors,
  parseKey,
  projectCapture,
  proseText,
  type CaptureMap,
} from '../editRecovery/projection'
import { stripIds } from '../stripIds'
import { comparableContent } from '../versionContent'
import { rowsCorrespond } from './correspondence'
import { createMergeBudget, merge3, type MergeBudget } from './diff3'

type Doc = Record<string, unknown>

export type CombineSide = 'a' | 'b'

export type CombineRefusal = 'structure' | 'admin-both' | 'admin-resource' | 'system' | 'size'

/** One field a person must decide. Keys are the STARTING version's capture keys. */
export interface CombineConflict {
  key: string
  field: string
  /** Where it is, e.g. "Lesson 2 — phase 1". */
  heading: string
  /** What it is, e.g. "Teacher moves". */
  label: string
  /** The ancestor's text, or null when there is no usable ancestor. */
  base: string | null
  a: string
  b: string
  reason: 'both-edited' | 'emptied' | 'no-ancestor'
}

/** One field changed automatically, relative to the starting version. */
export interface CombineChange {
  key: string
  field: string
  heading: string
  label: string
  /** `a` or `b`: taken from that side. `both`: paragraphs from each side, merged. */
  from: CombineSide | 'both'
}

export type CombinePlan =
  | { ok: false; refusal: CombineRefusal; message: string }
  | {
      ok: true
      /** The version the editor opens; the overlay and conflicts are keyed by its rows. */
      start: CombineSide
      ancestry: 'three-way' | 'two-way'
      /** Prose to apply onto `start` (only fields whose combined text differs from it). */
      overlay: CaptureMap
      changes: CombineChange[]
      conflicts: CombineConflict[]
    }

/** User-facing refusals. Plain language; each says what to do instead. */
const REFUSAL_MESSAGES: Record<CombineRefusal, string> = {
  size: 'These versions are too large to combine automatically. Open one and copy across the changes you need from the other.',
  structure:
    'These rows cannot be matched reliably. They may have been reordered, renamed, or repeated. Open one version and copy across the changes you need.',
  'admin-both':
    'Both versions change content only an administrator can edit, such as phases, durations, rubrics or answer keys, so they cannot be combined automatically. A subject administrator can copy the changes across by hand.',
  'admin-resource':
    'One version changes content only an administrator can edit, and the other changes the resource links. These changes cannot be combined automatically. Open one version and copy across the text you need from the other.',
  system:
    'These versions come from different uploads of the lesson plan, so they cannot be combined.',
}

const without = (doc: Doc | undefined, keys: readonly string[]): Doc | undefined => {
  if (!doc) return doc
  const out: Doc = { ...doc }
  for (const k of keys) delete out[k]
  return out
}

/**
 * The document with every PROSE leaf removed — what must come whole from one side.
 *
 * Walks the same whitelists in the same shape as `projectCapture`, so "prose" means exactly what the
 * field split and edit recovery mean by it; `tests/unit/combineEngine.spec.ts` pins the two walks
 * against each other (nothing `projectCapture` sees survives this, and nothing else is removed).
 */
export const withoutProse = (doc: Doc): Doc => {
  const out: Doc = { ...doc }
  if (Array.isArray(doc.lessons)) {
    out.lessons = asRows(doc.lessons).map((lesson) => ({
      ...without(lesson, LESSON_PROSE),
      ...(asDoc(lesson.slo) ? { slo: without(asDoc(lesson.slo), SLO_PROSE) } : {}),
      ...(asDoc(lesson.summaryTablePrompt)
        ? { summaryTablePrompt: without(asDoc(lesson.summaryTablePrompt), SUMMARY_PROMPT_PROSE) }
        : {}),
      ...(Array.isArray(lesson.framework)
        ? { framework: asRows(lesson.framework).map((fw) => without(fw, FRAMEWORK_PROSE)) }
        : {}),
    }))
  }
  const fe = asDoc(doc.finalExplanation)
  if (fe) {
    out.finalExplanation = {
      ...without(fe, FINAL_EXPLANATION_PROSE),
      ...(Array.isArray(fe.sections)
        ? { sections: asRows(fe.sections).map((s) => without(s, SECTION_PROSE)) }
        : {}),
    }
  }
  const st = asDoc(doc.summaryTable)
  if (st && Array.isArray(st.lessons)) {
    out.summaryTable = {
      ...st,
      lessons: asRows(st.lessons).map((l) => without(l, SUMMARY_LESSON_PROSE)),
    }
  }
  return out
}

/** Administrator-owned content, compared separately from system-owned resource links. */
const administratorForm = (doc: Doc): string => {
  const out = withoutProse(doc)
  if (Array.isArray(out.lessons))
    out.lessons = asRows(out.lessons).map((lesson) => without(lesson, ['resourceLinks']))
  return comparableContent(out)
}

/** System-owned data that no edit can change: the lessons' resolved resource links. */
const systemForm = (doc: Doc): string =>
  canonicalJson(stripIds(asRows(doc.lessons).map((l) => l.resourceLinks ?? null)))

/** The scope sequence checks cardinality and nesting, but does not establish row identity. */
const shapeOf = (anchors: { key: string }[]): string =>
  anchors.map((a) => parseKey(a.key).scope).join('|')

/** One field's outcome: the combined text and where it came from, or why a person must choose. */
const decide = (
  v0: string | null,
  va: string,
  vb: string,
  budget: MergeBudget,
): { text: string; from: CombineChange['from'] } | { reason: CombineConflict['reason'] } => {
  if (v0 === null) return { reason: 'no-ancestor' }
  if (va === v0) return { text: vb, from: 'b' }
  if (vb === v0) return { text: va, from: 'a' }
  if (va === '' || vb === '') return { reason: 'emptied' }
  const merged = merge3(v0, va, vb, budget)
  return merged.ok ? { text: merged.text, from: 'both' } : { reason: 'both-edited' }
}

/**
 * Plan a combine of `a` and `b` from their common ancestor `base` (null when none survives). Takes
 * stored version documents as they come from Payload.
 */
export function planCombine(input: { base: object | null; a: object; b: object }): CombinePlan {
  const a = input.a as Doc
  const b = input.b as Doc
  const base = input.base as Doc | null
  const refuse = (refusal: CombineRefusal): CombinePlan => ({
    ok: false,
    refusal,
    message: REFUSAL_MESSAGES[refusal],
  })

  // Bound the linear walks, serialisations and response as well as the quadratic paragraph work.
  // Check before projecting or canonicalising; large fields and many tiny rows both cost work.
  let chars = 0
  let nodes = 0
  const pending: unknown[] = [a, b, base]
  while (pending.length) {
    const value = pending.pop()
    if (++nodes > 100_000) return refuse('size')
    if (typeof value === 'string') chars += value.length
    else if (value && typeof value === 'object') {
      const children = Object.values(value)
      if (children.length + nodes + pending.length > 100_000) return refuse('size')
      for (const child of children) pending.push(child)
    }
    if (chars > 6_000_000) return refuse('size')
  }

  // Structure FIRST: an extra lesson also carries an extra set of resource links, and reporting that
  // as "different uploads" would send the teacher looking for the wrong cause.
  const anchorsA = captureAnchors(a)
  const anchorsB = captureAnchors(b)
  const shape = shapeOf(anchorsA)
  if (shapeOf(anchorsB) !== shape) return refuse('structure')

  // An ancestor whose prose rows do not pair with ours (e.g. an older one, from before a structural
  // edit both sides inherited) cannot be used position by position. Fall back to two-way rather
  // than refuse: every difference becomes a person's choice, which is never wrong.
  const candidateAnchors = base ? captureAnchors(base) : null
  const baseAnchors =
    candidateAnchors &&
    shapeOf(candidateAnchors) === shape &&
    base &&
    rowsCorrespond(a, base, { allowResourceChanges: true })
      ? candidateAnchors
      : null
  const usableBase = baseAnchors ? base : null

  const systemA = systemForm(a)
  const systemB = systemForm(b)
  let resourceStart: CombineSide | null = null
  if (systemA !== systemB) {
    if (!usableBase) return refuse('system')
    const systemBase = systemForm(usableBase)
    if (systemA !== systemBase && systemB !== systemBase) return refuse('system')
    resourceStart = systemA === systemBase ? 'b' : 'a'
  }
  if (!rowsCorrespond(a, b, { allowResourceChanges: usableBase !== null }))
    return refuse('structure')

  const formA = administratorForm(a)
  const formB = administratorForm(b)
  let start: CombineSide = 'a'
  if (formA !== formB) {
    if (!usableBase) return refuse('admin-both')
    const formBase = administratorForm(usableBase)
    const changedA = formA !== formBase
    const changedB = formB !== formBase
    if (changedA && changedB) return refuse('admin-both')
    if (changedB) start = 'b'
  }
  // The editor can apply prose only. Its starting version must already contain every protected
  // field we selected; never synthesize an administrator/system overlay for a teacher to save.
  if (resourceStart) {
    if (formA !== formB && start !== resourceStart) return refuse('admin-resource')
    start = resourceStart
  }

  const proseA = projectCapture(a)
  const proseB = projectCapture(b)
  const proseBase = usableBase ? projectCapture(usableBase) : null
  const startAnchors = start === 'a' ? anchorsA : anchorsB

  const overlay: CaptureMap = {}
  const changes: CombineChange[] = []
  const conflicts: CombineConflict[] = []
  const budget = createMergeBudget()

  startAnchors.forEach((anchor, i) => {
    const keyA = anchorsA[i].key
    const keyB = anchorsB[i].key
    const keyBase = baseAnchors ? baseAnchors[i].key : null
    // Every prose field this scope can hold — the union of what either side actually stored.
    const fields = new Set([...Object.keys(proseA[keyA] ?? {}), ...Object.keys(proseB[keyB] ?? {})])
    for (const field of fields) {
      const va = proseText(proseA[keyA]?.[field])
      const vb = proseText(proseB[keyB]?.[field])
      if (va === vb) continue // nothing to reconcile, and nothing differs from the starting side

      const v0 = proseBase && keyBase ? proseText(proseBase[keyBase]?.[field]) : null
      const where = {
        key: anchor.key,
        field,
        heading: anchor.heading,
        label: PROSE_LABELS[field] ?? field,
      }
      const outcome = decide(v0, va, vb, budget)
      if ('reason' in outcome) {
        conflicts.push({ ...where, base: v0, a: va, b: vb, reason: outcome.reason })
      } else if (outcome.text !== (start === 'a' ? va : vb)) {
        overlay[anchor.key] = { ...overlay[anchor.key], [field]: outcome.text }
        changes.push({ ...where, from: outcome.from })
      }
    }
  })

  return {
    ok: true,
    start,
    ancestry: usableBase ? 'three-way' : 'two-way',
    overlay,
    changes,
    conflicts,
  }
}
