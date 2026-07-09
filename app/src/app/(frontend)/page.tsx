import React from 'react'

import { requireUser } from '@/lib/session'
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
  const { payload, user } = await requireUser()
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
  const [{ docs: plans }, { docs: favorites }, { docs: versionStubs }] = await Promise.all([
    payload.find({
      collection: 'lesson-plans',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { officialVersion: true },
    }),
    payload.find({
      collection: 'favorites',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { version: true },
    }),
    payload.find({
      collection: 'lesson-bundle-versions',
      overrideAccess: false,
      user,
      depth: 0,
      pagination: false,
      select: { lessonPlan: true },
    }),
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

  // 2. Load those Official versions with a light projection — the version carries meta/unit/lessons.
  //    `lessons: { id: true }` yields the count via length without loading lesson bodies; depth 2
  //    resolves the subject name. `lessonPlan` maps each version back to its plan (the row link).
  const { docs: versions } = officialIds.length
    ? await payload.find({
        collection: 'lesson-bundle-versions',
        where: { id: { in: officialIds } },
        overrideAccess: false,
        user,
        depth: 2,
        pagination: false,
        select: {
          title: true,
          subjectGrade: true,
          lessonPlan: true,
          meta: { substrand_id: true, substrand_name: true },
          unit: { strand: true },
          lessons: { id: true },
          // The two OPTIONAL deliverable groups — only to decide the row's document strip (T2)
          // via `versionDeliverables`. Revisit if the corpus reaches the documented ~1–2k range.
          finalExplanation: true,
          summaryTable: true,
        },
      })
    : { docs: [] }

  const rows: LessonRow[] = versions.flatMap((v) => {
    const planId = relId(v.lessonPlan)
    if (planId == null) return []
    const sg = typeof v.subjectGrade === 'object' ? v.subjectGrade : null
    const subject = sg && typeof sg.subject === 'object' ? sg.subject : null
    return [
      {
        id: planId, // the row links to the plan; the detail page opens its Official version
        versionId: v.id, // …and the star toggles a favorite on that Official version (§10)
        subjectName: subject?.name ?? 'Unknown subject',
        grade: sg?.grade ?? null,
        substrandId: v.meta?.substrand_id ?? '',
        // Clean structured name, else de-shout the stored `title` ("BIOLOGY GRADE 10: …"). Shared rule.
        substrandName: lessonDisplayName(v.meta?.substrand_name, v.title),
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
        deliverables: versionDeliverables(v),
        versionCount: versionCountByPlan.get(planId) ?? 1,
        canEdit: isEditorFor(user as User, toId(sg as never)),
      },
    ]
  })

  // PR ②: "My favorites" is a list of VERSIONS. A favorite on a non-Official version (an editor's
  // pin — teachers' stars follow the Official by T4) has no catalogue row, so resolve those
  // versions into pseudo rows: same display shape, suffixed `· vX (pinned)`, linking straight to
  // `?version=`. This closes PR ①'s documented gap (pinned favorites were invisible here).
  const officialIdSet = new Set(officialIds)
  const pinnedIds = [...favByVersion.keys()].filter((vid) => !officialIdSet.has(vid))
  const pinnedRows: LessonRow[] = []
  if (pinnedIds.length > 0) {
    const { docs: pinned } = await payload.find({
      collection: 'lesson-bundle-versions',
      where: { id: { in: pinnedIds } },
      overrideAccess: false,
      user,
      depth: 2,
      pagination: false,
      select: {
        title: true,
        semver: true,
        subjectGrade: true,
        lessonPlan: true,
        meta: { substrand_id: true, substrand_name: true },
        unit: { strand: true },
        lessons: { id: true },
        finalExplanation: true,
        summaryTable: true,
      },
    })
    for (const v of pinned) {
      const planId = relId(v.lessonPlan)
      if (planId == null) continue
      const sg = typeof v.subjectGrade === 'object' ? v.subjectGrade : null
      const subject = sg && typeof sg.subject === 'object' ? sg.subject : null
      pinnedRows.push({
        id: planId,
        versionId: v.id,
        subjectName: subject?.name ?? 'Unknown subject',
        grade: sg?.grade ?? null,
        substrandId: v.meta?.substrand_id ?? '',
        substrandName: lessonDisplayName(v.meta?.substrand_name, v.title),
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
        deliverables: versionDeliverables(v),
        pinnedSemver: v.semver ?? undefined,
        href: `/lessons/${planId}?version=${v.id}`,
      })
    }
  }

  return (
    <section className="lp">
      <h1 className="lp-title">Lesson plans</h1>
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
