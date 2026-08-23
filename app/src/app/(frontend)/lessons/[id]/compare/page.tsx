import React from 'react'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { findReadablePlan, findReadableVersions } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { lessonDisplayName } from '@/lib/substrand'
import { docSectionId } from '@/lib/lessonAnchors'
import { changeSummary, groupAnchorId } from '@/lib/compareGroups'
// Payload's compare VIEW only works on its native versions system (ours are first-class documents),
// so the cache diffs with its exported ENGINE instead — see htmlDiffCache.ts for the full story.
import { diffVersionGroupsCached, type CompareGroup } from '@/generator/htmlDiffCache'
import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import ComparePickers from './ComparePickers'
import CompareFilter from './CompareFilter'

/**
 * Version compare (decided 2026-07-05; regrouped 2026-08-23) — two versions of one plan, diffed
 * AREA BY AREA rather than document by document. Each of the generator's logical areas (a lesson's
 * Section A–E tables, the sub-strand overview, the differentiation table, and the corresponding
 * areas of the other two documents) renders as one row: removals red on the left ("from"),
 * additions green on the right ("to").
 *
 * WHY ROWS AND NOT TWO LONG PANES: HtmlDiff's annotations are asymmetric — a deletion is marked
 * only in the old pane — so two independently-rendered panes drift out of alignment on perfectly
 * ordinary editing and read as replacements that never happened. Pairing each area and rendering it
 * as one row makes alignment structural, gives every area an anchor for the change index, and lets
 * the default "changes only" view hide untouched areas without hiding half of a changed one.
 *
 * The diff runs on the same cached, sanitized content HTML the lesson page shows (immutable per
 * version), so it compares what teachers actually read, and the READ gate is the same access-gated
 * version list as the lesson page. HtmlDiff only re-wraps that already-sanitized HTML with its own
 * annotation spans, so the output stays safe to inject.
 */
/**
 * One side of one area. `html: null` means the area is absent from THIS version — a whole lesson
 * added or removed — which the model states (`presence`) rather than the page inferring it from an
 * empty string. Saying so beats an unexplained blank half-row that reads as a rendering fault.
 */
