import React from 'react'

import { requireUser } from '@/lib/session'
import { startRenderTimings } from '@/lib/renderTimings'
import { relId, distinctIds } from '@/lib/relId'
import { versionDeliverables } from '@/generator/adapter'
import { isEditorFor } from '@/access'
import type { User } from '@/payload-types'
import LibraryBrowser from './LibraryBrowser'
import { lessonDisplayName, type LessonRow } from '@/lib/substrand'
import { versionCountsByPlan } from '@/lib/versionCounts'

/**
 * Lesson Plans — the one browse page shared by all roles (SPEC §13). Strand-first: subject-grade
 * → strand → sub-strands, in curriculum order (by `meta.substrand_id`, numerically). Pure server
 * component. Official-version model: list each Lesson Plan via its Official version (the snapshot
 * carrying meta/unit/lessons); the row links to the plan, which opens its Official version.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string; grade?: string }>
}) {
  // No-op unless RENDER_TIMINGS=1 (see lib/renderTimings.ts) — this render is the open perf question
  // after the 2026-08-03 double-render fix, and it must be measured before anything is denormalised.
  const t = startRenderTimings('/')
  const { payload, user } = await t.time('auth', () => requireUser())
  const params = await searchParams
  const q = (params.q ?? '').trim()
  const subject = (params.subject ?? '').trim()
  const grade = (params.grade ?? '').trim()

  // 1. Access-gated plans (every authenticated user reads all plans). We only need each plan's id +
  //    its Official version pointer; the listable content lives on that version.
  //    `pagination: false` returns the WHOLE corpus, not a silently-truncated first page — this is a
  //    grouped curriculum catalogue (subject-grade → strand → sub-strand), so paginating would fragment
  //    strands across pages; completeness + search is the right discoverability model here. The
  //    projection is light (ids + small meta), so all-of-hundreds is cheap; revisit (lazy-load /
  //    virtualize) only if the corpus reaches thousands. (Backlog #8.)
  // The favorites fetch (§10, per-version) is the caller's own handful of rows (own-rows-only by
  // access, no filter needed) and independent of the plans fetch — one parallel round-trip. Rows
  // key their star to the plan's OFFICIAL version (the version the row opens), so a favorite on a
  // non-Official version (saved from the lesson page) simply never matches a row's lookup here —
  // deliberately not surfaced yet; the versions-panel redesign PR ② adds the any-version indicator.
  // The third fetch is a DB-side GROUP BY for the per-plan version COUNT behind the
  // `[N versions ▾]` chip. Returning one aggregate row per plan avoids transferring one stub per
  // version as history grows.
  // Timed individually, with no wrapper around the `Promise.all`: these start together, so the
  // barrier the render waits on is just the largest of the three — derivable, not worth an indent.
  const [{ docs: plans }, { docs: favorites }, versionCountByPlan] = await Promise.all([
    t.time('plans', () =>
      payload.find({
        collection: 'lesson-plans',
        overrideAccess: false,
        user,
        depth: 0,
        pagination: false,
        select: { officialVersion: true },
      }),
    ),
    t.time('favorites', () =>
      payload.find({
        collection: 'favorites',
        overrideAccess: false,
        user,
        depth: 0,
        pagination: false,
        select: { version: true },
      }),
    ),
    t.time('versionCounts', () => versionCountsByPlan(payload)),
  ])
  const officialIds = distinctIds(plans.map((p) => relId(p.officialVersion)))

  // version id → the caller's favorite row id (drives the star's filled state + DELETE target).
  const favByVersion = new Map<number, number>()
  for (const f of favorites) {
    const versionId = relId(f.version)
    if (versionId != null) favByVersion.set(versionId, f.id)
  }

  // PR ②: "My favorites" is a list of VERSIONS. A favorite on a non-Official version (an editor's
  // pin — teachers' stars follow the Official by T4) has no catalogue row, so it is resolved into a
  // pseudo row below: same display shape, suffixed `· vX (pinned)`, linking straight to `?version=`.
  // This closes PR ①'s documented gap (pinned favorites were invisible here).
  const officialIdSet = new Set(officialIds)
  const pinnedIds = [...favByVersion.keys()].filter((vid) => !officialIdSet.has(vid))

  // 2. The two version reads, at `depth: 0` and CONCURRENT.
  //
  //    ⚑ These were `depth: 2`, which is what made this page slow: `select` does not constrain
  //    POPULATED documents (those are projected by `defaultPopulate`, which no collection here sets),
  //    so depth 2 walked `lessonPlan → officialVersion` and pulled whole lesson bundles back. Depth was
  //    buying exactly ONE thing: `subject.name`, two hops out — hence step 3. Everything else the rows
  //    display lives on the version document itself and is depth-independent, and `lessonPlan` is only
  //    ever read through `relId`. Numbers and the full argument: DECISIONS 2026-08-04 (late).
  //
  //    `pinnedIds` needs only step 1's results, so the pinned read no longer waits on the Official one.
  //    ONE select for both, `semver` included: two shapes would give the two result sets two different
  //    doc types, and `buildRow` would typecheck for pinned rows only by structural coincidence.
  //    (`as const` is load-bearing — a widened `boolean` fails Payload's `SelectIncludeType` constraint
  //    and silently flips the projection to its exclude branch.)
  const versionSelect = {
    title: true,
    semver: true,
    subjectGrade: true,
    lessonPlan: true,
    meta: { substrand_id: true, substrand_name: true },
    unit: { strand: true },
    lessons: { id: true }, // count via length — no lesson bodies
    // ⚑ The two OPTIONAL deliverable groups, pulled WHOLE to derive two booleans per row via
    // `versionDeliverables` — and now the single largest cost in this query. Removing them measures
    // `officialVersions` 518–548ms → 281–291ms and the render 608–651ms → 378–384ms: ~240ms, ~38% of
    // what is left. An earlier comment here claimed "measured at zero"; that was measured against the
    // 4.0–4.8s depth-2 baseline, whose own sample spread was ~860ms, so it could not see 240ms. Do not
    // re-derive the claim from that reading.
    //   The fix is a NARROW projection, not removal — the strip is real UI. It needs care rather than a
    // one-liner: `clean()` (generator/adapter.ts) drops `id`, so an id-only projection collapses each row
    // to `{}` and `hasContent` flips to false, silently emptying every row's strip. So it wants an
    // equivalence test against the current `versionDeliverables` output first. Own change (DECISIONS).
    finalExplanation: true,
    summaryTable: true,
  } as const
  const findVersions = (label: string, ids: number[]) =>
    ids.length === 0
      ? null
      : t.time(label, () =>
          payload.find({
            collection: 'lesson-bundle-versions',
            where: { id: { in: ids } },
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            select: versionSelect,
          }),
        )
  const [officialRes, pinnedRes] = await Promise.all([
    findVersions('officialVersions', officialIds),
    findVersions('pinnedVersions', pinnedIds),
  ])
  const versions = officialRes?.docs ?? []
  const pinned = pinnedRes?.docs ?? []

  // 3. Resolve the ONE thing depth was buying: each row's "<Subject> · Grade N" heading. Two depth-0
  //    lookups over distinct ids, caller's access preserved. Sequential because the subject ids live on
  //    the subject-grade rows, so this is one extra round-trip — 7–8ms of a ~630ms render. It COULD be
  //    one find (`subject-grades` at depth 1 plus `populate: { subjects: { name: true } }`, which does
  //    constrain populated docs), and that would save ~3ms; not worth `populate`'s extra concept here.
  //    Note the reason is the saving, NOT that depth 1 is unsafe — `populate` exists precisely for that.
  const sgIds = distinctIds([...versions, ...pinned].map((v) => relId(v.subjectGrade)))
  const sgDocs =
    sgIds.length === 0
      ? []
      : (
          await t.time('subjectGrades', () =>
            payload.find({
              collection: 'subject-grades',
              where: { id: { in: sgIds } },
              overrideAccess: false,
              user,
              depth: 0,
              pagination: false,
              select: { grade: true, subject: true },
            }),
          )
        ).docs
  const subjectIds = distinctIds(sgDocs.map((sg) => relId(sg.subject)))
  const subjectDocs =
    subjectIds.length === 0
      ? []
      : (
          await t.time('subjects', () =>
            payload.find({
              collection: 'subjects',
              where: { id: { in: subjectIds } },
              overrideAccess: false,
              user,
              depth: 0,
              pagination: false,
              select: { name: true },
            }),
          )
        ).docs
  // Raw, nullable — `buildRow` owns the one 'Unknown subject' default, so it is not also applied here.
  const subjectNameById = new Map(subjectDocs.map((s) => [s.id, s.name]))
  /** subject-grade id → the row's two display fields. */
  const sgInfoById = new Map(
    sgDocs.map((sg) => [
      sg.id,
      { subjectName: subjectNameById.get(relId(sg.subject) as number), grade: sg.grade ?? null },
    ]),
  )

  // ONE row builder. The two lists differ only in the pinned suffix and the direct `?version=` link, so
  // the pinned caller decorates the finished row rather than the builder taking a mode flag — every
  // shared field is still written exactly once, which is the property the two old builders lacked.
  const buildRow = (v: (typeof versions)[number]): LessonRow | null => {
    const planId = relId(v.lessonPlan)
    if (planId == null) return null
    const sgId = relId(v.subjectGrade)
    const sg = sgId != null ? sgInfoById.get(sgId) : undefined
    return {
      id: planId, // the row links to the plan; the detail page opens its Official version
      versionId: v.id, // …and the star toggles a favorite on that Official version (§10)
      subjectName: sg?.subjectName ?? 'Unknown subject',
      grade: sg?.grade ?? null,
      substrandId: v.meta?.substrand_id ?? '',
      // Clean structured name, else de-shout the stored `title` ("BIOLOGY GRADE 10: …"). Shared rule.
      substrandName: lessonDisplayName(v.meta?.substrand_name, v.title),
      strandName: v.unit?.strand ?? null,
      lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
      status: 'published',
      deliverables: versionDeliverables(v),
      versionCount: versionCountByPlan.get(planId) ?? 1,
      // At depth 0 `subjectGrade` IS the id `isEditorFor` wants, so no `toId(… as never)` cast here.
      canEdit: isEditorFor(user as User, sgId ?? undefined),
    }
  }

  const rows = versions.flatMap((v) => buildRow(v) ?? [])
  const pinnedRows = pinned.flatMap((v) => {
    const row = buildRow(v)
    // A pinned pseudo-row links straight to its version and carries the ` · vX (pinned)` suffix; the
    // plan's own catalogue row owns the versions chip, so `canEdit` is irrelevant here (LibraryBrowser
    // gates the chip on `!pinnedSemver`).
    return row
      ? [
          {
            ...row,
            pinnedSemver: v.semver ?? undefined,
            href: `/lessons/${row.id}?version=${v.id}`,
          },
        ]
      : []
  })

  // Data loading is done; everything after this is React render + RSC serialisation, which no timer
  // in here can see. That gap (Next's `application-code` minus `totalMs`) is itself the reading.
  t.report(payload.logger)

  return (
    <section className="lp">
      <h1 className="lp-title">Lesson Plans</h1>
      {/* Browsing (search + subject/grade chips) is fully CLIENT-side — the catalogue is one
          loaded dataset, so filtering must not cost a server round-trip per click (perf fix
          2026-07-09). The URL still carries ?q/&subject/&grade for shareable views. */}
      <LibraryBrowser
        rows={rows}
        pinnedRows={pinnedRows}
        favPairs={[...favByVersion]}
        initial={{ q, subject, grade }}
      />
    </section>
  )
}
