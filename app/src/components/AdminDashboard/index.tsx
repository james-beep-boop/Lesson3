import React from 'react'
import type { AdminViewServerProps } from 'payload'

import { isSiteAdmin, toId } from '../../access'
import type { User } from '../../payload-types'

/**
 * Custom admin dashboard (overrides Payload's default via `admin.components.views.dashboard`).
 *
 * Payload's stock dashboard renders collection "cards" that exactly duplicate the left nav — so
 * the landing page is pure redundancy. We replace ONLY that view (nav, auth, permissions, list /
 * edit views, breadcrumbs, the whole admin shell stay 100% Payload-native) with a quiet, additive
 * landing: who you are + your scope, and the few actions the nav does NOT already provide. It must
 * never re-list collections — the sidebar owns those (that's the redundancy we're removing).
 *
 * Type scale matches the public Lesson Plans page (22 / 18 / 16 / 14) for cross-surface
 * consistency; colours use Payload theme variables so it adapts to light/dark. Role-aware per
 * SPEC §13 — actions a role can't use are not shown (the Site-Admin ingest is hidden otherwise).
 */
export default async function AdminDashboard({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult
  const user = req.user as User | null
  const canIngest = isSiteAdmin(user)

  const { role, scope } = await describeUser(req, user)

  return (
    <div className="lp-admin-dash">
      <h1 className="lp-admin-dash__title">Lesson Plan Repository</h1>
      <p className="lp-admin-dash__role">Signed in as {role}</p>
      {scope && <p className="lp-admin-dash__scope">{scope}</p>}

      <h2 className="lp-admin-dash__section">Get started</h2>
      {/* Full navigations across surfaces (admin → The App frontend; admin → a collection page that
          re-renders the admin shell), not client-side routes — so plain <a> is intentional, matching
          the frontend layout's admin link. */}
      <ul className="lp-admin-dash__actions">
        <li>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="lp-admin-dash__action" href="/">
            <span className="lp-admin-dash__action-label">Browse lesson library</span>
            <span className="lp-admin-dash__action-desc">Open the shared lesson-plan page.</span>
          </a>
        </li>
        {canIngest && (
          <li>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="lp-admin-dash__action" href="/admin/collections/lesson-bundles">
              <span className="lp-admin-dash__action-label">Ingest lesson plans</span>
              <span className="lp-admin-dash__action-desc">Upload generated ARES lesson bundles.</span>
            </a>
          </li>
        )}
      </ul>
    </div>
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
