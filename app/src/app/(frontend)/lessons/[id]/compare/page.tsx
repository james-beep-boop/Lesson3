import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
// Payload's own version-compare ENGINE (a pure vendored html-diff class, public `./elements/*`
// export — verified in the installed 3.85.1 source). Payload's compare VIEW itself only works on
// its native versions system, which this project deliberately does not use (versions are first-class
// `lesson-bundle-versions` documents), so we reuse the engine on our own rendered document HTML.
// Output contract (`data-match-type="create"|"delete"` annotations) is pinned by
// tests/unit/htmlDiffContract.spec.ts so a Payload bump that changes it fails fast.
import { HtmlDiff } from '@payloadcms/ui/elements/HTMLDiff/diff'

import { requireUser } from '@/lib/session'
import { findReadablePlan } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { lessonDisplayName } from '@/lib/substrand'
import { renderVersionSectionsCached } from '@/generator/htmlSectionsCache'
import { type PreviewSection } from '@/generator/previewBundle'
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

  // Access-gated version list (same shape as the lesson page — it doubles as the READ proof for the
  // cached render below). Oldest → newest.
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: plan.id } },
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
    sort: 'createdAt',
    select: { semver: true, title: true, meta: { substrand_name: true } },
  })
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

  let fromSections: PreviewSection[] = []
  let toSections: PreviewSection[] = []
  let viewError: string | null = null
  try {
    ;[fromSections, toSections] = await Promise.all([
      renderVersionSectionsCached(payload, from.id),
      renderVersionSectionsCached(payload, to.id),
    ])
  } catch (e) {
    payload.logger.error(
      { err: e, fromId: from.id, toId: to.id, userId: user?.id },
      'lesson compare render failed',
    )
    viewError = 'Could not render this comparison.'
  }

  // Section-by-section diff over the label union ("to" order first — it's the newer document —
  // then any section only the "from" version has). A section missing on one side diffs against
  // empty, i.e. shows as fully added / fully removed.
  const labels = [
    ...toSections.map((s) => s.label),
    ...fromSections.filter((s) => !toSections.some((t) => t.label === s.label)).map((s) => s.label),
  ]
  const diffs = labels.map((sectionLabel) => {
    const fromHtml = fromSections.find((s) => s.label === sectionLabel)?.html ?? ''
    const toHtml = toSections.find((s) => s.label === sectionLabel)?.html ?? ''
    const [oldHtml, newHtml] = new HtmlDiff(fromHtml, toHtml).getSideBySideContents()
    return { label: sectionLabel, oldHtml, newHtml }
  })

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
