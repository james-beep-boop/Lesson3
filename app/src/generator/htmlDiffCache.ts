/**
 * Cached per-AREA diffs between two immutable versions' rendered documents (the compare page).
 * Same reasoning and idiom as htmlSectionsCache.ts one layer down: both inputs are the cached,
 * immutable per-version sections, so the diff output for a `(from, to)` pair never changes — yet
 * HtmlDiff is synchronous CPU that is effectively quadratic over the changed region, exactly the
 * burst profile the sections cache was built to keep off the Rock's 2-CPU box. Cache the diff JSON
 * in the same artifact store (LRU-evicted), coalesce concurrent misses, and every repeat view —
 * including bouncing between picker selections — becomes a disk read.
 *
 * SIZE: hundreds of KB per pair, not "a few KB" as this comment once claimed — the entry holds both
 * versions' HTML, and HtmlDiff's side-by-side output is itself around twice its input. Since pairs
 * grow as the square of a plan's version count against a fixed LRU budget, an UNCHANGED area stores
 * its HTML ONCE (`{ changed: false, html }`) rather than twice under `oldHtml`/`newHtml`; as most
 * areas are untouched between two versions, that is roughly half the entry.
 *
 * ⚑ AREAS, NOT DOCUMENTS (2026-08-23). This used to diff each whole rendered document and hand the
 * page two long panes. It now splits both versions into the generator's own logical areas first
 * (`lib/compareGroups.ts`), pairs them by key, and diffs each pair. Three consequences, all of them
 * the point:
 *
 *   1. The page can hide untouched areas, count changed ones, and link straight to them.
 *   2. Alignment becomes structural. HtmlDiff's annotations are ASYMMETRIC — a deletion is marked
 *      only in the old pane, an insertion only in the new — so filtering the two panes
 *      independently would slide unrelated content side by side and read as a replacement that
 *      never happened. Pairing by key and rendering each pair as one row cannot do that.
 *   3. It is cheaper, not dearer: most areas are byte-identical between two versions, and those
 *      skip HtmlDiff entirely. Only genuinely changed areas are diffed, each one small.
 *
 * ⚑ `changed` COMES FROM THE SOURCE HTML (`from !== to`), NOT from counting annotations. HtmlDiff
 * can rewrite a paragraph boundary without emitting a single `data-match-type`, so annotation
 * counting would report two demonstrably different versions as identical. Where a changed area
 * produces no annotations, `structureOnly` says so and the page labels it rather than showing an
 * apparently-unchanged pair.
 *
 * INVALIDATION rides two independent numbers: {@link HTML_RENDER_CACHE_VERSION} (the diff derives
 * from the rendered HTML, so a render bump invalidates diffs too) and
 * {@link COMPARE_DIFF_FORMAT_VERSION} (this module's own algorithm and JSON shape, which move
 * without the render moving). Both are in the key, and the decoder rejects the old shape besides.
 */
import type { Payload } from 'payload'

// Payload's own diff engine — a pure vendored html-diff class, public `./elements/*` export.
// Output contract (data-match-type annotations) pinned by tests/unit/htmlDiffContract.spec.ts.
import { HtmlDiff } from '@payloadcms/ui/elements/HTMLDiff/diff'

import { mergeGroupKeys, splitDocumentGroups } from '../lib/compareGroups'
import { bestEffortArtifact, getArtifact, putArtifact } from './artifactCache'
import { HTML_RENDER_CACHE_VERSION, renderVersionSectionsCached } from './htmlSectionsCache'
import { decodeCachedJson, isStringRecord } from './cacheCodecs'

/**
 * The compare-diff algorithm/shape version, INDEPENDENT of the render version: this module's
 * grouping and pairing can change while the rendered HTML it consumes stays byte-identical. Bump it
 * in the same commit as any change to the group keys, the pairing, or `CompareGroup`.
 *   1 — whole-document side-by-side panes (2026-07-05)
 *   2 — per-area logical groups (2026-08-23)
 *   3 — unchanged areas store one `html`; `presence` replaces inferring absence from an empty pane
 */
export const COMPARE_DIFF_FORMAT_VERSION = 3

interface CompareGroupIdentity {
  /** Pairing key, unique within its document (`lesson:3:c`, `fe:rubric`). */
  key: string
  /** Rendered-document label this area belongs to ("Lesson Sequence"). */
  doc: string
  /** Index/heading label ("Lesson 3 · Implementation framework"). */
  label: string
  /** Lesson number for lesson areas, else null. */
  lesson: number | null
}

/**
 * One area, paired across the two versions.
 *
 * ⚑ A UNION, NOT A FLAG PLUS SIX FIELDS. An unchanged area has exactly one HTML string to show
 * (both panes are identical, and nothing is annotated), so it carries one; a changed area is the
 * only case that has a diffed pair, a `presence`, and a `structureOnly` verdict at all. Modelling
 * it flat meant `newHtml === ''` had two possible meanings — "identical to oldHtml" or "absent from
 * this version" — which the page then had to guess between.
 */
export type CompareGroup = CompareGroupIdentity &
  (
    | {
        changed: false
        /** Both panes. Stored once: the two versions' HTML for this area is byte-identical. */
        html: string
      }
    | {
        changed: true
        /**
         * Which versions contain this area at all — a whole lesson added or removed. Stated here
         * rather than inferred downstream from an empty pane, which conflates "not present in this
         * version" with "present but empty".
         */
        presence: 'both' | 'from-only' | 'to-only'
        /** Changed, but HtmlDiff found nothing to annotate — a spacing or structure-only edit. */
        structureOnly: boolean
        /** The "from" pane: original HTML with removals annotated `data-match-type="delete"`. */
        oldHtml: string
        /** The "to" pane: new HTML with additions annotated `data-match-type="create"`. */
        newHtml: string
      }
  )

