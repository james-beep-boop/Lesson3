import React from 'react'
import Link from 'next/link'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'

import { isSiteAdmin, subjectGradeIdsByRole, toId } from '../../access'
import { deletableVersionsWhere } from '../../access/versioning'
import { relId } from '../../lib/relId'
import { lessonDisplayName } from '../../lib/substrand'
import type { User } from '../../payload-types'
import UploadBundles from '../UploadBundles'
import { CandidateList, type CandidateRow } from './CandidateList'
import { DeletePlansPanel, type PlanRow } from './DeletePlansPanel'
import { EditorsWidget, type EditorsGroup, type WidgetUser } from './EditorsWidget'

/**
 * Manage — THE role-scoped functions page (IA redesign, DECISIONS 2026-07-01 "late"), replacing the
 * old quiet dashboard. ONE scrollable page of stacked sections, strictly cumulative by role;
 * everything else in the product happens in the library (`/`) and on the lesson page. Sections:
 *
 *   - Saved versions (all panel roles) — the non-Official candidates the user may DELETE. Editors see
 *     only versions THEY authored ("My saved versions"); Subject/Site Admins see every candidate in
 *     scope, union'd with their own authored drafts (so an admin who is also an editor elsewhere
 *     misses nothing). Click resumes editing (`?edit=1`); ✕ deletes. Scope mirrors
 *     `lessonBundleVersionDelete` exactly — no row is shown that the server would refuse.
 *   - Editors (Subject Admin: their subject-grades; Site Admin: all) — compact promote/demote widget
 *     for the Editor role, deliberately NOT the native Users table (decided). The server-side
 *     `enforceAssignmentScope` hook remains the write authority.
 *   - Upload / Repair / Delete lesson plans / Curriculum & People links — Site Admin only.
 *
 * Server component: gathers everything with the CALLER's access (`overrideAccess: false`), renders
 * client components for the interactive bits. Dates are formatted server-side (fixed locale) so
 * hydration can't mismatch. Wrapped in Payload's `Gutter` so it lines up with every admin page.
 */
