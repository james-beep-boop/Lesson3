import React from 'react'
import Link from 'next/link'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'

import { isSiteAdmin, subjectGradeIdsByRole } from '../../access'
import { deletableVersionsWhere } from '../../access/versioning'
import { resolveAccessSummary } from '../../lib/accessScopes'
import { assignmentCountsBySubjectGrade, NO_ASSIGNMENTS } from '../../lib/assignmentCounts'
import { collectBackupStatus } from '../../lib/backupStatus'
import { collectSystemFacts } from '../../lib/systemFacts'
import { relId, distinctIds } from '../../lib/relId'
import { lessonDisplayName } from '../../lib/substrand'
import type { User } from '../../payload-types'
import UploadBundles from '../UploadBundles'
import { CandidateList, type CandidateRow } from './CandidateList'
import { DeletePlansPanel, type PlanRow } from './DeletePlansPanel'
import { buildRolesAccess } from '../../lib/editorGroups'
import { startRenderTimings } from '../../lib/renderTimings'
import { RolesAccessPanel } from '../Manage/RolesAccessPanel'
import { BackupStatusPanel } from '../Manage/BackupStatusPanel'
import { SystemFactsPanel } from '../Manage/SystemFactsPanel'
import { SystemFeaturesPanel } from '../Manage/SystemFeaturesPanel'
import type { FeatureValues } from '../Manage/systemFeaturesState'
import { SAVEABLE_FLAGS } from '../../lib/systemFlagNames'
import { readFeaturesSettings } from '../Manage/readFeaturesSettings'
import { AccordionPanel, AccordionProvider } from '../Manage/Accordion'
import { resolveServerPanelState, withAncestors, type PanelId } from '../Manage/panelState'
import {
  SubjectsAndGradesPanel,
  type SubjectRow,
  type SubjectGradeRow,
} from '../Manage/SubjectsAndGradesPanel'
import { UsersPanel } from '../Manage/UsersPanel'
import { UnsavedWorkList, type UnsavedWorkItem } from '../Manage/UnsavedWorkList'
import { ClockCheck } from '../Manage/ClockCheck'
import { listUnsavedWork } from '../../lib/editRecovery/unsavedWork'
import {
  listPersonalVersions,
  versionActions,
  type VersionActions,
} from '../../lib/personalVersions'
import { captureKeptUntil } from '../../lib/editRecovery/ttl'
import { formatDay } from '../../lib/formatDate'
import { countAwaitingApproval } from '../../lib/awaitingApproval'
import { readInstallationId } from '../../lib/identity/installationId'

