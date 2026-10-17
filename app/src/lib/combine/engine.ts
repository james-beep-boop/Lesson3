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
 * ⚑ ROWS ARE PAIRED BY POSITION, AFTER A SHAPE CHECK. Every save regenerates row ids (`stripIds` in
 * save-as-new), so no two versions share one and pairing by id finds nothing. `captureAnchors` walks a
 * document's prose rows in document order; two versions with the same structure produce the same
 * sequence of scopes, and the i-th anchor of one IS the i-th anchor of the other. A Teacher with
 * editing access cannot change structure (`applyEditorFieldSplit` rejects it), so two teachers'
 * versions always pair.
 *
 * ⚑ WHICH VERSION THE EDITOR OPENS. Everything that is not prose — phases, durations, rubrics, answer
 * keys, META, structure — must come whole from ONE side, because the saved result is checked against
 * the version it was opened from. If only one side changed non-prose content since the ancestor, the
 * combine starts from that side; otherwise from `a`. Both sides changing it differently is refused
 * (version 1); so is differing structure, and differing system data (`resourceLinks`).
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
} from '../../hooks/fieldSplit'
import { canonicalJson } from '../canonicalJson'
import {
  captureAnchors,
  parseKey,
  projectCapture,
  type CaptureMap,
} from '../editRecovery/projection'
import { stripIds } from '../stripIds'
import { contentOf } from '../versionContent'
import { merge3 } from './diff3'

type Doc = Record<string, unknown>
type Row = Doc

export type CombineSide = 'a' | 'b'

export type CombineRefusal = 'structure' | 'admin-both' | 'system'

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
export const REFUSAL_MESSAGES: Record<CombineRefusal, string> = {
  structure:
    'These versions have different lessons, phases or sections, so they cannot be combined automatically yet. Open one and copy across the changes you need from the other.',
  'admin-both':
    'Both versions change content only an administrator can edit, such as phases, durations, rubrics or answer keys, so they cannot be combined automatically. A subject administrator can copy the changes across by hand.',
  system:
    'These versions come from different uploads of the lesson plan, so they cannot be combined.',
}

const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
const asDoc = (v: unknown): Doc | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : undefined

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

/** Canonical non-prose content: identity metadata and row ids removed, keys sorted. */
const nonProseForm = (doc: Doc): string => canonicalJson(stripIds(withoutProse(contentOf(doc))))

/** System-owned data that no edit can change: the lessons' resolved resource links. */
const systemForm = (doc: Doc): string =>
  canonicalJson(stripIds(asRows(doc.lessons).map((l) => l.resourceLinks ?? null)))

/** The scope sequence of a document's prose rows — equal sequences mean the rows pair by position. */
const shapeOf = (anchors: { key: string }[]): string =>
  anchors.map((a) => parseKey(a.key).scope).join('|')

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Plan a combine of `a` and `b` from their common ancestor `base` (null when none survives). */
export function planCombine({ base, a, b }: { base: Doc | null; a: Doc; b: Doc }): CombinePlan {
  const refuse = (refusal: CombineRefusal): CombinePlan => ({
    ok: false,
    refusal,
    message: REFUSAL_MESSAGES[refusal],
  })

  // Structure FIRST: an extra lesson also carries an extra set of resource links, and reporting that
  // as "different uploads" would send the teacher looking for the wrong cause.
  const anchorsA = captureAnchors(a)
  const anchorsB = captureAnchors(b)
  if (shapeOf(anchorsA) !== shapeOf(anchorsB)) return refuse('structure')
  if (systemForm(a) !== systemForm(b)) return refuse('system')

  // An ancestor whose prose rows do not pair with ours (e.g. an older one, from before a structural
  // edit both sides inherited) cannot be used position by position. Fall back to two-way rather
  // than refuse: every difference becomes a person's choice, which is never wrong.
  const anchorsBase = base ? captureAnchors(base) : null
  const usableBase = base && anchorsBase && shapeOf(anchorsBase) === shapeOf(anchorsA) ? base : null

  const formA = nonProseForm(a)
  const formB = nonProseForm(b)
  let start: CombineSide = 'a'
  if (formA !== formB) {
    if (!usableBase) return refuse('admin-both')
    const formBase = nonProseForm(usableBase)
    const changedA = formA !== formBase
    const changedB = formB !== formBase
    if (changedA && changedB) return refuse('admin-both')
    if (changedB) start = 'b'
  }

  const proseA = projectCapture(a)
  const proseB = projectCapture(b)
  const proseBase = usableBase ? projectCapture(usableBase) : null
  const startAnchors = start === 'a' ? anchorsA : anchorsB

  const overlay: CaptureMap = {}
  const changes: CombineChange[] = []
  const conflicts: CombineConflict[] = []

  startAnchors.forEach((anchor, i) => {
    const keyA = anchorsA[i].key
    const keyB = anchorsB[i].key
    const keyBase = usableBase && anchorsBase ? anchorsBase[i].key : null
    // Every prose field this scope can hold — the union of what either side actually stored.
    const fields = new Set([...Object.keys(proseA[keyA] ?? {}), ...Object.keys(proseB[keyB] ?? {})])
    for (const field of fields) {
      const va = text(proseA[keyA]?.[field])
      const vb = text(proseB[keyB]?.[field])
      const vStart = start === 'a' ? va : vb
      const where = {
        key: anchor.key,
        field,
        heading: anchor.heading,
        label: PROSE_LABELS[field] ?? field,
      }

      let combined: string
      let from: CombineChange['from']
      if (va === vb) {
        continue // nothing to reconcile, and nothing differs from the starting side
      } else if (!proseBase || keyBase === null) {
        conflicts.push({ ...where, base: null, a: va, b: vb, reason: 'no-ancestor' })
        continue
      } else {
        const v0 = text(proseBase[keyBase]?.[field])
        if (va === v0) {
          combined = vb
          from = 'b'
        } else if (vb === v0) {
          combined = va
          from = 'a'
        } else if (va === '' || vb === '') {
          conflicts.push({ ...where, base: v0, a: va, b: vb, reason: 'emptied' })
          continue
        } else {
          const merged = merge3(v0, va, vb)
          if (!merged.ok) {
            conflicts.push({ ...where, base: v0, a: va, b: vb, reason: 'both-edited' })
            continue
          }
          combined = merged.text
          from = 'both'
        }
      }

      if (combined !== vStart) {
        overlay[anchor.key] = { ...overlay[anchor.key], [field]: combined }
        changes.push({ ...where, from })
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
