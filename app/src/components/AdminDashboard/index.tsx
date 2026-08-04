import React from 'react'
import Link from 'next/link'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'

import { isSiteAdmin, subjectGradeIdsByRole } from '../../access'
import { deletableVersionsWhere } from '../../access/versioning'
import { resolveAccessSummary } from '../../lib/accessScopes'
import { relId, distinctIds } from '../../lib/relId'
import { lessonDisplayName } from '../../lib/substrand'
import type { User } from '../../payload-types'
import UploadBundles from '../UploadBundles'
import { CandidateList, type CandidateRow } from './CandidateList'
import { DeletePlansPanel, type PlanRow } from './DeletePlansPanel'
import { buildEditorGroups } from '../../lib/editorGroups'
import { startRenderTimings } from '../../lib/renderTimings'
import { EditorsWidget } from './EditorsWidget'

/**
 * Manage — THE role-scoped functions page (IA redesign, DECISIONS 2026-07-01 "late"), replacing the
 * old quiet dashboard. ONE scrollable page of stacked sections, strictly cumulative by role;
 * everything else in the product happens in the library (`/`) and on the lesson page.
 *
 * Order (reordered 2026-08-04) is Curriculum & people → Editing access → Lesson plans (Upload /
 * Delete / Repair) → Candidate versions, the same for every role — a role simply sees fewer sections.
 * The per-section rationale lives at each section in the JSX rather than in a second inventory here,
 * which drifted the last time the order changed. Two claims worth keeping out of the JSX:
 *
 *   - The candidates scope mirrors `lessonBundleVersionDelete` EXACTLY, because both come from
 *     `deletableVersionsWhere` — no row is shown that the server would refuse to delete. Editors see
 *     only versions THEY authored; Subject/Site Admins see every candidate in scope, union'd with
 *     their own drafts (so an admin who also edits elsewhere misses nothing).
 *   - The editors widget is deliberately NOT the native Users table (decided); the server-side
 *     `enforceAssignmentScope` hook remains the write authority regardless of what it renders.
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
  // No-op unless RENDER_TIMINGS=1 (lib/renderTimings.ts). Kept after the depth-0 rewrite so the next
  // change to this page can be measured rather than reasoned about — on the catalogue every plausible
  // cause turned out to be the wrong one (DECISIONS 2026-08-03 perf). Each find is timed individually;
  // the `Promise.all` barrier is deliberately NOT wrapped, since it is just the largest of them.
  const t = startRenderTimings('/admin')
  const deletable = deletableVersionsWhere(user)
  const [{ typeLabel: role, lines: roleLines }, versionsRes, editorGroups, plansRes] =
    await Promise.all([
      t.time('accessSummary', () => resolveAccessSummary(req.payload, user)),
      // ---- Saved versions (deletable candidates) ----
      deletable === false
        ? null
        : t.time('versions', () =>
            payload.find({
              collection: 'lesson-bundle-versions',
              overrideAccess: false,
              user,
              depth: 0,
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
          ),
      // ---- Editors widget: the whole role gate + trusted query + projection, as ONE unit ----
      // `buildEditorGroups` (lib/editorGroups.ts) owns the gate, the `overrideAccess: true` read and
      // the client projection together, because the email carve-out is only sound while they cannot be
      // separated — inlined here it was an emergent property of several conditions consulting the same
      // general-purpose `isAdmin`. It returns [] for a non-administrator without querying, and it is
      // covered per-role by `tests/int/editorGroupsAccess.int.spec.ts`.
      t.time('editorGroups', () => buildEditorGroups({ payload, user })),
      // ---- Site-Admin panels: one shared plans fetch for repair + delete ----
      siteAdmin
        ? t.time('plans', () =>
            payload.find({
              collection: 'lesson-plans',
              overrideAccess: false,
              user,
              depth: 0,
              pagination: false,
              sort: 'title',
              select: { title: true, subjectGrade: true, officialVersion: true },
            }),
          )
        : null,
    ])
  const versionDocs = versionsRes?.docs ?? []
  const planDocs = plansRes?.docs ?? []

  // ---- Wave 2: resolve the few display strings the rows need, EXPLICITLY. ----
  // This replaces `depth: 2` on the two finds above. No collection sets `defaultPopulate`, so a
  // populated document came back WHOLE, and depth 2 walked version → lessonPlan → officialVersion —
  // refetching entire lesson bundles (`lessons[]`, `finalExplanation`, `summaryTable`) to render a
  // title, a grade label, an author and a date. Measured 2026-08-04 on a 43-plan corpus: ~8.0s to
  // produce ONE candidate row, ~1.8× the catalogue's ~4.6s. After this rewrite: ~170ms, same rows.
  // The catalogue had the same shape and was fixed the same way (DECISIONS 2026-08-04 late): ~4.5s →
  // ~0.63s, `depth: 0` plus a subject-grade and a subject lookup.
  //
  // Each lookup is depth 0, over DISTINCT ids, projected to the one field it needs, and keeps the
  // caller's access (`overrideAccess: false` + `user`) — population respected access too, so this
  // widens nothing. ⚑ `users` is read here as the names-only roster every authenticated user may read
  // (SPEC §8 as amended 2026-07-02; `name` has no read restriction). Select ONLY `name`: `email`,
  // `roles` and `assignments` are the field-gated ones, and `lib/editorGroups.ts` remains the single
  // trusted `overrideAccess: true` projection — do not reach for it here.
  const sgIds = distinctIds([
    ...versionDocs.map((v) => relId(v.subjectGrade)),
    ...planDocs.map((p) => relId(p.subjectGrade)),
  ])
  const authorIds = distinctIds(versionDocs.map((v) => relId(v.author)))
  const officialIds = distinctIds(planDocs.map((p) => relId(p.officialVersion)))
  // Official pointers drive the candidate exclusion below. A Site Admin's plans fetch already carries
  // every plan, so reuse it; other roles have no plans fetch, so look up only the plans their own
  // versions reference.
  const exclusionPlanIds = siteAdmin ? [] : distinctIds(versionDocs.map((v) => relId(v.lessonPlan)))

  const [sgRes, authorRes, exclusionRes, officialMetaRes] = await Promise.all([
    sgIds.length === 0
      ? null
      : t.time('subjectGrades', () =>
          payload.find({
            collection: 'subject-grades',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            where: { id: { in: sgIds } },
            select: { displayName: true },
          }),
        ),
    authorIds.length === 0
      ? null
      : t.time('authors', () =>
          payload.find({
            collection: 'users',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            where: { id: { in: authorIds } },
            select: { name: true },
          }),
        ),
    exclusionPlanIds.length === 0
      ? null
      : t.time('exclusionPlans', () =>
          payload.find({
            collection: 'lesson-plans',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            where: { id: { in: exclusionPlanIds } },
            select: { officialVersion: true },
          }),
        ),
    officialIds.length === 0
      ? null
      : t.time('officialMeta', () =>
          payload.find({
            collection: 'lesson-bundle-versions',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            where: { id: { in: officialIds } },
            select: { meta: { substrand_name: true } },
          }),
        ),
  ])

  const sgLabelById = new Map<number, string>()
  for (const sg of sgRes?.docs ?? []) if (sg.displayName) sgLabelById.set(sg.id, sg.displayName)
  const authorNameById = new Map<number, string>()
  for (const a of authorRes?.docs ?? []) if (a.name) authorNameById.set(a.id, a.name)
  const officialNameById = new Map<number, string>()
  for (const v of officialMetaRes?.docs ?? []) {
    if (v.meta?.substrand_name) officialNameById.set(v.id, v.meta.substrand_name)
  }
  // plan id → its Official version id (null for a pointerless plan, which Repair lists).
  const officialByPlan = new Map<number, number | null>()
  for (const p of exclusionRes?.docs ?? planDocs) officialByPlan.set(p.id, relId(p.officialVersion))

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const candidates: CandidateRow[] = versionDocs
    .filter((v) => {
      // Officials are not candidates (and are undeletable) — exclude each plan's current pointer.
      // ⚑ Fails CLOSED on an unresolvable plan. The previous version read the POPULATED plan and
      // returned `plan == null || …`, i.e. KEEP when it could not tell — which at depth 0 would have
      // listed every Official as deletable, breaking this module's "no row the server would refuse"
      // contract. `lessonPlanRead` is `Boolean(user)`, so every plan behind a visible version is
      // readable and this map is always complete; an absent id is a can't-happen, not a routine case
      // being quietly dropped. Pinned by manage.e2e.spec.ts.
      const planId = relId(v.lessonPlan)
      if (planId == null) return false
      const official = officialByPlan.get(planId)
      return official !== undefined && official !== v.id
    })
    .map((v) => {
      const sgId = relId(v.subjectGrade)
      const authorId = relId(v.author)
      return {
        id: v.id,
        label: lessonDisplayName(v.meta?.substrand_name, v.title),
        semver: v.semver ?? '',
        sgLabel: (sgId != null ? sgLabelById.get(sgId) : undefined) ?? '',
        authorName: (authorId != null ? authorNameById.get(authorId) : undefined) ?? null,
        savedAt: v.createdAt ? dateFmt.format(new Date(v.createdAt)) : '',
      }
    })

  // ---- Site-Admin panels: repair (pointerless plans) + delete lesson plans (one shared fetch) ----
  const repairPlans: { id: number; label: string }[] = []
  const planRows: PlanRow[] = []
  if (plansRes) {
    for (const p of planDocs) {
      const officialId = relId(p.officialVersion)
      const sgId = relId(p.subjectGrade)
      const label = lessonDisplayName(
        officialId != null ? officialNameById.get(officialId) : undefined,
        p.title,
      )
      planRows.push({
        id: p.id,
        label,
        sgLabel: (sgId != null ? sgLabelById.get(sgId) : undefined) ?? '',
      })
      if (officialId == null) repairPlans.push({ id: p.id, label })
    }
  }

  // Data loading is done; the rest is React render + RSC serialisation. The two counts make a duration
  // interpretable: for a Site Admin the versions query is whole-corpus, so `candidates` can be 0 or 1
  // while the query still did all its work — a fast render on an empty result would otherwise be
  // indistinguishable from a fast render on a small one.
  t.report(payload.logger, { candidates: candidates.length, plans: planRows.length })

  const savedTitle = isAdmin ? 'Candidate versions' : 'My saved versions'
  const savedDesc = isAdmin
    ? 'Saved, non-Official versions you may delete.'
    : 'Continue working on versions you have saved.'
  // Empty state carries the explanation the list would otherwise have to: what belongs here and how
  // something gets here. A bare "You have no saved versions." tells a new Editor nothing.
  //
  // ⚑ It names SAVING, not Edit. The first draft said "choose Edit, and your saved work will appear
  // here" — but entering edit mode creates nothing. A row appears only when someone SAVES, so copy
  // that stops at Edit describes a step that leaves the list exactly as empty as before, and reads as
  // a broken promise to the person waiting for a row.
  //
  // Non-admin only: `showSaved` gives an ADMIN no section at all when the list is empty, so the admin
  // variant of this string ("No saved candidates yet…") became unreachable and is gone.
  const savedEmpty =
    'You have no saved versions yet. Open a lesson plan, choose Edit, then save your changes. Your saved work will appear here.'
  // An administrator with nothing to tidy gets no section at all (2026-08-04, page-length request):
  // heading + description + empty state spent three rows saying "nothing here" to someone who already
  // knows what the list is. An Editor still sees it empty — for them the copy above is instructional,
  // and this list is their only route back to unfinished work.
  const showSaved = candidates.length > 0 || !isAdmin

  return (
    <Gutter className="lp-admin-dash lp-manage">
      {/* Title + role on one line. The role stays a SIBLING of the h1 rather than moving inside it, so
          the heading's accessible name is still exactly "Manage". Copy rationale:
          docs/DESIGN-user-model-language-2026-07-29.md; why a site admin has no scope line: the ⚑ in
          lib/accessScopes.ts. */}
      <div className="lp-admin-dash__head">
        <h1 className="lp-admin-dash__title">Manage</h1>
        <p className="lp-admin-dash__role">{role}</p>
      </div>
      {roleLines.length > 0 && (
        <div className="lp-admin-dash__identity">
          {roleLines.map((line) => (
            <p key={line} className="lp-admin-dash__scope">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* SECTION ORDER (2026-08-04, operator request): things done often first, the janitorial
          inventory last. One order for every role; a role simply sees fewer sections (a Subject Admin
          gets Editing access → Candidate versions, an Editor only their saved versions). */}
      {siteAdmin && (
        <>
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

      {editorGroups.length > 0 && (
        <>
          <h2 className="lp-admin-dash__section">Editing access</h2>
          <p className="lp-manage__desc">
            Who may edit lesson plans, per subject grade. Granting access lets a teacher edit;
            removing it returns them to view-only.
          </p>
          <EditorsWidget groups={editorGroups} />
        </>
      )}

      {/* Upload / Delete / Repair are three operations on ONE noun, so they now sit under a single
          "Lesson plans" section as h3 sub-headings (18px vs the section's 20px — the documented
          hierarchy step, app-tokens.scss). Sub-headings deliberately get NO rule; only main sections
          are separated. Repair is last: it is conditional and rare. */}
      {siteAdmin && (
        <>
          <h2 className="lp-admin-dash__section">Lesson plans</h2>

          <h3 className="lp-admin-dash__subsection">Upload lesson plans</h3>
          <UploadBundles />

          <h3 className="lp-admin-dash__subsection">Delete lesson plans</h3>
          <p className="lp-manage__desc">
            Deleting a lesson plan removes ALL of its saved versions. This cannot be undone.
          </p>
          <DeletePlansPanel rows={planRows} />

          {repairPlans.length > 0 && (
            <>
              <h3 className="lp-admin-dash__subsection">Repair</h3>
              <p className="lp-manage__desc">
                Lesson plans with no Official version — open one to set its Official pointer.
              </p>
              <ul className="lp-manage__list">
                {repairPlans.map((p) => (
                  <li key={p.id}>
                    <Link
                      className="lp-manage__link"
                      href={`/admin/collections/lesson-plans/${p.id}`}
                    >
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {showSaved && (
        <>
          <h2 className="lp-admin-dash__section">{savedTitle}</h2>
          <p className="lp-manage__desc">{savedDesc}</p>
          <CandidateList rows={candidates} emptyText={savedEmpty} showAuthor={isAdmin} />
        </>
      )}
    </Gutter>
  )
}
