# Start here — current state and the next phase

You are picking up the **ARES Lesson Library (Lesson3)**: a versioned lesson-plan repository that
uploads ARES CBE lesson plans as structured data, lets teachers view them and — with **editing
access** — edit them under field-level permissions, keeps immutable versions with one **Official**
version per plan, and exports high-fidelity DOCX/PDF through ARES's own generator. Node/TypeScript +
Payload CMS (Postgres) end to end.

**Read first, in order:** `AGENTS.md` (stack, commands, the isolated local test stack) → `CLAUDE.md`
(operating rules and design law) → `SPEC.md` (canonical; for current work, §5 "Drafts" and §6
"Combine versions") → this file → the newest entries of `docs/DECISIONS.md`. **DECISIONS is long:
read the newest five or six entries and search it for the area you touch; never end to end.**

⚑ **Vocabulary.** Three user types — Teacher, Subject-grade administrator, Site administrator; a
Teacher *with editing access* is not a fourth type (SPEC §8). A **draft** is private, unnumbered work
(edit recovery); a **version** is a numbered save, never called a draft (SPEC §5, §13).

History before 2026-10-18 lives in `docs/archive/NEXT-SESSION-HISTORY-2026-06-TO-10.md` — a record,
not instructions. Older references to "see NEXT-SESSION" for a dated item mean that file.

---

# CURRENT STATE — 2026-10-18

**Base:** fetched `origin/main` at `3472843` (merged #408/#406 plus the modes/connectivity/network
note). #409 was merged after operator approval and green CI as `7169f84`; it includes both
documentation histories and the ordinary-save copy-text client fix at `a0ff598`. Its local proof passes: types/lint/format,
build, 1,607 unit, 314 integration, 400 wire (+4 existing SMTP skips), 123 full browser cases without
retries; all six focused save-browser cases also pass. #409 CI is green and the merge is complete.

**Current branch:** `feat/ares-release-combine`, the separate §8 release work, complete and ready
for review. The operator approved existing `sourceVersion` plus audited unambiguous backfill.
Re-ingest selects the previous release under the plan lock; the metadata-only migration repairs
consecutive unlinked majors and descendant lineage, reporting gaps/ambiguity and preserving
snapshots, timestamps, Official and deleted ids. The engine selects the sole changed resource side
with a usable ancestor while protecting row correspondence and administrator/system ownership.
Proof passes: types/lint/format/build, **1,616 unit, 316 integration, 398 wire (+4 existing SMTP
skips), 122 browser tests without retries**. The real migration and three-way re-ingest path pass;
tracked test configuration is restored. See
[`DESIGN-ares-release-combine-2026-10-19.md`](DESIGN-ares-release-combine-2026-10-19.md).
Operator review approves the core but requires a documented no-op migration down and a distinct
opposite-side administrator/resource refusal with wording approved first. Do not merge #410.
#411 was approved and refreshed onto merged #409 at `51ce703`, preserving both docs histories;
local types/lint/format and 1,613 combined unit tests pass; fresh CI must pass before its authorized
merge. **Full phase 4 is not approved. #412 is closed without merging. Keep Save → Combine.**
Preserve both designs as deferred until teacher use justifies them. After #410 fixes, widen the
small advice-only hint to common-ancestor versions, preferring a newer ingested release; approve
wording first. No frozen-input migration, transfer endpoints or reducer rewrite.
The operator reports prior merges are being deployed; completion has not been confirmed.

