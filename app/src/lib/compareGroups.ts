/**
 * LOGICAL CHANGE GROUPS — the unit the version-compare page diffs, filters and indexes
 * (design 2026-08-23, superseding the whole-document panes of 2026-07-05).
 *
 * WHY: compare used to run `HtmlDiff` over each rendered DOCUMENT and show two long panes. On a
 * real bundle the Lesson Sequence is forty-odd pages, so a two-word edit in Lesson 4 was
 * unfindable, and the page could not say how much had changed. The fix is to compare at the
 * granularity the generator itself emits — a lesson's Section A–E tables, the sub-strand overview,
 * the differentiation table, and the corresponding areas of the other two documents — so the page
 * can hide untouched areas, count changed ones, and link straight to them.
 *
 * ⚑ SPLIT BEFORE DIFFING, NEVER AFTER. `HtmlDiff` rewrites the markup it annotates: a changed
 * lesson title comes back as `<strong data-seq="…">LESSON 3 … <span data-match-type="create">…`,
 * which no header pattern matches any more. So the pipeline is
 *
 *     cached rendered HTML → split into groups → pair by key → HtmlDiff each changed pair
 *
 * and this module only ever sees the clean, sanitized render. It runs AFTER the sections cache, as
 * a pure per-request transform (the same seam and the same reasoning as `lessonAnchors.ts`), so
 * `HTML_RENDER_CACHE_VERSION` does not move.
 *
 * ⚑ TWO INVARIANTS, both pinned by `compareGroups.spec.ts`:
 *   1. TOTALITY — every top-level node of the document lands in exactly one group. Classification
 *      may degrade to a generic label, but content can never silently disappear from the compare
 *      view. Unrecognized structures therefore FALL BACK rather than throw.
 *   2. UNIQUENESS — keys are unique within a document. This one DOES throw: keys become Map keys
 *      when the two versions are paired, so a duplicate would overwrite a group and lose content
 *      for real. Loud beats subtly wrong.
 *
 * ⚑ PHASE 1 LIMITATION — ORDINAL KEYS CASCADE. Two of the key families are positional rather than
 * identity-bearing, so an INSERTION OR REMOVAL IN THE MIDDLE renumbers everything after it and every
 * later area reads as changed:
 *   - `lesson:N:*` keys off the generator's `lesson.number`. Inserting a lesson between 1 and 2
 *     renumbers the old 2 to 3, so the whole tail of the document compares against its neighbour.
 *   - `fe:section:N` is ordinal because Final Explanation titles are user-authored (and so may
 *     change, or repeat). Same cascade on an inserted section.
 * Accepted deliberately: both are deterministic and neither can lose content, where matching on
 * authored text could pair two genuinely different areas. Appending or removing at the END — the
 * common case — is exact. `compareDiffGroups.spec.ts` pins both the exact and the cascading
 * behaviour so the limitation is visible rather than discovered. The fix, when it is worth it, is a
 * stable per-lesson identity in the stored data, not cleverer text matching.
 *
 * Structure probed against the real generator → mammoth chain on 2026-08-23; `compareGroups.spec.ts`
 * re-probes it so a generator or mammoth bump fails a test instead of quietly degrading labels.
 */
import { window } from './domWindow'
import { escapeHtml } from './escapeHtml'
import {
  FINAL_EXPLANATION_LABEL,
  LESSON_SEQUENCE_LABEL,
  SUMMARY_TABLE_LABEL,
  slugId,
} from './lessonAnchors'
import { plural } from './plural'

export interface LogicalGroup {
  /** Pairing key — stable across versions, unique within its document. */
  key: string
  /** Index/heading label, e.g. `Lesson 3 · Implementation framework`. */
  label: string
  /** Lesson number for lesson areas, else null (used for the "lessons affected" count). */
  lesson: number | null
  /** The group's own slice of the document HTML: whole top-level nodes, in order. */
  html: string
}

/** The generator's lesson banner (`sections.js` sectionA `fullHeader`), on the A table's first row. */
const LESSON_HEADER = /^LESSON\s+(\d+)\b/
/** Section letter prefix — `A. SPECIFIC LEARNING OUTCOMES` etc. The LETTER is the stable part: the
 *  visible wording is upstream's to change, so labels key off the letter, not the phrase. */
const AREA_LETTER = /^([A-E])\.\s/