/**
 * Manage — THE role-scoped functions page (IA redesign, DECISIONS 2026-07-01 "late"), replacing the
 * old quiet dashboard. ONE scrollable page of stacked sections, strictly cumulative by role;
 * everything else in the product happens in the library (`/`) and on the lesson page.
 *
 * The per-section rationale lives at each section in the JSX rather than in a second inventory here,
 * which drifted the last time the order changed — and drifted again by 2026-08-18, when this header
 * still described five flat sections (two under names that were never panel titles) after the page had
 * become groups of nested panels. The inventory is gone rather than corrected; the ⚑ above
 * `AccordionProvider` is the one account of the shape, and it deliberately gives no box COUNT —
 * availability is data-dependent, so every count written here has gone stale. Two claims worth keeping out of the JSX:
 *
 *   - The cleanup queue's scope mirrors `lessonBundleVersionDelete` EXACTLY, because both come from
 *     `deletableVersionsWhere` — no row is shown that the server would refuse to delete. It is read
 *     for administrators only. A person's OWN versions are a separate query
 *     (`lib/personalVersions.ts`, Proposal B 2026-10-22): ownership, not delete authority.
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
  // Same test as Sign up, Sign in and Forgot password. Without SMTP (an offline school server) new
  // accounts wait for a Site Administrator's approval rather than an emailed link (2026-10-19).
  const emailEnabled = !!process.env.SMTP_HOST?.trim()
  const [
    // ⚑ `typeLabel` is deliberately NOT taken. The user type stopped being printed beside the page
    // title on 2026-08-18 (operator decision): a signed-in user knows which kind of account they hold,
    // and the avatar menu states it on every page anyway — this page said it a second time, in the
    // one position on the page reserved for the page's own identity. `resolveAccessSummary` still
    // returns it, unchanged, for the menu; only the `lines` half is rendered here. The truthfulness
    // contract documented in `AppNav` is about that menu and is untouched.
    { lines: roleLines },
    versionsRes,
    rolesAccess,
    plansRes,
    taxonomySubjectsRes,
    taxonomyGradesRes,
    assignmentCounts,
    systemFacts,
    backupStatus,
    systemSettings,
    unsavedWork,
    personalVersions,
    awaitingApproval,
    installationId,
  ] = await Promise.all([
    t.time('accessSummary', () => resolveAccessSummary(req.payload, user)),
    // ---- Delete individual versions (an administrator's cleanup queue) ----
    // Administrators only since Proposal B: a teacher's own versions are `personalVersions` below.
    deletable === false || !isAdmin
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
    // `buildRolesAccess` (lib/editorGroups.ts) owns the gate, the `overrideAccess: true` read and
    // the client projection together, because the email carve-out is only sound while they cannot be
    // separated — inlined here it was an emergent property of several conditions consulting the same
    // general-purpose `isAdmin`. It returns [] for a non-administrator without querying, and it is
    // covered per-role by `tests/int/editorGroupsAccess.int.spec.ts`.
    t.time('rolesAccess', () => buildRolesAccess({ payload, user })),
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
    // ---- Taxonomy panels (PR 3) ----
    // ⚑ THE WHOLE TAXONOMY, not the subset the delete panel resolves further down. That lookup is
    // keyed by the subject-grades this page's CONTENT references; these panels edit the taxonomy
    // itself, so a subject with no grades yet — exactly the one an administrator is most likely to
    // be here to fix — would be missing from it. Two separate reads for two separate jobs.
    //
    // Server-loaded rather than lazy: D11 makes only the Users panel lazy and keeps every bounded
    // panel server-rendered, and a curriculum is tens of rows. The panels filter what is already
    // here instead of issuing a request per keystroke.
    siteAdmin
      ? t.time('taxonomySubjects', () =>
          payload.find({
            collection: 'subjects',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            sort: 'name',
            select: { name: true },
          }),
        )
      : null,
    siteAdmin
      ? t.time('taxonomyGrades', () =>
          payload.find({
            collection: 'subject-grades',
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            sort: 'displayName',
            select: { displayName: true, subject: true, grade: true },
          }),
        )
      : null,
    // Counts only — no identities, so this is a plain trusted aggregate rather than a second
    // `editorGroups`-style projection. It feeds the delete confirmation's cascade warning; see the
    // ⚑ in lib/assignmentCounts.ts for why that warning exists at all.
    siteAdmin ? t.time('assignmentCounts', () => assignmentCountsBySubjectGrade(payload)) : null,
    // ---- Manage → System (Site-Admin only) ----
    // Computed, never stored, and skipped entirely for everyone else — it probes the PDF sidecar over
    // the network and stats the artifact cache, which nobody but a Site Admin can see the result of.
    // `collectSystemFacts` never throws; a failed probe reports `unknown`.
    siteAdmin ? t.time('systemFacts', () => collectSystemFacts()) : null,
    // Host-written records and the restore journal, read through the read-only `out/ops` mount, plus
    // the agreement settings. Never throws: an unreadable record is simply absent (design A5).
    siteAdmin ? t.time('backupStatus', () => collectBackupStatus()) : null,
    // Never throws: a failed read renders Features as "unavailable" (`readFeaturesSettings`).
    siteAdmin ? t.time('systemSettings', () => readFeaturesSettings(payload, { user, req })) : null,
    // ---- Your Drafts (every role that can edit; empty for everyone else) ----
    // The CALLER's own captures only — `listUnsavedWork` keys on `user.id` and re-applies the read
    // and editing-access gates the restore path would. See `lib/editRecovery/unsavedWork.ts`.
    user ? t.time('unsavedWork', () => listUnsavedWork(req, user)) : [],
    // ---- My saved versions (every role): the caller's own, with per-row actions ----
    user ? t.time('personalVersions', () => listPersonalVersions(req, user)) : [],
    // ---- Accounts awaiting approval (Site-Admin only) ----
    // A count, no identities. Only an email-less site needs it surfaced: elsewhere a new account
    // confirms its own emailed link, and nothing is waiting on an administrator.
    siteAdmin && !emailEnabled ? t.time('awaitingApproval', () => countAwaitingApproval(req)) : 0,
    // ---- Installation id (Site-Admin only; never throws) ----
    siteAdmin ? t.time('installationId', () => readInstallationId(payload)) : null,
  ])
  const versionDocs = versionsRes?.docs ?? []
  // Hoisted beside the other unwraps because `sgById` below reads it for a Site Admin — see wave 2.
  const taxonomyGradeDocs = taxonomyGradesRes?.docs ?? []
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
    // Labels for "Your Drafts" and "My saved versions" ride this lookup rather than queries of their own.
    ...unsavedWork.map((w) => w.subjectGradeId),
    ...personalVersions.map((v) => v.subjectGradeId),
  ])
  const authorIds = distinctIds(versionDocs.map((v) => relId(v.author)))
  const officialIds = distinctIds(planDocs.map((p) => relId(p.officialVersion)))
  // Official pointers drive the candidate exclusion below. A Site Admin's plans fetch already carries
  // every plan, so reuse it; other roles have no plans fetch, so look up only the plans their own
  // versions reference.
  const exclusionPlanIds = siteAdmin ? [] : distinctIds(versionDocs.map((v) => relId(v.lessonPlan)))

  const [sgRes, authorRes, exclusionRes, officialMetaRes] = await Promise.all([
    // ⚑ SKIPPED FOR A SITE ADMIN, who already holds every subject-grade from the taxonomy read in
    // wave 1 with this exact projection. PR 3 introduced that superset read and left this subset
    // query running beside it — two concurrent scans of one table for one page.
    sgIds.length === 0 || siteAdmin
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
  // ⚑ THIS WAVE IS GONE, and it was the page's ONLY sequential await outside a barrier. It existed
  // because the subject ids lived on the subject-grade rows fetched in wave 2 — a real dependency
  // when written, and gated `siteAdmin` because only the delete panel needed it. PR 3 then fetched
  // EVERY subject in wave 1, for the same role, with the identical projection and access posture,
  // which made this read a strict subset of data already in memory and its serialising dependency
  // false. A Site Admin's Manage render now runs two DB waves instead of three.
  const subjectNameById = new Map<number, string>()
  for (const s of taxonomySubjectsRes?.docs ?? []) if (s.name) subjectNameById.set(s.id, s.name)
  /**
   * subject-grade id → every display field the rows on this page read off it: the stored
   * `displayName` for candidate rows, and the subject name + grade the delete panel's curriculum
   * grouping needs. ONE map keyed by subject-grade id rather than two built from the same docs —
   * and one home for the missing-subject fallback.
   */
  const sgById = new Map<number, { label: string; subjectName: string; grade: number | null }>()
  // One source or the other, never both: a Site Admin has the whole taxonomy from wave 1, every
  // other role has the referenced subset from wave 2.
  for (const sg of sgRes?.docs ?? taxonomyGradeDocs) {
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
  const sgLabelOf = (id: number | null) => (id != null ? sgById.get(id)?.label : undefined) ?? ''
  /** The client row's action fields from the server's decision (`versionActions`). */
  const actionFields = ({ official, officialVersionId, canDelete, canEdit }: VersionActions) => ({
    isOfficial: official === 'yes',
    officialVersionId,
    canDelete,
    canEdit,
  })

  const unsavedRows: UnsavedWorkItem[] = unsavedWork.map(
    ({ capturedAt, subjectGradeId, ...rest }) => ({
      ...rest,
      sgLabel: sgLabelOf(subjectGradeId),
      capturedOn: formatDay(capturedAt),
      keptUntil: formatDay(captureKeptUntil(capturedAt)),
    }),
  )
  const candidates: CandidateRow[] = versionDocs.flatMap((v) => {
    // Officials are not candidates (and are undeletable): only rows KNOWN to be non-Official.
    // ⚑ Fails CLOSED on an unresolvable plan (`'unknown'`). The previous version read the POPULATED
    // plan and returned `plan == null || …`, i.e. KEEP when it could not tell — which at depth 0 would
    // have listed every Official as deletable, breaking this module's "no row the server would refuse"
    // contract. `lessonPlanRead` is `Boolean(user)`, so every plan behind a visible version is
    // readable and this map is always complete; an absent id is a can't-happen, not a routine case
    // being quietly dropped. Pinned by manage.e2e.spec.ts. The same `versionActions` decides the
    // personal list's rows, so the two lists cannot disagree about a version.
    if (!user) return []
    const actions = versionActions(user, v, officialByPlan)
    if (actions.official !== 'no') return []
    const authorId = relId(v.author)
    return [
      {
        id: v.id,
        lessonPlanId: relId(v.lessonPlan),
        label: lessonDisplayName(v.meta?.substrand_name, v.title),
        semver: v.semver ?? '',
        sgLabel: sgLabelOf(relId(v.subjectGrade)),
        authorName: (authorId != null ? authorNameById.get(authorId) : undefined) ?? null,
        savedAt: v.createdAt ? formatDay(v.createdAt) : '',
        ...actionFields(actions),
      },
    ]
  })
  // The caller's own versions; every action decided on the server (`lib/personalVersions.ts`).
  const personalRows: CandidateRow[] = personalVersions.map(
    ({ subjectGradeId, createdAt, official, officialVersionId, canDelete, canEdit, ...v }) => ({
      ...v,
      sgLabel: sgLabelOf(subjectGradeId),
      authorName: null,
      savedAt: createdAt ? formatDay(createdAt) : '',
      ...actionFields({ official, officialVersionId, canDelete, canEdit }),
    }),
  )

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

  // Empty state carries the explanation the list would otherwise have to: what belongs here and how
  // something gets here. A bare "You have no saved versions." tells a teacher new to editing access nothing.
  //
  // ⚑ It names SAVING, not Edit. The first draft said "choose Edit, and your saved work will appear
  // here" — but entering edit mode creates nothing. A row appears only when someone SAVES, so copy
  // that stops at Edit describes a step that leaves the list exactly as empty as before, and reads as
  // a broken promise to the person waiting for a row.
  //
  // "My saved versions" is shown to every role, empty or not (Proposal B), so this is everyone's copy.
  const savedEmpty =
    'You have no saved versions yet. Open a lesson plan, choose Edit, then save your changes. Your saved work will appear here.'
  // An administrator with nothing to tidy gets no cleanup section at all (2026-08-04, page-length
  // request): heading + description + empty state spent three rows saying "nothing here" to someone
  // who already knows what the list is.
  const showCleanup = isAdmin && candidates.length > 0

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
   * with nothing to tidy (`showCleanup`), and `plans.repair` only exists while some plan has no Official
   * pointer. "A Site Admin has N panels" is not a true statement about this page.
   */
  /**
   * The taxonomy panels' rows (PR 3).
   *
   * `subjectGradeCount` is tallied from the grades list already fetched rather than counted per
   * subject: it exists only to tell an administrator why `guardSubjectDelete` will refuse — a Subject
   * cannot be deleted while grades still belong to it — and one pass over a bounded list beats one
   * query per row for a number that is advisory either way.
   */
  const gradeCountBySubject = new Map<number, number>()
  for (const doc of taxonomyGradeDocs) {
    const subjectId = relId(doc.subject)
    if (subjectId != null)
      gradeCountBySubject.set(subjectId, (gradeCountBySubject.get(subjectId) ?? 0) + 1)
  }
  const taxonomySubjects: SubjectRow[] = (taxonomySubjectsRes?.docs ?? []).map((doc) => ({
    id: doc.id,
    name: doc.name,
    subjectGradeCount: gradeCountBySubject.get(doc.id) ?? 0,
  }))
  const taxonomyGrades: SubjectGradeRow[] = taxonomyGradeDocs.flatMap((doc) => {
    const subjectId = relId(doc.subject)
    // A subject-grade with no resolvable subject cannot be edited by a form whose subject control is
    // a picker over known subjects, so drop it rather than render a row whose Save would be a guess.
    // `subject` is required and NOT NULL, so this is unreachable rather than expected.
    if (subjectId == null || doc.grade == null) return []
    return [
      {
        id: doc.id,
        // ⚑ `||`, NOT `??` — and I wrote the ⚑ recording exactly this in `endpoints/userSearch.ts`
        // during PR 2b, then copied the pre-fix spelling here. `displayName` can be a present EMPTY
        // string, which `??` passes through. Not cosmetic on this row: the same value becomes the
        // delete button's accessible name and the confirmation sentence, so an empty one yields a
        // destructive control called "Delete " and a dialog reading "Delete ? This cannot be undone."
        displayName: doc.displayName || `Subject grade ${doc.id}`,
        subjectId,
        grade: doc.grade,
        assignments: assignmentCounts?.get(doc.id) ?? NO_ASSIGNMENTS,
      },
    ]
  })

  // One entry per LEAF `AccordionPanel` below, in the same order and with the same condition, so the
  // two can be diffed by eye. Typed `PanelId`, so a typo is a compile error rather than a panel that
  // silently refuses to open.
  //
  // ⚑ THE GROUPS ARE DERIVED, NOT LISTED, and that is a correctness property rather than brevity.
  // A group must be available exactly when at least one of its children is: broader and it renders as
  // an empty box, narrower and `parseOpen` drops the visible children as orphans, so a deep link to a
  // panel the caller CAN see silently opens nothing. Hand-writing the disjunction states that rule in
  // a second place — `(siteAdmin || canSeeRolesAccess) && 'users'` was correct on the day it was
  // typed, and `siteAdmin && 'curriculum'` was only correct by coincidence, waiting for the first
  // child with a different gate. `withAncestors` IS this rule (it is what `parseOpen` uses to open a
  // nested panel's parents) and it returns render order, so the list stays diffable against the JSX.
  const canSeeRolesAccess = rolesAccess.groups.length > 0
  const availablePanels = withAncestors(
    (
      [
        siteAdmin && 'users.accounts',
        canSeeRolesAccess && 'users.access',
        siteAdmin && 'curriculum',
        // Every Manage user can edit somewhere (`canUseAdminPanel`), so both personal panels are
        // always present, empty or not (Proposal B).
        !!user && 'plans.mine',
        !!user && 'plans.drafts',
        siteAdmin && 'plans.upload',
        siteAdmin && 'plans.delete',
        showCleanup && 'plans.versions',
        siteAdmin && repairPlans.length > 0 && 'plans.repair',
        // `systemFacts &&`, the same clause the JSX uses — the ⚑ above asks for one spelling so the
        // list can be diffed against the render by eye. It is non-null exactly when `siteAdmin` is.
        !!systemFacts && 'system.deployment',
        !!backupStatus && 'system.backups',
        siteAdmin && 'system.features',
      ] satisfies (PanelId | false)[]
    ).filter((id) => id !== false),
  )

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
      {/* Just the title. The user-type line that used to sit beside it ("Manage · Site administrator")
          is gone — see the ⚑ on the `typeLabel` destructure above — and with it the `__head` flex row
          that existed only to put two elements on one baseline. The SCOPE lines below stay: those say
          something no other surface does. Copy rationale:
          docs/DESIGN-user-model-language-2026-07-29.md; why a site admin has no scope line: the ⚑ in
          lib/accessScopes.ts. */}
      <h1 className="lp-admin-dash__title">Manage</h1>
      {roleLines.length > 0 && (
        <div className="lp-admin-dash__identity">
          {roleLines.map((line) => (
            <p key={line} className="lp-admin-dash__scope">
              {line}
            </p>
          ))}
        </div>
      )}

      {/* SECTION ORDER: people and access work first, lesson-plan operations next. One order for every
          role; a role simply sees fewer sections (a Subject Admin gets Roles & Access plus Lesson
          plans, a teacher with editing access only Lesson plans).

          ⚑ GROUPS, NOT FLAT SECTIONS: Accounts + Roles & Access are one concern, Subjects + Subject
          grades another, and Lesson plans holds everything about plans — the caller's own saved
          versions and drafts first (`plans.mine`, `plans.drafts`, Proposal B 2026-10-22), then the
          administrators' operations, including the cleanup queue at `plans.versions` (top-level until
          the operator moved it; `docs/DECISIONS.md` 2026-08-27, and `panelState.ts` records the ids).

          ⚑ DO NOT WRITE A BOX COUNT HERE. How many top-level boxes exist is DATA-dependent, not just
          role-dependent: a Site Admin sees Users, Curriculum, Lesson plans and System, and previously
          also saw a Candidate versions box — but only while candidates existed (`showCleanup`). Every
          fixed count this comment has carried has gone stale, most recently by forgetting System. */}
      {/* Site Administrators only: an offline server's clock can drift years after a power cut. */}
      {siteAdmin && <ClockCheck />}
      {awaitingApproval > 0 && (
        <section className="lp-manage__awaiting" aria-labelledby="lp-awaiting-heading">
          <h2 id="lp-awaiting-heading" className="lp-manage__awaiting-title">
            {awaitingApproval === 1
              ? '1 new account is waiting for your approval'
              : `${awaitingApproval} new accounts are waiting for your approval`}
          </h2>
          <p className="lp-manage__desc">
            Teachers who sign up on this site cannot sign in until you approve them, because it does
            not send email.{' '}
            {/* A plain <a>, not next/link: a soft navigation keeps the already-mounted Accounts
                panel and its filter state, so the queue would not open. A full load renders the
                panel open (`?open=`) with the awaiting filter applied (`initialStatus`). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full load intended, see above */}
            <a href="/admin?open=users.accounts&at=users.accounts&accounts=awaiting">
              Review them in Accounts
            </a>
          </p>
        </section>
      )}

      <AccordionProvider available={availablePanels} initialOpen={serverOpen} initialAt={serverAt}>
        {(siteAdmin || canSeeRolesAccess) && (
          <AccordionPanel id="users" title="Users">
            {siteAdmin && (
              <AccordionPanel id="users.accounts" title="Accounts">
                <p className="lp-manage__desc">
                  Search and manage user accounts. Use Disable sign-in when a teacher leaves — this
                  preserves their history without deleting the account.
                </p>
                <UsersPanel
                  emailEnabled={emailEnabled}
                  // Arriving from the notice above opens the list on the approval queue; anywhere
                  // else it opens on every account, so searching for a colleague still finds them.
                  initialStatus={searchParams?.accounts === 'awaiting' ? 'awaiting' : ''}
                />
              </AccordionPanel>
            )}

            {/* ⚑ "Accounts", not "Users", and the rename is structural rather than cosmetic: this
                panel is now INSIDE a box titled "Users", and a row repeating its parent's label reads
                as a mistake. The word describes what the panel actually lists — every account,
                including disabled ones. "Roles & Access" keeps its name, which is vocabulary SPEC §8
                and CLAUDE.md both use. */}
            {canSeeRolesAccess && (
              <AccordionPanel id="users.access" title="Roles & Access">
                <p className="lp-manage__desc">
                  Who administers each subject grade and who may edit its lesson plans.
                </p>
                {/* ⚑ `'handover'` FOR EVERY NON-SITE-ADMIN WHO REACHES THIS LINE, and that is sound
                    only because of an invariant in another file: `buildRolesAccess` returns NOTHING to
                    a caller who administers no subject-grade (rule 1) and otherwise only the
                    subject-grades they administer (rule 2). So a non-Site-Admin rendering this panel
                    administers every group in it, and "may hand this one over" needs no per-group
                    check. `canSeeRolesAccess` is the same condition one level up.

                    That is a load-bearing dependency on a projection this component does not own, so
                    it is pinned rather than trusted: `tests/int/editorGroupsAccess.int.spec.ts` asserts
                    both rules against a real database. If either ever widened — a panel shown to a
                    teacher with editing access, say — this line would start offering handover controls
                    for subject-grades the viewer merely edits, and the server would refuse every one
                    of them (`enforceAssignmentScope`'s scope loop), so the failure is a broken-looking
                    UI rather than an authorization hole. */}
                <RolesAccessPanel
                  access={rolesAccess}
                  subjectAdminControl={siteAdmin ? 'full' : 'handover'}
                />
              </AccordionPanel>
            )}
          </AccordionPanel>
        )}

        {siteAdmin && (
          <AccordionPanel id="curriculum" title="Subjects and grades">
            <SubjectsAndGradesPanel subjects={taxonomySubjects} grades={taxonomyGrades} />
          </AccordionPanel>
        )}

        {/* Upload / Saved versions / Delete / Repair are operations on ONE noun, so they sit under a
            single "Lesson plans" section (D7 names Lesson Plans as one of the two places nesting is
            warranted). `AccordionPanel` derives heading rank and size from the dotted id, so the
            hierarchy step survives without being restated per call site. Repair is last: conditional
            and rare.

            ⚑ THE PARENT IS NOT SITE-ADMIN-GATED ANY MORE, and that is the whole point of this shape.
            It renders for anyone with at least one child available, so a teacher with editing access
            sees "Lesson plans" containing "My saved versions" and "Your Drafts" — the box and My saved
            versions auto-opened by `initialOpen`'s first-child rule, drafts closed with their count
            (operator decisions 2026-10-22). Each ADMIN child is therefore gated individually below;
            the box being open to a teacher must not open the operations in it. */}
        {/* ⚑ DERIVED FROM `availablePanels`, NOT RESTATED. `withAncestors` puts `plans` in that list
            exactly when one of its children is present, so deriving the gate means the box and the
            open-state vocabulary cannot disagree. `plans` has children with three different gates
            (`siteAdmin`, `showCleanup`, `siteAdmin && repairPlans.length > 0`); hand-writing that
            disjunction would need two edits per new child, silently required to match. */}
        {availablePanels.includes('plans') && (
          <AccordionPanel id="plans" title="Lesson plans">
            {/* The caller's OWN work, first, for every role (Proposal B). Subject and Site
                Administrators get exactly what a teacher gets here; their administrative lists
                follow. Counts are of the whole list, independent of its search box. */}
            {user && (
              <AccordionPanel id="plans.mine" title="My saved versions" count={personalRows.length}>
                <p className="lp-manage__desc">Versions you have saved, newest first.</p>
                <CandidateList
                  rows={personalRows}
                  emptyText={savedEmpty}
                  showAuthor={false}
                  showContinueEditing
                  searchLabel="Search my saved versions"
                />
              </AccordionPanel>
            )}

            {user && (
              <AccordionPanel id="plans.drafts" title="Your Drafts" count={unsavedRows.length}>
                <UnsavedWorkList rows={unsavedRows} />
              </AccordionPanel>
            )}

            {siteAdmin && (
              <AccordionPanel id="plans.upload" title="Upload lesson plans">
                <UploadBundles />
              </AccordionPanel>
            )}

            {siteAdmin && (
              <AccordionPanel id="plans.delete" title="Delete a plan (all versions)">
                <p className="lp-manage__desc">
                  Select the plans to delete. Every version of each selected plan is removed. This
                  cannot be undone.
                </p>
                <DeletePlansPanel rows={planRows} />
              </AccordionPanel>
            )}

            {/* Administrators only (both kinds — `isAdmin`, the same gate for the same queue; #306
                once omitted the Subject Administrator). Other people's versions, to be tidied, so no
                "Continue editing" button. An administrator with nothing to tidy gets no row at all
                (`showCleanup`), which is why this stays conditional. */}
            {showCleanup && (
              <AccordionPanel id="plans.versions" title="Delete individual versions">
                <p className="lp-manage__desc">
                  Open a saved version to review it, or delete one that is not currently Official.
                </p>
                <CandidateList
                  rows={candidates}
                  emptyText={savedEmpty}
                  showAuthor
                  showContinueEditing={false}
                  searchLabel="Search versions to delete"
                />
              </AccordionPanel>
            )}

            {siteAdmin && repairPlans.length > 0 && (
              <AccordionPanel id="plans.repair" title="Set an Official version">
                <p className="lp-manage__desc">
                  These plans have no Official version selected. Open a plan to choose which saved
                  version should be Official.
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

        {/* ⚑ LAST, because render order must match `PANEL_IDS` — `inRenderOrder` canonicalises
            `?open=` against that list, so a box out of order here would serialise its state in a
            position that does not match the page.

            Features offers only switches with an enforcement point and a Save endpoint. */}
        {siteAdmin && systemFacts && (
          <AccordionPanel id="system" title="System">
            {siteAdmin && (
              <AccordionPanel id="system.features" title="Features">
                {typeof systemSettings?.updatedAt === 'string' &&
                typeof systemSettings.features?.forumEnabled === 'boolean' ? (
                  <SystemFeaturesPanel
                    key={systemSettings.updatedAt}
                    initial={{
                      // Every saveable switch, read as stored; a missing value reads as off.
                      features: Object.fromEntries(
                        SAVEABLE_FLAGS.map((flag) => [
                          flag,
                          (systemSettings.features as Record<string, unknown> | null | undefined)?.[
                            flag
                          ] === true,
                        ]),
                      ) as FeatureValues,
                      updatedAt: systemSettings.updatedAt,
                    }}
                  />
                ) : (
                  <p role="alert">Settings are unavailable. Reload before changing them.</p>
                )}
              </AccordionPanel>
            )}
            {/* ⚑ THE PANEL ID STAYS `system.deployment` — it is a URL contract (`?open=…`) and a
                closed vocabulary in `PANEL_IDS`. Only the visible title changed to "Installation
                status", which is what an administrator would call this. */}
            <AccordionPanel id="system.deployment" title="Installation status">
              <p className="lp-manage__desc">
                This page shows how this installation of ARES Lesson Plans is set up, and whether
                the services it depends on are working. It is for information only — changes are
                made on the server, and most of these take effect only when it restarts. The last
                two rows are different: they report what is working right now. The smaller technical
                names are included for whoever maintains the server. Backups have their own box
                below.
              </p>
              <SystemFactsPanel facts={systemFacts} />
              {/* ⚑ NOT A FACT ROW. Every row above names the server setting that controls it, so an
                  administrator knows where to fix it; this identity has no setting and nothing to fix
                  (2026-10-19, `lib/identity/installationId.ts`). */}
              {installationId && (
                <p className="lp-manage__desc">
                  Installation ID: <code>{installationId}</code> — this installation’s permanent
                  identity, for joining a network of schools in the future. A restored backup keeps
                  it; a database copied to set up another school needs a new one.
                </p>
              )}
            </AccordionPanel>
            {backupStatus && (
              <AccordionPanel id="system.backups" title="Backups">
                <p className="lp-manage__desc">
                  What the backup records on this server show, one statement at a time. This page
                  reports status only; it cannot start a backup or restore data. Site Administrator
                  access does not grant access to the server command line or the private recovery
                  key. See the{' '}
                  <Link href="/guide?open=site-admins&at=site-admins.backups">
                    backup and recovery instructions
                  </Link>
                  .
                </p>
                <BackupStatusPanel status={backupStatus} />
              </AccordionPanel>
            )}
          </AccordionPanel>
        )}
      </AccordionProvider>
    </Gutter>
  )
}
