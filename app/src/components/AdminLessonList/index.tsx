import React from 'react'
import { Gutter } from '@payloadcms/ui'
import type { ListViewServerProps } from 'payload'

import { isSiteAdmin } from '../../access'
import { relId } from '../../lib/relId'
import type { LessonRow } from '../../lib/substrand'
import type { User } from '../../payload-types'
import UploadBundles from '../UploadBundles'
import { AdminLessonCatalogue } from './AdminLessonCatalogue'

/**
 * Custom admin LIST view for the `lesson-plans` collection (overrides Payload's default table via
 * `admin.components.views.list`). The stock table is badly redundant — each row repeats the
 * subject-grade three ways (the shouty `title` prefix, the Subject Grade column, AND the Official
 * Version relationship cell, which renders the version's `title` a third time).
 *
 * Instead we render the SAME strand-first catalogue as the public browse page
 * (`app/(frontend)/page.tsx`): subject-grade → strand → numbered sub-strand, in curriculum order,
 * using the clean structured `meta.substrand_name` rather than the stored title. Data fetch +
 * row-shaping mirror that page deliberately so the two surfaces can never drift; the grouping/order
 * logic is the shared, unit-tested `lib/substrand.ts`. This is a READ-ONLY view — it touches no
 * versioning/generator/access logic.
 *
 * Admin-only affordances on top of the public layout: the Site-Admin upload panel (which used to be
 * injected via `beforeListTable` — that slot does not fire when the whole list view is replaced, so
 * we render it here), an Official `v{semver}` badge per row, an Edit link to each plan, and
 * (Site-Admin-only) bulk-delete checkboxes — see AdminLessonCatalogue.
 */
export default async function AdminLessonList({ payload, user }: ListViewServerProps) {
  const u = (user as User | null | undefined) ?? null

  // Access-gated plans — only each plan's id + Official pointer; the listable content is on the
  // version. `pagination: false` returns the whole corpus (a grouped catalogue, not a paged table).
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    overrideAccess: false,
    user: u,
    depth: 0,
    pagination: false,
    select: { officialVersion: true },
  })
  const officialIds = plans
    .map((p) => relId(p.officialVersion))
    .filter((id): id is number => id != null)

  // Load those Official versions with a light projection — the version carries meta/unit/lessons +
  // the semver we badge. `lessons: { id: true }` yields the count via length without bodies.
  const { docs: versions } = officialIds.length
    ? await payload.find({
        collection: 'lesson-bundle-versions',
        where: { id: { in: officialIds } },
        overrideAccess: false,
        user: u,
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
        id: planId, // the row links to / selects the plan
        subjectName: subject?.name ?? 'Unknown subject',
        grade: sg?.grade ?? null,
        substrandId: v.meta?.substrand_id ?? '',
        // Prefer the clean structured name over the shouty stored title ("PHYSICS GRADE 10: …").
        substrandName: v.meta?.substrand_name || v.title || 'Untitled',
        strandName: v.unit?.strand ?? null,
        lessonCount: Array.isArray(v.lessons) ? v.lessons.length : 0,
        status: 'published',
        semver: v.semver ?? undefined,
      },
    ]
  })

  return (
    <Gutter className="lp-admin-list">
      <h1 className="lp-title">Lesson plans</h1>
      <UploadBundles />
      <AdminLessonCatalogue rows={rows} canDelete={isSiteAdmin(u)} />
    </Gutter>
  )
}
