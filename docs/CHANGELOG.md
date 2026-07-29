# Changelog

Concise record of delivered product changes, newest first. Detailed implementation history through
2026-07-28 is preserved in
[`docs/archive/BUILD-HISTORY-2026-06-TO-07.md`](archive/BUILD-HISTORY-2026-06-TO-07.md).

- Current state and next work: [`docs/NEXT-SESSION.md`](NEXT-SESSION.md)
- Decisions and reasoning: [`docs/DECISIONS.md`](DECISIONS.md)
- Architecture and domain rules: [`SPEC.md`](../SPEC.md)

## 2026-07-29 — editing is a wider-screen affordance; 640px or narrower is view-only (deploy pending)

- At **640px or narrower**, lesson-content editing is unavailable: the lesson page's **Edit** button,
  the version editor's **Edit / Save / Cancel**, and the `?edit=1` deep link are hidden and replaced
  by a short notice that names the remedy ("rotate, widen the window, or open on a larger screen") —
  an explanation, not a silently missing button. Primary editing surface is laptops (1280×800,
  editable even unmaximised); phones are view-only.
- Progressive disclosure only — **not** an authorization boundary. Server RBAC is untouched, no
  endpoint gets a viewport check, and a landscape phone / "request desktop site" simply gets the
  cramped editor. **Make Official, Delete**, previews, Share, messaging, favorites, version history,
  user administration and everything else stay at every width.
- Behaviour: new edit intent is neutralised on initial load (a once-on-mount guard); an edit session
  already underway is not cancelled by a resize, so narrowing the window mid-edit keeps Save. No
  schema or data migration.

## 2026-07-29 — "Editor" reframed as editing access (presentation only; #160 merged, deploy pending)

- The user model now shows **three types** — Teacher, Subject-grade administrator, Site administrator
  (sentence case). "Editor" is no longer a type: a user whose only grant is `editor` shows as
  **Teacher** with a separate **"Editing access: …"** line; a subject admin's own scope shows under
  **"Administrator: …"**. Authorization, schema, endpoints, and the stored `editor` value are
  unchanged.
- The type + scope lines are resolved once in `lib/accessScopes.ts` and shared by the user menu and
  the Manage page, so the two surfaces can't drift. Site admins show one "All subjects and grades"
  line on both; a subject-grade you administer is never double-listed under editing access.
- Management copy, the request-editing email, the in-app guide (`#editors` anchor kept),
  `USER_GUIDE.md`, and `SPEC.md` §5/§8 were reworded to match. `payload-types.ts` regenerated for the
  one changed field description.
- No schema or data migration.

## 2026-07-29 — editor: drop the redundant description, Back onto the title row (#159; deploy pending)

- Removed the version editor's collection description ("Save button writes your edits as a new
  version…") — the same rule already lives in the **Editing help** modal, so the passive banner
  duplicated it. Regenerated `payload-types.ts`; the label test now asserts the description is gone.
- Moved **← Back to lesson** onto the "Editing: <title>" row at the top right; the
  Save/Cancel/preview/help buttons drop to the row beneath it. Matches the frontend's
  Back-next-to-title placement and removes the lonely wrapped row.
- No schema or data migration.

## 2026-07-29 — Back-button consistency follow-up (#158)

- Unified the Back control's appearance with shared fixed-size/font tokens: the frontend uses one
  `PageBackLink` component and the version editor a plain `<a>` carrying the same `.page-back`
  styling, so both look identical across the 16px frontend and 15px Payload roots.
- Navigation is the fastest correct one per surface: frontend Back uses Next `Link` for soft
  client-side navigation (no full reload); the editor's Back crosses root layouts — a full reload
  either way — so it stays a plain `<a>` rather than routing a guaranteed reload through `next/link`.
- Standardized placement at the top right. On lesson pages, Back now sits to the right of
  **Favorite/Favorited**.
- Moved the Guide's Back control from the footer to the top-right heading.
- Applied the same control to password recovery's **Back to sign in**. Close-tab preview guidance is
  the only workflow-specific exception.
- Approved the separate user-model language design: **Teacher**, **Subject-grade administrator**,
  and **Site administrator**, with editing access shown on its own scoped line. No authorization or
  schema change.

## 2026-07-28 — plain-language editor and consistent navigation (#157; deploy pending)

- Removed the repeated technical writing note from roughly forty fields and added one accessible
  **Editing help** dialog.
- Renamed technical editor headings (`META`, `UNIT`, `SLO`, and related labels) in teacher-facing
  language. Renamed Title to **Document title** and removed descriptions that explained internal
  storage rather than the teacher's task.
- Simplified the remaining People and Curriculum administration descriptions in the same plain-language
  pass.
- Hid system-numbered lesson and summary rows; their row headings already show the number.
- Renamed the editor previews **Quick preview ↗** and **Formatted PDF ↗**, with explicit new-tab
  guidance and a return-to-edits banner in the HTML preview.
- Made **Back to lesson plans** / **Back to lesson** prominent, consistently styled, top-right page
  actions on the lesson, comparison, and editor pages. Preview tabs deliberately have no Back link,
  which protects unsaved work in the original editor tab.
