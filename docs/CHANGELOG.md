# Changelog

Concise record of delivered product changes, newest first. Detailed implementation history through
2026-07-28 is preserved in
[`docs/archive/BUILD-HISTORY-2026-06-TO-07.md`](archive/BUILD-HISTORY-2026-06-TO-07.md).

- Current state and next work: [`docs/NEXT-SESSION.md`](NEXT-SESSION.md)
- Decisions and reasoning: [`docs/DECISIONS.md`](DECISIONS.md)
- Architecture and domain rules: [`SPEC.md`](../SPEC.md)

## 2026-07-28 — plain-language editor and consistent navigation (committed; deploy pending)

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
