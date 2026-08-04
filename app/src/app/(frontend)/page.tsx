import React from 'react'

import { requireUser } from '@/lib/session'
import { startRenderTimings } from '@/lib/renderTimings'
import { relId } from '@/lib/relId'
import { versionDeliverables } from '@/generator/adapter'
import { isEditorFor, toId } from '@/access'
import type { User } from '@/payload-types'
import LibraryBrowser from './LibraryBrowser'
import { lessonDisplayName, type LessonRow } from '@/lib/substrand'

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
  // The third fetch (PR ②) is the whole corpus' version→plan mapping, projected to ONE relationship
  // column — it feeds the per-plan version COUNT behind the `[N versions ▾]` chip. Same corpus-size
  // posture as the plans fetch (revisit with the documented ~1–2k thresholds).
  // Timed individually, with no wrapper around the `Promise.all`: these start together, so the
  // barrier the render waits on is just the largest of the three — derivable, not worth an indent.
  const [{ docs: plans }, { docs: favorites }, { docs: versionStubs }] = await Promise.all([
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
    t.time('versionStubs', () =>
      payload.find({
        collection: 'lesson-bundle-versions',
        overrideAccess: false,
        user,
        depth: 0,
        pagination: false,
        select: { lessonPlan: true },
      }),
    ),
  ])
  const versionCountByPlan = new Map<number, number>()
  for (const v of versionStubs) {
    const pid = relId(v.lessonPlan)
    if (pid != null) versionCountByPlan.set(pid, (versionCountByPlan.get(pid) ?? 0) + 1)
  }
  const officialIds = plans.map((p) => relId(p.officialVersion)).filter((id): id is number => id != null)

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
  //    POPULATED documents (they use `defaultPopulate`, which no collection here sets), so depth 2
  //    walked `lessonPlan → officialVersion` and pulled whole lesson bundles back — measured at
  //    3880–4742ms of a 4030–4817ms render on 43 plans. Depth bought exactly ONE thing: `subject.name`,
  //    two hops away. Everything else the rows display (`meta`, `unit`, `lessons`, the two deliverable
  //    groups, `title`, `semver`) lives on the version document itself and is depth-independent, and
  //    `lessonPlan` was only ever read through `relId` — an id. So the fix is depth 0 plus the two
  //    small lookups below. Same change as Manage got (DECISIONS 2026-08-04).
  //
  //    Also now concurrent: `pinnedIds` needs only step 1's results, so the pinned read no longer waits
  //    on the Official read. Two round-trips became one.
  const versionSelect = {
    title: true,
    subjectGrade: true,
    lessonPlan: true,
    meta: { substrand_id: true, substrand_name: true },
    unit: { strand: true },
    lessons: { id: true }, // count via length — no lesson bodies
    // The two OPTIONAL deliverable groups — only to decide the row's document strip (T2) via
    // `versionDeliverables`. Measured at zero cost: what was expensive here was the depth, not this.
    finalExplanation: true,
    summaryTable: true,
  } as const
  const [officialRes, pinnedRes] = await Promise.all([
    officialIds.length === 0
      ? null
      : t.time('officialVersions', () =>
          payload.find({
            collection: 'lesson-bundle-versions',
            where: { id: { in: officialIds } },
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            select: versionSelect,
          }),
        ),
    pinnedIds.length === 0
      ? null
      : t.time('pinnedVersions', () =>
          payload.find({
            collection: 'lesson-bundle-versions',
            where: { id: { in: pinnedIds } },
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            select: { ...versionSelect, semver: true },
          }),
        ),
  ])
  const versions = officialRes?.docs ?? []
  const pinned = pinnedRes?.docs ?? []

  // 3. Resolve the ONE thing depth was buying: each row's "<Subject> · Grade N" heading. Two depth-0
  //    lookups over DISTINCT ids, both keeping the caller's access (`overrideAccess: false` + `user`)
  //    — population respected access too, so this widens nothing. Sequential because the subject ids
  //    live on the subject-grade rows; both are single-digit-ms on this corpus. Deliberately NOT
  //    `subject-grades` at depth 1: that would re-introduce unconstrained population of whole subject
  //    documents, and "subjects are small" is exactly the assumption that rotted this page.
  const distinct = (ids: (number | null)[]): number[] => [
    ...new Set(ids.filter((id): id is number => id != null)),
  ]
  const sgIds = distinct([...versions, ...pinned].map((v) => relId(v.subjectGrade)))
  const sgRes =
    sgIds.length === 0
      ? null
      : await t.time('subjectGrades', () =>
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
  const sgDocs = sgRes?.docs ?? []
  const subjectIds = distinct(sgDocs.map((sg) => relId(sg.subject)))
  const subjectRes =
    subjectIds.length === 0
      ? null
      : await t.time('subjects', () =>
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
  const subjectNameById = new Map<number, string>()
  for (const s of subjectRes?.docs ?? []) if (s.name) subjectNameById.set(s.id, s.name)
  /** subject-grade id → the row's two display fields. */
  const sgInfoById = new Map<number, { subjectName: string; grade: number | null }>()
  for (const sg of sgDocs) {
    const subjectId = relId(sg.subject)
    sgInfoById.set(sg.id, {
      subjectName: (subjectId != null ? subjectNameById.get(subjectId) : undefined) ?? 'Unknown subject',
      grade: sg.grade ?? null,
    })
  }

  // One row shape for both lists — they only ever differed by the pinned suffix and the direct
  // `?version=` link, which was enough for the two builders to drift while looking identical.
  const buildRow = (v: (typeof versions)[number], pinnedSemver?: string): LessonRow | null => {
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
      ...(pinnedSemver == null
        ? {
            versionCount: versionCountByPlan.get(planId) ?? 1,
            // `subjectGrade` is a bare id at depth 0, which is what `isEditorFor` wants — so the
            // long-standing `toId(sg as never)` cast is gone from this call site.
            canEdit: isEditorFor(user as User, toId(relId(v.subjectGrade) ?? undefined)),
          }
        : { pinnedSemver, href: `/lessons/${planId}?version=${v.id}` }),
    }
  }

  const rows = versions.flatMap((v) => {
    const row = buildRow(v)
    return row ? [row] : []
  })
  const pinnedRows = pinned.flatMap((v) => {
    const row = buildRow(v, v.semver ?? undefined)
    return row ? [row] : []
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