- Updated the in-app Guide and `USER_GUIDE.md`.
- A full code audit plus a four-angle `/simplify` pass followed: honest Modal-backdrop docs, a
  corrected toolbar comment, one de-duplicated `role="status"` announcement (the button already
  carries the "preparing" state), and a unified `.lesson-heading__actions` Back-button layout on the
  comparison page. `payload-types.ts` was regenerated on Node 22 so it is byte-clean generator output.
- No schema or data migration.

## 2026-07-28 — editor verification and permission correction (#154, #155)

- Live browser verification completed for the current-section indicator, collapsed lesson rows,
  Final Explanation / Summary Table tracking, focus behavior, mobile layout, and all three editing
  roles.
- Fixed a 6px toolbar/scroll-margin mismatch that caused a clicked lesson chip to highlight its
  neighbor. The script now reads the CSS value instead of duplicating it.
- The details sidebar now starts hidden, widening the editing column.
- The Edit button now appears only when the signed-in user can edit that subject-grade.

## 2026-07-25–27 — editor usability batch, first release (#150–#153)

- Added the active lesson/section indicator and collapsed lesson, phase, section, rubric, and summary
  rows by default.
- Cleared only obsolete stored collapse preferences so existing test accounts received the new
  default; other preferences and ownership were preserved.
- Hardened the deployment path: sidecar provenance is checked, Arial installation retries and is
  verified, and the deploy script has automated branch coverage.
- Corrected the preference cleanup to use Payload's Local API properly (`user` is an operation option,
  not document data).

## 2026-07-21 — security and runtime hardening (#128–#142)

- Made the browser end-to-end suite a CI gate.
- Made every unread message reachable so the unread badge can return to zero.
- Moved best-effort job enqueues outside the caller's transaction, preventing a failed enqueue from
  silently rolling back the primary write.
- Closed the forgot-password timing oracle with a fixed response-time floor.
- Fixed blocked-popup handling in both PDF-preview paths.
- Restored compile-time and runtime checks on detached job inputs.
- Treat orphaned artifact pre-warms as benign no-ops and closed the delete-between-reads race.
- Updated `sharp` to clear the applicable libvips security findings.

## 2026-07-20–21 — audit remediation and live resource cutover (#114, #119–#126)

- Added `/lessons` → `/` and `/manage` → `/admin` redirects while preserving lesson-detail routes.
- Denied direct caller creation of pointerless lesson plans.
- Removed a destructive legacy end-to-end fixture and an invalid PDF pixel gate.
- Moved the versions panel onto the shared accessible modal.
- Closed forgot-password account-existence leaks server-side and corrected mixed-case/padded address
  delivery.
- Made PDF preview stay busy until conversion actually finishes.
- Verified the Rock corpus: 42 plans, 42 Official 1.0.0 versions, 384 Official lessons, 1,950 resource
  rows, and zero unsafe URLs.

## 2026-07-19 — definitive ARES resource links (#108–#111)

- Adopted the definitive ARES JSON 1.0.0 lesson-level resource contract.
- Stored each lesson's five resource phases as native child rows, avoiding PostgreSQL's 100-argument
  reconstruction limit while keeping the external ARES shape unchanged.
- Preserved system-managed resource data when a Subject Administrator duplicates a lesson.
- Added contract, ingest, round-trip, HTTP, generator, hyperlink, and migration coverage.

## 2026-06-24–25 — Official-version model completed

- Backfilled the legacy corpus into `lesson-plans` plus immutable
  `lesson-bundle-versions`, with one Official pointer per plan.
- Moved teacher reading, preview, editing, comparison, export, and Make Official flows onto versions.
- Save now creates a new Not-Official version; existing versions are immutable.
- Retired the legacy `lesson-bundles` collection and its duplicate generator/endpoints.
- Split export into state-changing POST preparation and idempotent GET serving.

## 2026-06-22–24 — editor, library, PDF, and asynchronous export

- Added unsaved content preview, teacher reading view, array row labels, and editor field-level
  boundaries.
- Added PDF generation by converting the approved generated DOCX through the local Gotenberg office
  engine—no parallel renderer.
- Added artifact caching, background export jobs, concurrency limits, rate limits, and locked-down job
  administration.
- Rebuilt the library as a strand-first curriculum view and added the role-aware Manage dashboard.
- Unified login/navigation and simplified teacher downloads to Word/PDF with inline resources.

## 2026-06-17–22 — ARES contract and generated-document completeness

- Established the ARES 1.0.0 data contract and promoted contract drift from warning to hard ingest
  failure.
- Modelled the complete Sub-strand Overview fields and verified stored-data round trips.
- Added safe `.js`/`.json` extraction that parses data without executing uploaded code.
- Added the repeatable DOCX round-trip/fidelity gates.

## 2026-06-09–16 — foundation and first usable application

- Created the Payload CMS / Next.js / PostgreSQL application with role-based access control.
- Vendored and connected the byte-pristine ARES DOCX generator.
- Added safe ingest, native nested lesson fields, publishing/completeness rules, browser upload,
  content preview, DOCX export, branding, and idle sign-out.
- Proved the initial Biology lesson path from ingest through database storage to regenerated DOCX.