const keyFor = (fromId: number | string, toId: number | string): string =>
  `html-diff::v${HTML_RENDER_CACHE_VERSION}::f${COMPARE_DIFF_FORMAT_VERSION}::from:${fromId}::to:${toId}`

/** Single-flight coalescing, same as htmlSectionsCache: one in-flight compute per pair. */
const inFlight = new Map<string, Promise<CompareGroup[]>>()

/**
 * Strict on the fields the current format adds. The format version already keeps older entries
 * unreachable; this is the second line, so a hand-written or half-migrated artifact cannot be
 * mistaken for a group list (a format-1 entry passes the string checks and would otherwise arrive
 * with `changed === undefined`, i.e. every area silently "unchanged").
 */
const isCompareGroups = (value: unknown): value is CompareGroup[] =>
  Array.isArray(value) &&
  value.every((group) => {
    if (!isStringRecord(group, ['key', 'doc', 'label'])) return false
    const g = group as Record<string, unknown>
    if (!(g.lesson === null || typeof g.lesson === 'number')) return false
    // Each arm is checked on its own, so a half-migrated entry cannot satisfy the union by
    // borrowing fields from both.
    if (g.changed === false) return typeof g.html === 'string'
    return (
      g.changed === true &&
      typeof g.structureOnly === 'boolean' &&
      (g.presence === 'both' || g.presence === 'from-only' || g.presence === 'to-only') &&
      isStringRecord(g, ['oldHtml', 'newHtml'])
    )
  })

/**
 * Area-by-area diff of two versions' rendered documents, cached by the (from, to) pair.
 *
 * Documents pair by label, "to" order first (the newer bundle), then any document only the "from"
 * version has; a side missing a document diffs against empty (fully added / fully removed). Areas
 * within a document pair by key, merged into one document order so a removed area keeps its place.
 *
 * NOT an authorization boundary: `renderVersionSectionsCached` reads via overrideAccess — the
 * caller MUST have already proven the requester's READ access to BOTH versions (the compare page's
 * access-gated version list does).
 */
export async function diffVersionGroupsCached(
  payload: Payload,
  fromId: number | string,
  toId: number | string,
): Promise<CompareGroup[]> {
  const key = keyFor(fromId, toId)

  const cached = await bestEffortArtifact(payload.logger, 'read', () => getArtifact(key), null)
  if (cached) {
    const groups = decodeCachedJson(cached, isCompareGroups)
    if (groups) return groups
    // Syntactically or structurally corrupt entry → treat as a miss and rewrite below.
  }

  const existing = inFlight.get(key)
  if (existing) return existing

  const compute = (async (): Promise<CompareGroup[]> => {
    const [fromSections, toSections] = await Promise.all([
      renderVersionSectionsCached(payload, fromId),
      renderVersionSectionsCached(payload, toId),
    ])
    const fromByLabel = new Map(fromSections.map((s) => [s.label, s.html]))
    const toByLabel = new Map(toSections.map((s) => [s.label, s.html]))
    const docLabels = [
      ...toByLabel.keys(),
      ...[...fromByLabel.keys()].filter((l) => !toByLabel.has(l)),
    ]

    const groups: CompareGroup[] = []
    for (const doc of docLabels) {
      const fromGroups = splitDocumentGroups(doc, fromByLabel.get(doc) ?? '')
      const toGroups = splitDocumentGroups(doc, toByLabel.get(doc) ?? '')
      const fromByKey = new Map(fromGroups.map((g) => [g.key, g]))
      const toByKey = new Map(toGroups.map((g) => [g.key, g]))

      for (const groupKey of mergeGroupKeys(
        fromGroups.map((g) => g.key),
        toGroups.map((g) => g.key),
      )) {
        const from = fromByKey.get(groupKey)
        const to = toByKey.get(groupKey)
        const named = to ?? from!
        const identity: CompareGroupIdentity = {
          key: groupKey,
          doc,
          label: named.label,
          lesson: named.lesson,
        }
        const fromHtml = from?.html ?? ''
        const toHtml = to?.html ?? ''

        // Identical source HTML → nothing to diff, and nothing HtmlDiff could annotate. Skipping
        // is what keeps a 40-page compare cheap: most areas are untouched between two versions.
        //
        // ⚑ `from && to` IS PART OF THE CONDITION, not redundant with the string compare. This
        // module's rule is that presence is stated, never inferred from empty HTML — and comparing
        // `fromHtml === toHtml` alone infers it, because a side that is ABSENT and a side that is
        // EMPTY both read as `''`. The splitter cannot currently emit an empty group (a group owns
        // at least one node), so the collision is unreachable today; the guard costs nothing and
        // means the fast path obeys the rule rather than depending on that fact holding.
        if (from && to && fromHtml === toHtml) {
          groups.push({ ...identity, changed: false, html: fromHtml })
          continue
        }

        const [oldHtml, newHtml] = new HtmlDiff(fromHtml, toHtml).getSideBySideContents()
        groups.push({
          ...identity,
          changed: true,
          presence: from ? (to ? 'both' : 'from-only') : 'to-only',
          // Changed source but no annotations: a spacing or structural edit (a paragraph boundary
          // moving) the engine cannot express inline. The page must still show it as changed.
          structureOnly:
            !oldHtml.includes('data-match-type') && !newHtml.includes('data-match-type'),
          oldHtml,
          newHtml,
        })
      }
    }

    await bestEffortArtifact(
      payload.logger,
      'write',
      () => putArtifact(key, Buffer.from(JSON.stringify(groups))),
      undefined,
    )
    return groups
  })()
  inFlight.set(key, compute)
  try {
    return await compute
  } finally {
    inFlight.delete(key)
  }
}