/** Letter → our label wording (approved 2026-08-23). Deliberately not upstream's ALL-CAPS phrasing. */
const LESSON_AREA_LABELS: Record<string, string> = {
  A: 'Specific learning outcomes',
  B: 'Overview',
  C: 'Implementation framework',
  D: 'Teacher reflection',
  E: 'Summary prompts',
}

/** The first cell's text of a top-level node — the generator's `fullHeader` for a table. */
const headerTextOf = (el: Element): string => (el.querySelector('td,th')?.textContent ?? '').trim()

// `Node.ELEMENT_NODE` / `Node.TEXT_NODE`, without reaching for the DOM class.
const ELEMENT_NODE = 1
const TEXT_NODE = 3

/**
 * Serialize one top-level node back to HTML.
 *
 * ⚑ TEXT NODES ARE WHY THIS EXISTS. The loop below used to walk `body.children`, which is
 * ELEMENTS ONLY, so bare text directly under `<body>` was dropped without trace — TOTALITY was simply
 * false, and the test could not see it because it counted `children` too. Today's mammoth output
 * happens to wrap everything in elements, so no shipped document was affected; but the whole point of
 * totality is to survive generator drift nobody has seen yet.
 */
const serializeNode = (node: ChildNode): string =>
  node.nodeType === ELEMENT_NODE ? (node as Element).outerHTML : escapeHtml(node.textContent ?? '')

/**
 * Widest row in a table, counting CELLS (not colspans). Used ONLY by the Final Explanation, where
 * the header text cannot be trusted:
 *   instructions → 1 (one full-width cell)   section → 2 (prompt + exemplar)   rubric → 4
 * Probed values, pinned by the spec.
 */
const maxCells = (el: Element): number =>
  [...el.querySelectorAll('tr')].reduce((n, tr) => Math.max(n, tr.children.length), 0)

/** Mutable position/context carried across one document's tables. */
interface SplitState {
  /** The lesson whose areas we are inside, for `lesson:N:*` keys. */
  lesson: number | null
  /** True until the first table has been classified — the Final Explanation needs it. */
  isFirstTable: boolean
  /** Counter for the one area family with no stable name of its own (`fe:section:N`). */
  ordinal: number
}

/** A classified area: key and label are BARE, and the document's spec prefixes both. */
interface Classified {
  key: string
  label: string
  lesson?: number | null
}

/**
 * Everything document-specific, in one place per document.
 *
 * ⚑ THE PREFIXES LIVE BESIDE EACH OTHER ON PURPOSE. The key prefix (`fe:`) and the label prefix
 * (`Final explanation · `) are the same fact, and they used to be two ternary chains in separate
 * functions where a mismatch would have been silent. Pairing them also makes "the Lesson Sequence
 * has no prefix" a written fact rather than an else-branch, which is what `groupAnchorId` relies on.
 */
interface DocumentSpec {
  keyPrefix: string
  labelPrefix: string
  classify: (node: Element, state: SplitState) => Classified | null
}

/**
 * ⚑ TEXT OR STRUCTURE — THE RULE IS *WHO OWNS THE HEADER*. Where the header is a generator
 * constant, match the text: it is stable, and it says what the area IS. Where the header is
 * user-authored it cannot be matched at all, so fall back to structure. That is why the Final
 * Explanation is the only document classified on cell counts — its `sections[].title` comes
 * straight from teacher-edited data (`vendor/lib/build_docs.js` buildFinalExplanation).
 */
