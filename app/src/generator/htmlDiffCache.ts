/**
 * Cached side-by-side diffs between two immutable versions' rendered document HTML (the compare
 * page). Same reasoning and idiom as htmlSectionsCache.ts one layer down: both inputs are the
 * cached, immutable per-version sections, so the diff output for a `(from, to)` pair never changes
 * — yet HtmlDiff is synchronous CPU that is effectively quadratic over the changed region of the
 * full Lesson Sequence HTML, exactly the burst profile the sections cache was built to keep off the
 * Rock's 2-CPU box. Cache the diff JSON in the same artifact store (LRU-evicted, a few KB per
 * pair), coalesce concurrent misses, and every repeat view — including bouncing between picker
 * selections — becomes a disk read.
 *
 * Invalidation rides {@link HTML_RENDER_CACHE_VERSION}: the diff derives from the rendered HTML, so
 * the render-version bump that invalidates sections invalidates diffs too.
 */
import type { Payload } from 'payload'

// Payload's own diff engine — a pure vendored html-diff class, public `./elements/*` export.
// Output contract (data-match-type annotations) pinned by tests/unit/htmlDiffContract.spec.ts.
import { HtmlDiff } from '@payloadcms/ui/elements/HTMLDiff/diff'

import { getArtifact, putArtifact } from './artifactCache'
import { HTML_RENDER_CACHE_VERSION, renderVersionSectionsCached } from './htmlSectionsCache'

export interface CompareDiffSection {
  label: string
  /** The "from" pane: original HTML with removals annotated `data-match-type="delete"`. */
  oldHtml: string
  /** The "to" pane: new HTML with additions annotated `data-match-type="create"`. */
  newHtml: string
}

const keyFor = (fromId: number | string, toId: number | string): string =>
  `html-diff::v${HTML_RENDER_CACHE_VERSION}::from:${fromId}::to:${toId}`

/** Single-flight coalescing, same as htmlSectionsCache: one in-flight compute per pair. */
const inFlight = new Map<string, Promise<CompareDiffSection[]>>()

/**
 * Section-by-section diff of two versions' rendered documents, cached by the (from, to) pair.
 * Sections pair by label, "to" order first (the newer document), then any section only the "from"
 * version has; a side missing a section diffs against empty (fully added / fully removed).
 *
 * NOT an authorization boundary: `renderVersionSectionsCached` reads via overrideAccess — the
 * caller MUST have already proven the requester's READ access to BOTH versions (the compare page's
 * access-gated version list does).
 */
export async function diffVersionSectionsCached(
  payload: Payload,
  fromId: number | string,
  toId: number | string,
): Promise<CompareDiffSection[]> {
  const key = keyFor(fromId, toId)

  const cached = await getArtifact(key).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached.toString('utf8')) as CompareDiffSection[]
    } catch {
      // Corrupt entry → treat as a miss and rewrite below.
    }
  }

  const existing = inFlight.get(key)
  if (existing) return existing

  const compute = (async (): Promise<CompareDiffSection[]> => {
    const [fromSections, toSections] = await Promise.all([
      renderVersionSectionsCached(payload, fromId),
      renderVersionSectionsCached(payload, toId),
    ])
    const fromByLabel = new Map(fromSections.map((s) => [s.label, s.html]))
    const toByLabel = new Map(toSections.map((s) => [s.label, s.html]))
    const labels = [
      ...toByLabel.keys(),
      ...[...fromByLabel.keys()].filter((l) => !toByLabel.has(l)),
    ]
    const diffs = labels.map((label) => {
      const [oldHtml, newHtml] = new HtmlDiff(
        fromByLabel.get(label) ?? '',
        toByLabel.get(label) ?? '',
      ).getSideBySideContents()
      return { label, oldHtml, newHtml }
    })
    await putArtifact(key, Buffer.from(JSON.stringify(diffs))).catch(() => {})
    return diffs
  })()
  inFlight.set(key, compute)
  try {
    return await compute
  } finally {
    inFlight.delete(key)
  }
}