**Deployed state (operator-confirmed in main's `23a997c` handoff):** Combine phases 1–3b,
review corrections (#401), simplification/restore retry (#403), the dark-mode Back fix (#402), and
the Next.js 16.4.2 / Payload 3.91.0 security upgrade (#399) were deployed to the Rock on 2026-10-18.
The `combine_lineage` and `combine_draft_context` migrations ran in that deployment window.
Insert link Plan A is merged; its deployment has not been confirmed.

**Insert link Plan A:** approved wording, HTTP/HTTPS, four framework columns, optional label,
ARES/tracker normalization, Combine hiding, opt-in Rock PDF picker. Only explicit
`PDF_LIBRARY_PUBLIC=1` makes configured files public, independently of Explore; listing remains
authenticated. An absent publication flag keeps file opening authenticated. No new migration,
dependency or generator change. Plan A+ document-time rewriting is deferred. `ares.edu` is not a default alias pending an
answer from the ARES team.

The screen picks two versions, reviews automatic changes and conflicts, and opens the engine's
starting version (URL included). Conflict choices name version numbers and can change until Save;
Write my own starts from the editing version. Save stays blocked until choices are complete, never
offers parent deletion, creates Not Official, and leaves Official unchanged. Already-included
messages require equality with the descendant after applying the engine's overlay.

Unfinished combinations capture only the second-parent id and resolved field keys (64 KiB cap),
atomically with draft prose. Restore returns bounded, untrusted metadata; the screen's preview
reauthorizes it and computes conflicts once. Temporary failures retain the second parent and offer
Retry combination; confirmed unavailable second parents yield ordinary drafts with an explanation.
**Operator decision: do not retain drafts after the editing source is deleted.** Keep the existing
cascade; an editor still open explains a failed save and leaves text available for copying.

**Review fixes in #404:** resolved-origin checks for tracker targets, exact ARES origins/ports/path
prefixes, shared normalized URL parsing, signature-first PDF streaming and oversized-file 404.
`docker-compose.test.yml` now mounts a committed valid PDF; the wire happy path is mandatory.
The operator applied the one-line workflow change in
[`CI-PDF-FIXTURE-WORKFLOW-EDIT.md`](CI-PDF-FIXTURE-WORKFLOW-EDIT.md). CI passed with the fixture configured.

**Unavailable-parent follow-up:** save-as-new returns its own JSON 404 with
`unavailable: 'source' | 'secondParent'`, retaining the existing error message. Both parents are
rechecked under the plan lock, source first; deleted/unreadable versions are indistinguishable.
Editing access is checked immediately after refreshing the caller, before those reads; revoked
access plus a deleted source returns 403 without unavailable metadata. Rollback stays in the catch.
The client consumes that response with no parent probes. Unknown 404s retain provenance for retry;
only `secondParent` makes the live combination ordinary. Source deletion still removes its draft.
Validation after review corrections: types, lint, format, production build, **1,575 unit tests**,
**313 integration tests**, **396 wire tests + 4 existing SMTP skips**, and **113 browser tests
without retries** all passed. The wire tests assert the exact built-app JSON and source precedence
when both parents disappear during a plan-lock wait. Revoked access plus a deleted source returns
403 without unavailable metadata; cross-plan, stale and no-op errors also carry no marker. Endpoint
unit tests cover unreadable parents and ensure revoked access prevents parent re-reads.
Tracked test configuration was restored. No dependency or schema change.

Use an isolated stack with both a distinct project name and port: Codex uses `lesson3-codex-probe`,
`127.0.0.1:3103`. Claude uses a separate clone and stack. Never tear down another agent's stack.
Always fetch before comparing branches or commits.

**Small draft-to-Combine hint:** an ordinary restorable draft can name the highest numeric readable
newer same-plan descendant of its source, using recorded lineage. After restoring and saving as a
numbered version, **Combine with {newer}** opens the existing review through `?combineWith=`. It
never starts Combine automatically. No migration, endpoint, frozen input or state-machine rewrite.
The full design remains [deferred until teachers need it](DESIGN-update-draft-2026-10-19.md).

## Remaining work — latest operator order

1. #409 is merged as 7169f84 after green CI. Merge approved #411 once refreshed CI passes.
2. Finish #410's two review fixes: migration down is a documented no-op, and opposite-side
   administrator/resource changes get an accurate distinct refusal. Wording approval is pending.
   Push ready; do not merge or deploy #410.
3. Then widen #406's hint: newest readable newer same-plan version sharing a common ancestor,
   preferring a newer ingested release. Preserve owner/ordinary/restorable/editing-access guards,
   excluding unfinished Combine. Advice only; no migration or endpoint. Approve wording first.
   Prove unit, integration and browser behavior including teacher 1.0.1 versus next ARES release.
   Separate ready PR; do not merge or deploy.
4. Full phase 4 is not approved; #412 is closed. Keep both designs as deferred until teacher use
   justifies them. No new input storage, transfer operations or Combine state rewrite.
5. Modes, connectivity, identity and school networking remain direction only; Plan A+, stable row
   identity and structural drafts remain deferred. ARES hardware installation/backup remains an
   operations priority with the operator; ask ARES about ares.edu.

Nonblocking #410 follow-ups: filter plans with an unlinked whole major > 1; recompute only affected
release descendants in id order and remove linear row lookups; consolidate re-ingest's history
reads; scope the migration integration test to its own plan and clean its user in finally; remove
impossible duplicate-major handling and duplicate release regexes. Add a system-written release
marker before any manual version-bump control ships. No extra cleanup is required for these two fixes.

**Other deferred work from /simplify (2026-10-18), each its own change:** a `ConflictSides`
component for duplicated version-side markup; one module-level scope/whitelist table for
`captureFieldPath` and `applyCapture` in `lib/editRecovery/projection.ts`. The unavailable-parent
response is implemented in #405; the Combine state machine stays deferred with full direct draft
updates.

**Separate follow-ups:** #409 addresses the previously deferred ordinary-save deletion race.
Routine reads also load lineage; consider narrower projections
if plans reach hundreds of versions. Backfill batching is optional at much larger histories.
Lineage keeps the newest 2,000 ids and full windows conservatively use two-way comparison.

The strict row matching rule accepts all 95 current ARES plans (806 lessons). Refusals follow
administrator structural edits such as duplicated lessons or repeated/renamed phases. Recheck
future exports with the operator's `/tmp/ares-scan-tools/scan.py <folder of ARES JSON>`.

## Standing constraints

- Feature branch; no merge or deployment unless asked. Push and ready PR are authorized.
- Plan first for non-trivial work. All new screen wording was approved for phase 3b.
- Prove changes with types, lint, format, unit, integration, wire and browser checks on an isolated
  stack. Changed endpoints need wire-level authorization tests in the same PR.
- Credentials cannot push `.github/workflows/` changes; hand those to the operator.
- Next.js is 16.4.2 and Payload 3.91.0. Eight moderate dependency advisories remain; no high/critical.
- Read SPEC §5 and §6 for the canonical draft and Combine contracts. Search DECISIONS for the area
  touched; do not read it end to end.

## Handoff prompt

> Pick up Lesson3. Fetch; read AGENTS → CLAUDE → SPEC §5/§6 → this file and recent DECISIONS.
> #409 is merged. #411 refreshed at 51ce703 is approved for merge once CI passes. #410 needs two
> review fixes (no-op down; accurate separate protected-side refusal), with wording approval pending.
> Then widen the advice-only hint for common ancestors/newer releases in a separate ready PR.
> Full phase 4 is rejected/deferred; #412 is closed. Preserve both design docs. No deployment;
> do not merge #410 or the hint. Use only lesson3-codex-probe:3103.