const DOCUMENT_SPECS: Record<string, DocumentSpec> = {
  // Generator-owned headers throughout, and four genuinely distinct rules — cell counts could not
  // separate these anyway (overview/A/E are all 2 wide, B and D both 1).
  [LESSON_SEQUENCE_LABEL]: {
    keyPrefix: '',
    labelPrefix: '',
    classify: (node, state) => {
      const header = headerTextOf(node)
      const lessonMatch = LESSON_HEADER.exec(header)
      if (lessonMatch) {
        // Section A: its first row is the lesson banner, its second the `A.` header.
        state.lesson = Number(lessonMatch[1])
        return {
          key: `lesson:${state.lesson}:a`,
          label: `Lesson ${state.lesson} · ${LESSON_AREA_LABELS.A}`,
          lesson: state.lesson,
        }
      }
      const areaMatch = AREA_LETTER.exec(header)
      if (areaMatch && state.lesson !== null) {
        const letter = areaMatch[1]!
        return {
          key: `lesson:${state.lesson}:${letter.toLowerCase()}`,
          label: `Lesson ${state.lesson} · ${LESSON_AREA_LABELS[letter]}`,
          lesson: state.lesson,
        }
      }
      if (/^SUB-STRAND OVERVIEW/.test(header))
        return { key: 'overview', label: 'Sub-strand overview' }
      if (/^DIFFERENTIATION/.test(header)) {
        return { key: 'differentiation', label: 'Differentiation and inclusion' }
      }
      return null
    },
  },

  // The one document whose headers are user-authored — see the ⚑ above.
  [FINAL_EXPLANATION_LABEL]: {
    keyPrefix: 'fe:',
    labelPrefix: 'Final explanation · ',
    classify: (node, state) => {
      // Position first: the student-details table is always the document's first table, and its
      // 2-cell rows would otherwise look exactly like an authored section.
      if (state.isFirstTable) return { key: 'details', label: 'Student details' }
      // Then structure, never the header text: an authored section may legitimately be TITLED
      // "RUBRIC" or "INSTRUCTIONS FOR STUDENTS", but it always has 2 cells across.
      const cells = maxCells(node)
      if (cells === 4) return { key: 'rubric', label: 'Rubric' }
      if (cells === 1) return { key: 'instructions', label: 'Instructions' }
      if (cells === 2) {
        const n = (state.ordinal += 1)
        return { key: `section:${n}`, label: `Section ${n}` }
      }
      return null
    },
  },

  // Every Summary Table header is a generator CONSTANT (`build_docs.js` buildSummaryTable), so it
  // is matched on text like the Lesson Sequence. It was briefly classified on cell counts, copying
  // the Final Explanation — which would have let a fourth summary column silently relabel a
  // teacher-visible area, for no benefit, since nothing here is authored.
  [SUMMARY_TABLE_LABEL]: {
    keyPrefix: 'st:',
    labelPrefix: 'Summary table · ',
    classify: (node) => {
      const header = headerTextOf(node)
      if (/^SUMMARY TABLE/.test(header)) return { key: 'header', label: 'Sub-strand details' }
      if (/^INSTRUCTIONS/.test(header)) return { key: 'instructions', label: 'Instructions' }
      if (/^Lesson #/.test(header)) return { key: 'responses', label: 'Lesson responses' }
      return null
    },
  },
}

/** An unknown document label classifies nothing — every table becomes a fallback area, and TOTALITY
 *  still holds. Reachable only if `docxToSections` grows a document this module has not been told
 *  about, which the shared label constants in `lessonAnchors.ts` are there to prevent. */
const UNKNOWN_DOCUMENT: DocumentSpec = { keyPrefix: '', labelPrefix: '', classify: () => null }

/**
 * Split one rendered document into logical groups.
 *
 * Shape relied on (probed): the body is a run of leading `<p>` (the generator's `titleBlock`)
 * followed by top-level `<table>`s, one per logical area — mammoth drops the `SPACE()` spacers and
 * page breaks entirely. Each table opens a new group; any other node attaches to the group in
 * progress, so a future spacer or stray block cannot fall out of the document (totality).
 *
 * @throws if two groups would share a key — see the UNIQUENESS invariant above.
 */
export function splitDocumentGroups(docLabel: string, html: string): LogicalGroup[] {
  if (!html.trim()) return []

  const spec = DOCUMENT_SPECS[docLabel] ?? UNKNOWN_DOCUMENT
  // A detached document per call: the shared window's own `document` is never touched.
  const doc = window.document.implementation.createHTMLDocument('')
  doc.body.innerHTML = html

  const groups: LogicalGroup[] = []
  const seen = new Set<string>()
  const state: SplitState = { lesson: null, isFirstTable: true, ordinal: 0 }
  let fallbacks = 0

  const open = ({ key, label, lesson = null }: Classified, node: ChildNode) => {
    const fullKey = `${spec.keyPrefix}${key}`
    if (seen.has(fullKey)) {
      throw new Error(`compareGroups: duplicate group key "${fullKey}" in "${docLabel}"`)
    }
    seen.add(fullKey)
    groups.push({
      key: fullKey,
      label: `${spec.labelPrefix}${label}`,
      lesson,
      html: serializeNode(node),
    })
  }

  for (const node of [...doc.body.childNodes]) {
    const isTable = node.nodeType === ELEMENT_NODE && (node as Element).tagName === 'TABLE'

    // Anything that is not a top-level table belongs to the group in progress — or, before the
    // first table, to the document heading (the `titleBlock` title + subtitle paragraphs).
    if (!isTable) {
      // Whitespace between blocks is the one thing safe to drop: it carries no content, and keeping
      // it would open a heading group for the gap before the first table.
      if (node.nodeType === TEXT_NODE && (node.textContent ?? '').trim() === '') continue
      const current = groups[groups.length - 1]
      if (current) current.html += serializeNode(node)
      // The `titleBlock` group is kept separate from the details table below it so a title-only
      // edit is not mislabelled as an overview or details change.
      else open({ key: 'heading', label: spec.labelPrefix ? 'Heading' : 'Document heading' }, node)
      continue
    }

    const classified = spec.classify(node as Element, state)
    state.isFirstTable = false
    // Unclassified: keep the content with a generic label rather than lose it (totality). The spec
    // asserts the expected classification, so drift fails CI rather than reaching a teacher.
    open(classified ?? { key: `area:${(fallbacks += 1)}`, label: `Area ${fallbacks}` }, node)
  }

  return groups
}

/**
 * Stable element id for a group, for the change index's in-page links.
 *
 * ⚑ THE DOCUMENT IS PART OF THE ID ON PURPOSE. `splitDocumentGroups` only guarantees keys are
 * unique WITHIN a document, so the id does not rely on the `DOCUMENT_SPECS` prefixes happening to
 * differ. A duplicate element id would send two index links to the same row.
 */
export const groupAnchorId = (doc: string, key: string): string =>
  `cmp-${slugId(doc)}-${slugId(key)}`

/**
 * The compare page's one-line summary of what changed. Pure so it can be tested without rendering
 * the server component.
 *
 * ⚑ "· N lessons affected", not "in N lessons". Changed areas are not all lesson areas — the Final
 * Explanation's rubric belongs to no lesson — so "2 changed areas in 1 lesson" claimed both changes
 * sat inside that lesson. The separator states two independent counts instead of implying
 * containment. Returns '' when nothing changed; the page shows its own "identical" message there.
 */
export function changeSummary(
  groups: readonly { changed: boolean; lesson: number | null }[],
): string {
  const changed = groups.filter((g) => g.changed)
  if (changed.length === 0) return ''
  const lessons = new Set(changed.map((g) => g.lesson).filter((n): n is number => n !== null)).size
  return (
    plural(changed.length, 'changed area') +
    (lessons > 0 ? ` · ${plural(lessons, 'lesson')} affected` : '')
  )
}

/**
 * Merge the two versions' key sequences into one document order: "to" order wins, and a key only
 * the "from" version has (a removed area) keeps its position relative to the keys around it rather
 * than being appended at the end.
 *
 * Each removed key is bucketed against the surviving key it preceded, so every key is emitted
 * exactly once by construction — the UNIQUENESS invariant guarantees no key repeats within a side.
 * The check at the end is therefore an assertion rather than a mechanism, kept because this is the
 * one function whose failure mode would be losing a whole area silently.
 */
export function mergeGroupKeys(fromKeys: readonly string[], toKeys: readonly string[]): string[] {
  const surviving = new Set(toKeys)
  /** Removed keys, held against the surviving key they came before. */
  const removedBefore = new Map<string, string[]>()
  let pending: string[] = []

  for (const key of fromKeys) {
    if (!surviving.has(key)) pending.push(key)
    else if (pending.length > 0) {
      removedBefore.set(key, pending)
      pending = []
    }
  }
  // Anything still pending was removed from the tail, so it belongs at the end.
  const merged = [...toKeys.flatMap((k) => [...(removedBefore.get(k) ?? []), k]), ...pending]

  // ⚑ DISTINCT count, not just length. `merged.length === expected.size` plus a membership test
  // passes when one key is duplicated AND another lost — which is precisely the failure this
  // assertion exists to catch, so length alone made it decorative.
  const expected = new Set([...fromKeys, ...toKeys])
  const distinct = new Set(merged)
  if (
    merged.length !== expected.size ||
    distinct.size !== expected.size ||
    merged.some((k) => !expected.has(k))
  ) {
    throw new Error(
      `compareGroups: key merge lost or duplicated a group ` +
        `(${merged.length} keys, ${distinct.size} distinct, expected ${expected.size})`,
    )
  }
  return merged
}
