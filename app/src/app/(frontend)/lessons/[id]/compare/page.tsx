import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { findReadablePlan, findReadableVersions } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { lessonDisplayName } from '@/lib/substrand'
// Payload's compare VIEW only works on its native versions system (ours are first-class documents),
// so the cache diffs with its exported ENGINE instead — see htmlDiffCache.ts for the full story.
import { diffVersionSectionsCached, type CompareDiffSection } from '@/generator/htmlDiffCache'
import ComparePickers from './ComparePickers'

/**
 * Version compare (decided 2026-07-05): two side-by-side panes diffing the RENDERED DOCUMENT of two
 * versions of one plan — removals red on the left ("from"), additions green on the right ("to").
 * The diff runs on the same cached, sanitized content HTML the lesson page shows (immutable per
 * version), so it compares what teachers actually read, and the READ gate is the same access-gated
 * version list as the lesson page. HtmlDiff only re-wraps that already-sanitized HTML with its own
 * annotation spans, so the output stays safe to inject.
 */
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
  let diffs: CompareDiffSection[] = []
  let viewError: string | null = null
  try {
    diffs = await diffVersionSectionsCached(payload, from.id, to.id)
  } catch (e) {
    payload.logger.error(
      { err: e, fromId: from.id, toId: to.id, userId: user?.id },
      'lesson compare render failed',
    )
    viewError = 'Could not render this comparison.'
  }

  return (
    <article className="lesson lesson--compare">
      <Link href={`/lessons/${plan.id}`} className="back-link">
        ← Back to lesson
      </Link>
      <h1>Compare: {title}</h1>
      <ComparePickers
        planId={plan.id}
        options={versions.map((v) => ({ id: v.id, label: label(v) }))}
        fromId={from.id}
        toId={to.id}
      />

      {viewError ? (
        <p className="muted">{viewError}</p>
      ) : (
        diffs.map((d) => (
          <section key={d.label} className="doc-section">
            <h2 className="doc-section-title">{d.label}</h2>
            <div className="compare-grid">
              <div className="compare-pane">
                <h3 className="compare-pane__title">{label(from)}</h3>
                <div
                  className="doc-preview compare-diff"
                  dangerouslySetInnerHTML={{ __html: d.oldHtml }}
                />
              </div>
              <div className="compare-pane">
                <h3 className="compare-pane__title">{label(to)}</h3>
                <div
                  className="doc-preview compare-diff"
                  dangerouslySetInnerHTML={{ __html: d.newHtml }}
                />
              </div>
            </div>
          </section>
        ))
      )}
    </article>
  )
}