function ComparePane({ title, html }: { title: string; html: string | null }) {
  return (
    <div className="compare-pane">
      <h4 className="compare-pane__title">{title}</h4>
      {html === null ? (
        <p className="compare-pane__absent">Not present in this version</p>
      ) : (
        <div className="doc-preview compare-diff" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}

/** The two panes' content for one area — the only place the `CompareGroup` union is unpacked. */
function panesOf(g: CompareGroup): { old: string | null; new: string | null } {
  if (!g.changed) return { old: g.html, new: g.html }
  return {
    old: g.presence === 'to-only' ? null : g.oldHtml,
    new: g.presence === 'from-only' ? null : g.newHtml,
  }
}

export default async function CompareView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const { payload, user } = await requireUser()

  const plan = await findReadablePlan(payload, { id, user })
  if (!plan) notFound()

  // The shared access-gated version list (lib/readBundle) — it doubles as the READ proof for the
  // cached render below. Oldest → newest.
  const versions = await findReadableVersions(payload, { planId: plan.id, user })
  if (versions.length < 2) notFound() // nothing to compare

  const officialId = relId(plan.officialVersion)
  const byId = (raw?: string) => {
    const n = raw ? Number(raw) : NaN
    return versions.find((v) => v.id === n)
  }
  // Defaults: oldest → Official (or newest when the oldest IS the Official). An id that isn't one
  // of this plan's versions falls back to the default rather than 404ing.
  const fallbackTo =
    officialId != null && officialId !== versions[0].id
      ? versions.find((v) => v.id === officialId)
      : undefined
  const from = byId(sp.from) ?? versions[0]
  const to = byId(sp.to) ?? fallbackTo ?? versions[versions.length - 1]

  const title = lessonDisplayName(versions[0].meta?.substrand_name, plan.title)
  const label = (v: (typeof versions)[number]) =>
    `${v.semver ?? `v${v.id}`}${v.id === officialId ? ' · Official' : ''}`

  // Cached per-pair diff (immutable inputs → immutable output; see htmlDiffCache.ts). The
  // access-gated `versions` list above proves READ on both ids, so the cache's overrideAccess
  // renders underneath are authorized.
  let groups: CompareGroup[] = []
  let viewError: string | null = null
  try {
    groups = await diffVersionGroupsCached(payload, from.id, to.id)
  } catch (e) {
    payload.logger.error(
      { err: e, fromId: from.id, toId: to.id, userId: user?.id },
      'lesson compare render failed',
    )
    viewError = 'Could not render this comparison.'
  }

  const changed = groups.filter((g) => g.changed)
  const summary = changeSummary(groups)
  // Group once, in document order, rather than deriving the document list and then re-filtering
  // `groups` for each of them.
  const byDoc = new Map<string, CompareGroup[]>()
  for (const g of groups) {
    const inDoc = byDoc.get(g.doc)
    if (inDoc) inDoc.push(g)
    else byDoc.set(g.doc, [g])
  }

  /**
   * The documents and their area rows. Server-rendered and handed to `CompareFilter` as CHILDREN,
   * never as props: this is the longest page in the app, and serializing every area's HTML into a
   * client component's props would double the payload and hydrate all of it for one toggle.
   */
  const body = (
    <>
      {[...byDoc].map(([doc, inDoc]) => (
        <section
          key={doc}
          id={docSectionId(doc)}
          className="doc-section"
          data-changed={inDoc.some((g) => g.changed) ? 'true' : 'false'}
        >
          <h2 className="doc-section-title">{doc}</h2>
          {inDoc.map((g) => {
            const panes = panesOf(g)
            return (
              <section
                key={g.key}
                id={groupAnchorId(g.doc, g.key)}
                className="compare-group"
                data-changed={g.changed ? 'true' : 'false'}
                tabIndex={-1}
              >
                <h3 className="compare-group__title">
                  {g.label}
                  {g.changed && g.structureOnly && (
                    // Not "paragraph structure": `structureOnly` also covers whitespace-only edits.
                    <span className="compare-group__note">
                      Spacing or document structure changed
                    </span>
                  )}
                </h3>
                <div className="compare-grid">
                  <ComparePane title={label(from)} html={panes.old} />
                  <ComparePane title={label(to)} html={panes.new} />
                </div>
              </section>
            )
          })}
        </section>
      ))}
    </>
  )

  return (
    <article className="lesson lesson--compare">
      <PageHeader
        title={`Compare: ${title}`}
        actions={<PageBackLink href={`/lessons/${plan.id}`} label="Back to lesson" />}
      />
      <ComparePickers
        planId={plan.id}
        options={versions.map((v) => ({ id: v.id, label: label(v) }))}
        fromId={from.id}
        toId={to.id}
      />

      {viewError ? (
        <p className="muted">{viewError}</p>
      ) : changed.length === 0 ? (
        // No filter and no toggle: there is nothing to filter to, and a "changes only" control that
        // emptied the page would be a worse answer than saying so.
        <>
          <p className="compare-summary">These two versions render identical documents.</p>
          {body}
        </>
      ) : (
        <>
          <p className="compare-summary">{summary}</p>
          <nav className="compare-index" aria-label="Changed areas">
            <ol>
              {changed.map((g) => (
                // Qualified by document: this list spans ALL documents, and `key` is only unique
                // within one — the same reason `groupAnchorId` takes the document.
                <li key={`${g.doc}:${g.key}`}>
                  <a href={`#${groupAnchorId(g.doc, g.key)}`}>{g.label}</a>
                </li>
              ))}
            </ol>
          </nav>
          <CompareFilter>{body}</CompareFilter>
        </>
      )}
    </article>
  )
}