export default async function AdminDashboard({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const user = (req.user as User | null) ?? null
  const payload = req.payload

  const siteAdmin = isSiteAdmin(user)
  const adminSgIds = subjectGradeIdsByRole(user, ['subjectAdmin'])
  const isAdmin = siteAdmin || adminSgIds.length > 0

  // The deletable-candidates scope comes from the SAME where-builder the delete access uses
  // (`deletableVersionsWhere`) — single source, so this list can never drift from what the server
  // would actually let the user delete. All queries below are independent → run them concurrently.
  const deletable = deletableVersionsWhere(user)
  const [{ role, scope }, versionsRes, sgsRes, usersRes, plansRes] = await Promise.all([
    describeUser(req, user),
    // ---- Saved versions (deletable candidates) ----
    deletable === false
      ? null
      : payload.find({
          collection: 'lesson-bundle-versions',
          overrideAccess: false,
          user,
          depth: 2,
          pagination: false,
          sort: '-createdAt',
          where: deletable === true ? {} : deletable,
          select: {
            title: true,
            semver: true,
            subjectGrade: true,
            lessonPlan: true,
            author: true,
            meta: { substrand_name: true },
            createdAt: true,
          },
        }),
    // ---- Editors widget: subject-grades in scope + every user (light projections) ----
    isAdmin
      ? payload.find({
          collection: 'subject-grades',
          overrideAccess: false,
          user,
          depth: 0,
          pagination: false,
          sort: 'displayName',
          where: siteAdmin ? {} : { id: { in: adminSgIds } },
          select: { displayName: true },
        })
      : null,
    isAdmin
      ? payload.find({
          collection: 'users',
          overrideAccess: false,
          user,
          depth: 0,
          pagination: false,
          sort: 'name',
          select: { name: true, roles: true, assignments: true, updatedAt: true },
        })
      : null,
    // ---- Site-Admin panels: one shared plans fetch for repair + delete ----
    siteAdmin
      ? payload.find({
          collection: 'lesson-plans',
          overrideAccess: false,
          user,
          depth: 2,
          pagination: false,
          sort: 'title',
          select: { title: true, subjectGrade: true, officialVersion: true },
        })
      : null,
  ])
  const versionDocs = versionsRes?.docs ?? []

  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const candidates: CandidateRow[] = versionDocs
    .filter((v) => {
      // Officials are not candidates (and are undeletable) — exclude each plan's current pointer.
      const plan = typeof v.lessonPlan === 'object' ? v.lessonPlan : null
      return plan == null || relId(plan.officialVersion) !== v.id
    })
    .map((v) => {
      const sg = typeof v.subjectGrade === 'object' ? v.subjectGrade : null
      const author = typeof v.author === 'object' && v.author != null ? v.author : null
      return {
        id: v.id,
        label: lessonDisplayName(v.meta?.substrand_name, v.title),
        semver: v.semver ?? '',
        sgLabel: sg?.displayName ?? '',
        authorName: author?.name ?? null,
        savedAt: v.createdAt ? dateFmt.format(new Date(v.createdAt)) : '',
      }
    })

  // ---- Editors widget data (Subject Admin: scoped; Site Admin: all subject-grades) ----
  let editorGroups: EditorsGroup[] = []
  if (sgsRes && usersRes) {
    const sgs = sgsRes.docs
    // Every user, light projection (any signed-in user may read users; emails stay field-hidden).
    const allUsers = usersRes.docs
    // The widget only needs identity + the freshness token — the assignment endpoints rebuild the
    // row server-side from fresh state (assignments are read here solely to compute the groups).
    const widgetUser = (u: (typeof allUsers)[number]): WidgetUser => ({
      id: u.id,
      name: u.name ?? `User ${u.id}`,
      updatedAt: String(u.updatedAt),
    })
    editorGroups = sgs.map((sg) => {
      const editors = allUsers.filter((u) =>
        (u.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id && a.role === 'editor'),
      )
      const addable = allUsers.filter(
        (u) =>
          !u.roles?.includes('siteAdmin') &&
          !(u.assignments ?? []).some((a) => toId(a.subjectGrade) === sg.id),
      )
      return {
        sgId: sg.id,
        sgLabel: sg.displayName ?? `Subject grade ${sg.id}`,
        editors: editors.map(widgetUser),
        addable: addable.map(widgetUser),
      }
    })
  }

  // ---- Site-Admin panels: repair (pointerless plans) + delete lesson plans (one shared fetch) ----
  const repairPlans: { id: number; label: string }[] = []
  const planRows: PlanRow[] = []
  if (plansRes) {
    for (const p of plansRes.docs) {
      const official = typeof p.officialVersion === 'object' ? p.officialVersion : null
      const sg = typeof p.subjectGrade === 'object' ? p.subjectGrade : null
      const label = lessonDisplayName(official?.meta?.substrand_name, p.title)
      planRows.push({ id: p.id, label, sgLabel: sg?.displayName ?? '' })
      if (relId(p.officialVersion) == null) repairPlans.push({ id: p.id, label })
    }
  }

  const savedTitle = isAdmin ? 'Candidate versions' : 'My saved versions'
  const savedDesc = isAdmin
    ? 'Saved, non-Official versions you may delete. Click one to open it in the editor.'
    : 'Versions you saved. Click one to continue editing; delete the ones you no longer need.'

  return (
    <Gutter className="lp-admin-dash lp-manage">
      <h1 className="lp-admin-dash__title">Manage</h1>
      <p className="lp-admin-dash__role">Signed in as {role}</p>
      {scope && <p className="lp-admin-dash__scope">{scope}</p>}

      <h2 className="lp-admin-dash__section">{savedTitle}</h2>
      <p className="lp-manage__desc">{savedDesc}</p>
      <CandidateList
        rows={candidates}
        emptyText={isAdmin ? 'No candidate versions.' : 'You have no saved versions.'}
        showAuthor={isAdmin}
      />

      {editorGroups.length > 0 && (
        <>
          <h2 className="lp-admin-dash__section">Editors</h2>
          <p className="lp-manage__desc">
            Who may edit lesson plans, per subject grade. Adding someone makes them an Editor;
            removing returns them to Teacher.
          </p>
          <EditorsWidget groups={editorGroups} />
        </>
      )}

      {siteAdmin && (
        <>
          <h2 className="lp-admin-dash__section">Upload lesson plans</h2>
          <UploadBundles />

          {repairPlans.length > 0 && (
            <>
              <h2 className="lp-admin-dash__section">Repair</h2>
              <p className="lp-manage__desc">
                Lesson plans with no Official version — open one to set its Official pointer.
              </p>
              <ul className="lp-manage__list">
                {repairPlans.map((p) => (
                  <li key={p.id}>
                    <Link className="lp-manage__link" href={`/admin/collections/lesson-plans/${p.id}`}>
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="lp-admin-dash__section">Delete lesson plans</h2>
          <p className="lp-manage__desc">
            Deleting a lesson plan removes ALL of its saved versions. This cannot be undone.
          </p>
          <DeletePlansPanel rows={planRows} />

          <h2 className="lp-admin-dash__section">Curriculum &amp; people</h2>
          <ul className="lp-admin-dash__actions">
            <li>
              <Link className="lp-admin-dash__action" href="/admin/collections/users">
                <span className="lp-admin-dash__action-label">People</span>
                <span className="lp-admin-dash__action-desc">
                  All accounts, roles and assignments.
                </span>
              </Link>
            </li>
            <li>
              <Link className="lp-admin-dash__action" href="/admin/collections/subjects">
                <span className="lp-admin-dash__action-label">Subjects</span>
                <span className="lp-admin-dash__action-desc">Academic disciplines.</span>
              </Link>
            </li>
            <li>
              <Link className="lp-admin-dash__action" href="/admin/collections/subject-grades">
                <span className="lp-admin-dash__action-label">Subject grades</span>
                <span className="lp-admin-dash__action-desc">
                  Subject + grade units that roles and lesson plans attach to.
                </span>
              </Link>
            </li>
          </ul>
        </>
      )}
    </Gutter>
  )
}

/** Factual role + scope line for the current user (no instructional copy). */
async function describeUser(
  req: AdminViewServerProps['initPageResult']['req'],
  user: User | null,
): Promise<{ role: string; scope: string }> {
  if (isSiteAdmin(user)) return { role: 'Site Administrator', scope: 'All subjects and grades' }

  const assignments = user?.assignments ?? []
  if (assignments.length === 0) return { role: 'Teacher', scope: '' }

  const role = assignments.some((a) => a.role === 'subjectAdmin') ? 'Subject Administrator' : 'Editor'

  // assignments carry subject-grade IDs at auth depth → resolve them to "Subject · Grade N".
  const ids = assignments
    .map((a) => toId(a.subjectGrade))
    .filter((id): id is number => typeof id === 'number')
  const labelById = new Map<number, string>()
  if (ids.length > 0) {
    const { docs } = await req.payload.find({
      collection: 'subject-grades',
      where: { id: { in: ids } },
      depth: 1,
      limit: ids.length,
      overrideAccess: true,
    })
    for (const sg of docs) {
      const subject = typeof sg.subject === 'object' ? sg.subject : null
      labelById.set(sg.id, `${subject?.name ?? 'Subject'} · Grade ${sg.grade}`)
    }
  }

  // Preserve assignment order, de-duplicate.
  const seen = new Set<string>()
  const labels: string[] = []
  for (const a of assignments) {
    const label = labelById.get(toId(a.subjectGrade) as number)
    if (label && !seen.has(label)) {
      seen.add(label)
      labels.push(label)
    }
  }
  return { role, scope: labels.join(', ') }
}
