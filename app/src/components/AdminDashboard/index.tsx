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
import { AccordionPanel, AccordionProvider } from '../Manage/Accordion'
import { resolveServerPanelState, type PanelId } from '../Manage/panelState'

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
/** Heading fallback when a subject-grade's Subject can't be resolved (can't-happen; fails visibly). */
const UNKNOWN_SUBJECT = 'Unknown subject'

export default async function AdminDashboard({
  initPageResult,
  searchParams,
}: AdminViewServerProps) {
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
            // `displayName` labels the candidate rows; `grade` + `subject` feed the delete panel's
            // curriculum grouping, which composes its own heading with `subjectGradeLabel()` so it
            // reads identically to the library catalogue's (lib/substrand.ts).
            select: { displayName: true, grade: true, subject: true },
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
            // `substrand_id` + `unit.strand` are the delete panel's curriculum coordinates (its
            // "1.1" and its strand heading). Two extra projected columns on a find that already
            // runs — NOT a reason to raise `depth`, which is what cost 8s here (see the ⚑ below).
            select: { meta: { substrand_name: true, substrand_id: true }, unit: { strand: true } },
          }),
        ),
  ])

  const authorNameById = new Map<number, string>()
  for (const a of authorRes?.docs ?? []) if (a.name) authorNameById.set(a.id, a.name)
  /** Official version id → the display fields BOTH Site-Admin panels read off it. */
  const officialInfoById = new Map<
    number,
    { substrandName?: string; substrandId: string; strandName: string | null }
  >()
  for (const v of officialMetaRes?.docs ?? []) {
    officialInfoById.set(v.id, {
      substrandName: v.meta?.substrand_name ?? undefined,
      substrandId: v.meta?.substrand_id ?? '',
      strandName: v.unit?.strand ?? null,
    })
  }

  // The delete panel's headings are "<Subject> · Grade N", so the subject NAME is needed — one hop
  // past the subject-grade rows, hence one more depth-0 find over distinct ids. Sequential because
  // the subject ids live on those rows (the catalogue page resolves the same thing the same way,
  // for ~8ms). Site-Admin-only: nothing else on the page needs it, so no other role pays for it.
  const subjectIds = siteAdmin
    ? distinctIds((sgRes?.docs ?? []).map((sg) => relId(sg.subject)))
    : []
  const subjectRes =
    subjectIds.length === 0
      ? null
      : await t.time('subjects', () =>
          payload.find({
            collection: 'subjects',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            where: { id: { in: subjectIds } },
            select: { name: true },
          }),
        )
  const subjectNameById = new Map<number, string>()
  for (const s of subjectRes?.docs ?? []) if (s.name) subjectNameById.set(s.id, s.name)
  /**
   * subject-grade id → every display field the rows on this page read off it: the stored
   * `displayName` for candidate rows, and the subject name + grade the delete panel's curriculum
   * grouping needs. ONE map keyed by subject-grade id rather than two built from the same docs —
   * and one home for the missing-subject fallback.
   */
  const sgById = new Map<number, { label: string; subjectName: string; grade: number | null }>()
  for (const sg of sgRes?.docs ?? []) {
    const subjectId = relId(sg.subject)
    sgById.set(sg.id, {
      label: sg.displayName ?? '',
      subjectName:
        (subjectId != null ? subjectNameById.get(subjectId) : undefined) ?? UNKNOWN_SUBJECT,
      grade: sg.grade ?? null,
    })
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
        sgLabel: (sgId != null ? sgById.get(sgId)?.label : undefined) ?? '',
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
      const official = officialId != null ? officialInfoById.get(officialId) : undefined
      const sg = sgId != null ? sgById.get(sgId) : undefined
      const label = lessonDisplayName(official?.substrandName, p.title)
      // The panel groups these with the SAME `groupLessons` the library catalogue uses, so a plan
      // carries curriculum coordinates rather than a pre-formatted scope string. A plan with no
      // Official version (the Repair case below) has no coordinates — it lands in an "Other" strand
      // sorted last, and stays deletable, which is the whole point of listing it.
      planRows.push({
        id: p.id,
        substrandName: label,
        substrandId: official?.substrandId ?? '',
        strandName: official?.strandName ?? null,
        subjectName: sg?.subjectName ?? UNKNOWN_SUBJECT,
        grade: sg?.grade ?? null,
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
  // something gets here. A bare "You have no saved versions." tells a teacher new to editing access nothing.
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
  // knows what the list is. A teacher with editing access still sees it empty — for them the copy above is instructional,
  // and this list is their only route back to unfinished work.
  const showSaved = candidates.length > 0 || !isAdmin

  /**
   * The panel ids this caller's page ACTUALLY renders, in render order — the role gate for the
   * accordion (D7a).
   *
   * ⚑ This list and the JSX below must agree, and the agreement is what makes "unknown, stale or
   * role-inaccessible ids are ignored silently" true by construction: an id the server never rendered
   * can never be opened, whatever a shared URL asks for, with no second role check on the client. A
   * panel added below without a matching entry here simply refuses to open, which is the failure
   * direction to prefer — but it is still a defect, so keep the two in step.
   *
   * ⚑ Note this is DATA-dependent, not only role-dependent: `versions` is absent for an administrator
   * with nothing to tidy (`showSaved`), and `plans.repair` only exists while some plan has no Official
   * pointer. "A Site Admin has N panels" is not a true statement about this page.
   */
  // One entry per `AccordionPanel` below, in the same order and with the same condition, so the two
  // can be diffed by eye. Typed `PanelId`, so a typo is a compile error rather than a panel that
  // silently refuses to open.
  const availablePanels = (
    [
      siteAdmin && 'curriculum',
      editorGroups.length > 0 && 'access',
      siteAdmin && 'plans',
      siteAdmin && 'plans.upload',
      siteAdmin && 'plans.delete',
      siteAdmin && repairPlans.length > 0 && 'plans.repair',
      showSaved && 'versions',
    ] satisfies (PanelId | false)[]
  ).filter((id): id is PanelId => id !== false)

  // Resolve the accordion's opening state HERE, on the server. Deriving it on the client instead
  // produced a genuine hydration mismatch — server "closed" against client "open" — which React
  // reports and does NOT patch up; deferring it to an effect would instead make every deep link
  // visibly flash open after paint. Server-resolved, a shared `?open=…` link renders in its final
  // shape on first paint, the same property the frontend's `LibraryBrowser` has for its filters.
  //
  // ⚑ The query comes from the `searchParams` PROP, not from `req`. `PayloadRequest` does expose a
  // `search`, and it is EMPTY here — verified in the browser (2026-08-17), where a deep link silently
  // opened nothing and then had its query scrubbed away. `@payloadcms/next`'s Root view awaits Next's
  // `searchParams` and passes it to the custom view as its own prop
  // (`views/Root/index.js`), which is the only copy that carries the page's query.
  const { open: serverOpen, at: serverAt } = resolveServerPanelState(searchParams, availablePanels)

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
          gets Editing access → Candidate versions, an Editor only their saved versions).
          Each section is now a disclosure panel (D7); the ORDER is unchanged. */}
      <AccordionProvider
        available={availablePanels}
        initialOpen={serverOpen}
        initialAt={serverAt}
      >
        {/* Plain `&` in the title — a JSX attribute string is not HTML, so it needs no entity and
            must not carry one (the accessible name is matched literally by the E2E role queries). */}
        {siteAdmin && (
          <AccordionPanel id="curriculum" title="Curriculum & people">
            <ul className="lp-admin-dash__actions">
              <li>
                <Link className="lp-admin-dash__action" href="/admin/collections/users">
                  <span className="lp-admin-dash__action-label">Users</span>
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
          </AccordionPanel>
        )}

        {editorGroups.length > 0 && (
          <AccordionPanel id="access" title="Editing access">
            <p className="lp-manage__desc">
              Who may edit lesson plans, per subject grade. Granting access lets a teacher edit;
              removing it returns them to view-only.
            </p>
            <EditorsWidget groups={editorGroups} />
          </AccordionPanel>
        )}

        {/* Upload / Delete / Repair are three operations on ONE noun, so they sit under a single
            "Lesson plans" section. They were h3 sub-headings; they are now NESTED panels (D7 names
            Lesson Plans as one of the two places nesting is warranted). The heading rank and 18px
            size are unchanged — `AccordionPanel` derives both from the dotted id, so the documented
            hierarchy step survives the change of mechanism without being restated per call site.
            Repair is last: it is conditional and rare. */}
        {siteAdmin && (
          <AccordionPanel id="plans" title="Lesson plans">
            <AccordionPanel id="plans.upload" title="Upload lesson plans">
              <UploadBundles />
            </AccordionPanel>

            <AccordionPanel id="plans.delete" title="Delete lesson plans">
              <p className="lp-manage__desc">
                Deleting a lesson plan removes ALL of its saved versions. This cannot be undone.
              </p>
              <DeletePlansPanel rows={planRows} />
            </AccordionPanel>

            {repairPlans.length > 0 && (
              <AccordionPanel id="plans.repair" title="Repair">
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
              </AccordionPanel>
            )}
          </AccordionPanel>
        )}

        {showSaved && (
          <AccordionPanel id="versions" title={savedTitle}>
            <p className="lp-manage__desc">{savedDesc}</p>
            <CandidateList rows={candidates} emptyText={savedEmpty} showAuthor={isAdmin} />
          </AccordionPanel>
        )}
      </AccordionProvider>
    </Gutter>
  )
}
