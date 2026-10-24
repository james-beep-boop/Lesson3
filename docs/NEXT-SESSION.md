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

# CURRENT STATE — 2026-10-24

**#438 merged (2026-10-24, `7f5573b`): `undici` 7.30.1 and `happy-dom` 21.0.4 pinned by override**,
because new high advisories had turned `audit:prod` red. Why each was accepted, and when each
override comes out, is in DECISIONS 2026-10-24.

**Pending: Payload 3.92.0** (released 2026-10-22). Not yet taken; do it as its own change **after
the application audit cycle**, which is pinned to Payload 3.91.0. Checklist:

- Move `payload` and all five `@payloadcms/*` packages together.
- Re-derive or confirm the #436 typing patch strings. `patch-payload-ui.mjs` says they also match
  3.92.0; the install fails loudly if not. Then re-run the Rock typing benchmark.
- **Remove the `undici` override**: 3.92.0 pins 7.30.1.
- **Keep the `happy-dom` override**: 3.92.0 still uses Lexical 0.50.0, and 0.52.0 still wants 20.x.
- Check whether 3.92.0 contains payloadcms/payload#18775. If it does, drop `turbopackMinify: false`
  as a separate follow-up (see "Open from the dependency review" below).
- Full gate, plus the browser tests on the version edit page.

**Application audit in progress** on branch `audit/2026-10-24-review` (PR #437, never meant to
merge). Two authorization candidates are confirmed at runtime and await Codex's author response:
F-C22-001, the job-statistics global (High), and F-C22-002, native locks (Medium). **F-C22-001 is fixed**
(#439): the job-statistics global refuses all API writes, and reads are Site-Admin-only. Plan:
`docs/PLAN-job-stats-global-access-2026-10-24.md`; results: DECISIONS 2026-10-24. After deploy, check
the Rock's log has no "Error in job queue cron job handler" lines and that an export still completes.
**F-C22-002 is fixed** on branch `claude/project-thread-xxw3c4`: no API lock creation, Take over only
to yourself where you may edit, locking only on versions, plans, subjects and subject grades (one
migration), and a plain "someone is editing" message on the three App deletes. Plan:
`docs/PLAN-native-locks-2026-10-24.md`; results: DECISIONS 2026-10-24 "Native document locks
enforced". **Open:** lead L-CL-002 (the `form-state` server function can lock a document the caller
cannot edit) is recorded there and needs its own change.

**#436 merged (2026-10-24, `be573e9`): faster typing in the lesson editor.** A guarded `postinstall`
patch to Payload's admin bundle (`app/scripts/patch-payload-ui.mjs`), plus live row labels. On the Mac,
the 12-lesson plan went from ~64 ms to 16–24 ms per key (200 ms → 32 ms with the CPU 4× slower). Plan:
`docs/PLAN-editing-typing-speed-2026-10-23.md`; results and lessons: DECISIONS 2026-10-23. Codex
reviewed the plan and GPT the PR. **Deployed to the Rock 2026-10-24** at `cab5f2a`.

- ⚑ **On each Payload upgrade:** the install fails loudly until the patch strings are re-derived
  from the new bundle (plan §4.4). If Payload fixes either problem upstream, delete the patch then.
- **Rock comparison done (2026-10-24, after the deploy):** 176–184 ms → 40 ms per key at the Rock's
  own CPU speed; the unpatched editor could not keep up with typing. Details are in DECISIONS
  2026-10-24, and the Rock is cleaned up. Re-run it the same way after a Payload upgrade.
- **Upstream issues** (plan §4.6) are the operator's to file.

**#435 (2026-10-23):** personal Manage headings now say "Your saved versions" and
"Your drafts". The lesson reading page also has a closed **Show details / Hide details** disclosure
for every signed-in reader in Standard mode. The operator asked to keep these changes together.
Validation: 123 focused unit tests, two browser tests (teachers with and without editing access,
keyboard toggling, 1280px/390px layouts and selected-version provenance), lint, types and formatting.
Also included: explicit phase selection and pre-save validation, following the operator's unnamed
sixth-phase error. Save identifies the incomplete field, reveals it and preserves the unsaved work;
the server reports actual field paths and the client retains nested validation explanations.
Validated by a real browser/wire test: empty sixth phase returns its actual path, local validation
sends no save request and focuses the field, and selecting a valid name saves six phases while the
source retains five. All 1,803 unit tests passed with one worker, as did lint, types and formatting.
The first CI run exposed production formatting dropping nested validation data; the save endpoint
now owns the validation response. A production-build HTTP regression proves it includes the field
path and explanation and creates no version on refusal. The full CI gate must pass before merge.

**Newest (2026-10-23): #433 and #434 merged** (`fbedfea`, `ceade3d`), each only after green CI, at the
operator's "merge when green". Plan, review log and Q1–Q7 decisions:
`docs/PLAN-forum-dialogs-and-manage-personal-work-2026-10-22.md`; DECISIONS 2026-10-22 (two entries).
- **#433 forum and dialogs.**
  - Lesson references (forum and Messages) open in a new tab (`NewTabLink`).
  - Pin dialog "Pin this discussion"; Delete dialog "Delete entire thread and all replies" with
    "This cannot be undone.".
  - Order Pin · Delete thread · Redact.
  - `.modal__actions--pair` (two equal buttons, Cancel first) on the five in-app yes/no dialogs.
  - The 16 native `window.confirm()` prompts are deliberately unchanged.
- **#434 Proposal B.**
  - `plans.mine` "Your saved versions" (own authored versions, own Officials included) and `plans.drafts`
    "Your drafts" sit first in Manage → Lesson plans for every role.
  - `plans.versions` is administrators' cleanup queue only; a teacher's old bookmark is carried to
    `plans.mine`.
  - Teachers land on Your saved versions; drafts never auto-open and show a count; Subject
    administrators land all-closed.
  - Row actions come from `versionActions` (`lib/personalVersions.ts`) for both lists.
- **Release and deployment:** not released or deployed; the next tag would carry both.
- **Codex review:** reviewed the plan and both PRs; all findings fixed.

**v1.03 tagged (2026-10-22):** #432 merged as `625a9d8` after the revised head
`843ffa8` passed the full CI gate. The annotated tag triggers `publish-containers.yml`, which builds
AMD64/ARM64 images and publishes the release only with its checksummed deployment bundle attached.
Check that workflow for publication status before installing; creating the tag is not evidence that
the bundle has finished building. No deployment was performed in this release session.

v1.03 includes Node 24.22.1, the ARES Education copyright correction (renderer revision 10), lesson
filters, upload-time missing subject/grade creation (#431), and the Apple Silicon trial guide.
Renderer libraries stay at `f83db61`; attribution config is `d3d2b87`, reproducible through the
vendoring script's separate config argument. No dependency-package upgrade, schema change or cache
purge. The seven review fixes and validation are recorded in DECISIONS. Phase B remains paused.

The merged maintenance branch is removed locally and on GitHub. The checkout is on main. The Rock's
last operator-reported version is v1.02; deployment, backup-contact settings and the workstation
restore drill are separate operational work.

**Newest (2026-10-22): #431 merged (`ff3bdc2`): an upload offers to create missing subjects and
grades** (SPEC §7, amended 2026-10-21). A web upload naming a subject or grade that does not exist
writes nothing and answers 409 with every missing item. The Site administrator ticks what to create,
and the resubmission creates it in the plans' transaction under the `taxonomyCreate` advisory lock.
- Names differing from an existing subject only in capitals or spaces are never created.
- Similar names (`Maths`/`Mathematics`) must be answered "new subject or misspelling?".
- The dev CLI is unchanged. No migration.

Codex reviewed it, and both P2s were fixed before the merge: space-only variants, and a subject
created by a concurrent upload. CI was green. Included in v1.03; not deployed in this release session. See DECISIONS 2026-10-21
(the feature, and the `test:http` `NODE_ENV` lesson).

**Earlier (2026-10-22): v1.02, and Phase A of backup and recovery is complete.** Tagged from the tip of
`main`. It carries A2–A6 (#430): per-stream backup records in `out/ops/backup/<stream>.json` (last
success with `coversUntil`, last failure with its stage, a 31-entry history, an attempt number), one
backup at a time under an `flock`, and **Manage → System → Backups**. That box is a set of factual
statements with no overall "Protected": freshness against the school's agreed limit, routine backups
over 7 days, the last attempt, the agreed recovery time, "Full recovery: Not yet tested", who
recovers, where the key is kept, and an open restore. It adds four optional server settings
(`BACKUP_MAX_DATA_LOSS`, `RECOVERY_TARGET_TIME`, `BACKUP_RECOVERY_CONTACT`, `BACKUP_KEY_HELD_BY`), each
"Not agreed" until set, per the operator's decision. Two review rounds fixed three things:
- the restore lock is now a kernel `flock` (the PID-directory lock it replaces could admit two
  restores);
- records are written only by the run that holds the backup lock;
- "history incomplete" now expires.

Also in v1.02: Playwright 1.64.1 (#429, test-only). **Deployed:** the operator reports v1.02 is now
on the Rock (2026-10-22); this supersedes the earlier v1.00-only handoff. The deployed build hash has
not been independently re-measured in this maintenance session. Still confirm whether
`BACKUP_RECOVERY_CONTACT` (the operator and how to reach him) and `BACKUP_KEY_HELD_BY` (the operator's
password manager) are set in its `.env`; the contact line has not been recorded here.

**Earlier (2026-10-21): v1.01** is tagged from the tip of `main`, so a deploy shows "Version 1.01".
It carries A1, the staged, reversible restore (#426; operators now finish a live restore with
`--confirm` or `--undo`), the drafts autosave re-arm fix from Codex's v1.00 review (#427), and the
dependency patches (#428).

**Earlier (2026-10-21): v1.00 is released**: tag `v1.00` on `e179411`, published 05:23 UTC by
`publish-containers.yml` run 39548789541. Every job passed and the bundle and checksum are attached.
It carries #418–#425: Standard/Advanced tools (#419, **migration**; every installation switches to
Standard on update, as the tag message and CHANGELOG say), the Insert link fixes (#418, #424), Welcome
once per account (#420), Grades 1–12 (#421), dependency maintenance and Node 24.22 (#422, #425), and
`proxy.ts` (#423). CHANGELOG is now cut into v0.96–v1.00 sections; it had not been cut since v0.95.
**Not yet deployed** to the Rock or any school.

**In progress:**
- Backup and recovery, `docs/DESIGN-backup-recovery-2026-10-21.md`: **Phase A is complete** (A1 #426 in
  v1.01, A2–A6 #430 in v1.02). **Phase B is next and not started**: the recovery kit (one per release and
  architecture), `recover.sh` (install from the kit, fresh secrets, restore through A1's staged path,
  write a recovery receipt the page reads), and the clean-machine acceptance test on amd64 and arm64.
  It is owned by the operator. **The plan is `docs/PLAN-phase-b-recovery-2026-10-22.md`.** ⚑ It is
  **paused** (operator, 2026-10-22): no test machines for weeks, so the 2026-11-30 target is off and
  nothing in B1–B5 is built until the machines are in hand. Until then, only no-code steps:
  - deploy v1.02 to the Rock when it is back online (it was offline on 2026-10-22);
  - set its two contact settings;
  - run a workstation restore drill of the newest Drive backup (the last was 2026-08-22).

  Open before it starts:
  - the interim stopgap (proposed: none for now; do it per school at install);
  - teacher laptops as stopgap hosts (proposed: no for now);
  - checking that nothing stored depends on the old `PAYLOAD_SECRET`.

  From v1.01's notes: have the updater print the release's ⚑ operator notes.
- Open from the dependency review: drop `turbopackMinify: false` once a Payload 3.x release ships
  payloadcms/payload#18775, which is merged on 3.x but unreleased (do it as its own change after the
  Payload bump); React 19.3 and the majors (Sentry 11, jsdom 30, …) each as their own change.
  Playwright 1.64 is done (#429). The Payload bump itself is now 3.92.0; see "Pending: Payload 3.92.0"
  above.

**Earlier (2026-10-21):** Mark (ARES) answered the open Insert link questions; the fix merged as #424
(`8ed85a2`). Tracker addresses are kept as copied (unwrapping
removed; otherwise not tracked), `?prev…` is dropped from every ARES address, and `localhost` and
`127.0.0.1` are stored as `ares.local`. It also fixes a shipped bug: Kolibri at `ares.local/kolibri/…`
was never shortened. See DECISIONS 2026-10-21 (Mark's answers).

**Latest (2026-10-21, later):** two maintenance PRs from the 2026-10-20 dependency review are merged
(`main` at `a9c1ec4`). #422 (`6bfd033`, green CI): React 19.2.9, `@sentry/node` 10.76.2, jsdom 28.1.0,
`nodemailer` override 10.1.7, `brace-expansion` overrides, `undici` override dropped (Payload 3.91.0
now pins 7.29.1). #423 (`a9c1ec4`): `src/middleware.ts` → `src/proxy.ts` (Next 16 convention; proxy
is Node-only) with a stricter every-script-nonce CSP wire test. ⚑ #423 merged while its CI run
(39503879660, head `fb58c11`) was still in progress — `gh pr merge --auto` merges at once because
`main` has no required checks; its local gates passed on top of `6bfd033`. Both turned out green: the
PR run passed, and the `main` run for `b196d39` (which includes both merges) passed; the `6bfd033`
and `a9c1ec4` `main` runs were cancelled by the next push, as usual. The stale branches
`docs/defer-direct-draft-update`, `docs/phase4-scope-proposal` and `codex/backup-recovery-guidance`
were deleted after checking their content had landed (#405/#406, the DECISIONS phase 4 record, #396).
Still open from the review: remove
`turbopackMinify: false` once Payload's 3.x backport (payloadcms/payload#18775) ships; Node 24.22.0;
React 19.3, Playwright 1.64 and the majors each as their own change; Payload 4 is beta only.
Neither PR is released or deployed.

**Earlier (2026-10-21):** #421 merged as `0c3309c` after green CI (`main` is there). It carries the
uncommitted 2026-10-14 work onto the Subjects and grades matrix: grades are **1–12**, enforced by the
`SubjectGrade` validator; "+ Grade" is a dropdown of the missing 1–12 columns; and Accounts rows show
name and email on one line (`PersonIdentity`, shared with Roles & Access). **No migration.** Grades
outside 1–12 are now refused on create and edit; the 2026-10-14 check found only Grades 10 and 11
deployed. Not yet released or deployed. See DECISIONS 2026-10-20 (grade range and compact accounts).

**Planning update (2026-10-20):** #418 (Kolibri/localhost rules) and #419 (site-wide
Standard/Advanced tools, including the More-item focus fix) are merged, and so is #420 (Welcome
dialog once per account; `main` at `cc1807f`). #419 **includes a migration**
(`20261020_092934_advanced_tools`) and puts every installation in Standard: the next release notes
must say so (CHANGELOG has the line). Not yet released or deployed. The operator asked to retain the two UI proposals below;
recording them does not authorize implementation, further merges or deployment. Claude implements;
Codex reviews. B/C leave Insert link unchanged; a separate phase-specific link proposal is recorded below.

**Latest (2026-10-19, later):** `main` at `2c9bfa6` adds, since v0.98, offline sign-up approval
(#415), worldwide identity foundations (#416 — **includes a migration**, `20261019_211325_worldwide_ids`)
and the wrong-clock warning (#417), each green in CI and reviewed by Codex. **Released as
[v0.99](https://github.com/james-beep-boop/Lesson3/releases/tag/v0.99)** (tag on `4f29b78`, published
2026-10-20 by the workflow): `releases/latest` resolves to it, the bundle checksum verifies, it pins the
v0.99 app/migrate images by digest, and both images pull anonymously for linux/amd64 and linux/arm64.
**Not yet deployed to the Rock**, and the procedure's clean-server install is still to do (step 1 of
the rehearsal). A go-live rehearsal checklist for an offline school server is `docs/GO-LIVE-REHEARSAL.md`.
Working arrangement from here: Claude implements; Codex reviews (findings only, compact briefs).

**Earlier operator update:** #414 merged as `ca16830` after green CI. Annotated release
[v0.98](https://github.com/james-beep-boop/Lesson3/releases/tag/v0.98) is published at that commit.
The publisher passed; the documented latest bundle download, checksum and app/migrate image pins
for AMD64 and ARM64 were verified. The bundle pins Gotenberg 8.38.0 LibreOffice-only; the source
Dockerfile pins full Gotenberg 8.38.0 and preserves the Arial installer. LibreOffice is 26.8.1.1.
The local checkout is on main; eight merged local branches were deleted, with unmerged work retained.
Publication is complete; Codex has not installed or confirmed this release on the Rock.

Maintenance proof: 24 old/new PDF pairs, 440 page pairs with identical pixels at 96 DPI, geometry,
text and hyperlink destinations; all three pinned ARES fixture gates pass. Types/lint/format/build,
1,638 unit, 316 integration, 402 wire (+4 existing SMTP skips), deployment packaging checks and
127 full browser tests without retries passed. See DEPENDENCY-REVIEW-2026-10-19.md.
Full phase 4 and network feature implementation stay deferred. Earlier state/proof below describes
the preceding Combine work.

**Preceding Combine update (record):** #410 approved and merged as `e8f56db` after all CI passed. #413 is
retargeted to main and refreshed with that merge. Its fallback is narrowed: shared readable common
history is allowed for newer ingested ARES releases only; other suggestions must descend from the
draft's version. Never suggest sibling teacher versions. Selection changes are complete; refreshed proof below.
Both distinct messages (release and descendant) are approved and implemented. The server-provided
kind selects the message; refreshed proof passes.
Refreshed local proof on lesson3-codex-probe:3103: types/lint/format/build, **1,638 unit,
316 integration, 402 wire** (+4 existing SMTP skips), **127 full browser tests without retries**.
Release → descendant → no suggestion is proved in integration; sibling-only browser restoration
saves ordinary text without a hint or shortcut. Tracked test environment restored.
Do not merge/deploy #413. Earlier state/proof below describes its preceding revision.

**Base:** merged fetched `origin/main` at `e8f56db` (merged #408/#406 plus the modes/connectivity/network
note). #409 was merged after operator approval and green CI as `7169f84`; it includes both
documentation histories and the ordinary-save copy-text client fix at `a0ff598`. Its local proof passes: types/lint/format,
build, 1,607 unit, 314 integration, 400 wire (+4 existing SMTP skips), 123 full browser cases without
retries; all six focused save-browser cases also pass. #409 CI is green and the merge is complete.

**Release work:** `feat/ares-release-combine` (#410), merged after operator approval and green CI. The operator approved existing `sourceVersion` plus audited unambiguous backfill.
Re-ingest selects the previous release under the plan lock; the metadata-only migration repairs
consecutive unlinked majors and descendant lineage, reporting gaps/ambiguity and preserving
snapshots, timestamps, Official and deleted ids. The engine selects the sole changed resource side
with a usable ancestor while protecting row correspondence and administrator/system ownership.
The no-op down fix is implemented and preserves repaired rows/Official in integration. Refreshed
proof after merged #409: types/lint/format/build, 1,620 unit, 316 integration, 401 wire (+4 existing
SMTP skips), 123 full browser cases without retries. Tracked test environment is restored.
Both review fixes are complete, including the distinct approved `admin-resource` refusal.
Latest proof after merging #411: types/lint/format/build, **1,626 unit, 316 integration, 402 wire**
(+4 existing SMTP skips; initial new-fixture title mismatch corrected and all 18 preview wire
cases rerun) and **126 full browser tests without retries** pass. Tracked test environment is
restored. The wider hint wording is approved and follows separately.
Proof passes: types/lint/format/build, **1,616 unit, 316 integration, 398 wire (+4 existing SMTP
skips), 122 browser tests without retries**. The real migration and three-way re-ingest path pass;
tracked test configuration is restored. See
[`DESIGN-ares-release-combine-2026-10-19.md`](DESIGN-ares-release-combine-2026-10-19.md).
Operator review approves the core but requires a documented no-op migration down and a distinct
opposite-side administrator/resource refusal; both fixes shipped before the approved #410 merge.
#411 merged as `815d35e` after all refreshed CI jobs passed on head `51ce703`. Its original
isolated proof includes 1,609 unit, 314 integration, 397 wire (+4 SMTP skips), 124 full browser
cases and 14 focused Insert link cases. The main refresh passes 1,613 combined units and full CI.
It skips unconfigured PDF requests, cancels stale requests, shares labels and parses addresses once. **Full phase 4 is not approved. #412 is closed without merging. Keep Save → Combine.**
Preserve both designs as deferred until teacher use justifies them. After #410 fixes, widen the
small advice-only hint to common-ancestor versions, preferring a newer ingested release; approve
wording is approved. No frozen-input migration, transfer endpoints or reducer rewrite.
The operator reports prior merges are being deployed; completion has not been confirmed.

**Merged Combine branch:** `feat/draft-common-history-hint` (#413), merged as ff1fe9d after green CI.
The narrowed hint accepts a newer readable ingested release with a readable common ancestor;
otherwise it suggests only a newer descendant of the draft's version, never a sibling teacher version; teacher 1.0.1 versus release 2.0.0 sharing 1.0.0 is
covered. Owner/ordinary/restorable/editing-access guards remain, unfinished Combine excluded.
No new storage, migration, endpoint or state-machine rewrite.
Validation on lesson3-codex-probe:3103: types/lint/format/build, **1,634 unit, 316 integration,
402 wire** (+4 existing SMTP skips), and all **126 browser cases** covered. The full browser run
passed 125 cases; the new test missed the existing second review after a starting-version switch.
After correcting that assertion, all four hint browser cases passed without retries. The test also
waits for the final save response/URL and proves retained teacher prose/new resource links, parent
ids, the intermediate Not Official version and unchanged Official. No app fix was needed for this
test correction. Tracked test environment restored.
Ready for review; do not merge/deploy.

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
newer readable same-plan version sharing a surviving readable ancestor, preferring a newer ingested
release and otherwise the highest numeric newer descendant of the draft's version (never a sibling teacher
version). After restoring and saving as a
numbered version, **Combine with {newer}** opens the existing review through `?combineWith=`. It
never starts Combine automatically. No migration, endpoint, frozen input or state-machine rewrite.
The full design remains [deferred until teachers need it](DESIGN-update-draft-2026-10-19.md).

## Remaining work — latest operator order

1. #409/#411/#410/#413/#414 are merged. Release v0.98 at ca16830 is published and its bundle verified.
   The handoff update after the tag is documentation only; do not move the release tag.
2. Installing the release is a separate operational step. Codex has not deployed it on the Rock.
   Use the installation's documented deployment/update procedure so its Gotenberg sidecar updates too.
3. Next operational priority: validate installation, links, exports, permissions and backup/restore
   on an actual ARES machine, with the operator coordinating access and deployment.
4. Full phase 4 remains unapproved/deferred; #412 is closed. Keep both designs until teacher use
   justifies direct updating. The approved Save → Combine flow is retained. Stable row identity is
   a separate deferred proposal with no assigned phase number.
5. Site-wide Standard/Advanced tools shipped in #419; subject-grade/personal overrides,
   connectivity and school networking still need separate proposals and approval (identity foundations
   shipped in #416). Ask ARES about ares.edu; Plan A+ and structural drafts remain deferred.

### Proposed UI follow-ups — B, then C (recorded 2026-10-20)

These are proposals and Codex recommendations retained at the operator's request, not implementation
approval. See [the dated decision record](DECISIONS.md#2026-10-20--proposed-manage-drafts-and-library-dropdowns)
for rationale and the choices to confirm before coding. B can now start from merged #419 once approved;
C follows in its own PR. #420 is separate. No new endpoints are planned.

- **B — personal work inside Manage → Lesson plans.** Move today's private draft rows/actions into
  `plans.drafts`, titled "My saved drafts"; show personal saved versions then drafts, even when empty,
  for people who can edit. Add personal versions for administrators before their management tools.
  Recommended: Subject Administrators get the same personal sections as Site Administrators, with
  only their existing administrative permissions. Personal panels remain everyday in Standard mode.
- With drafts present, default-open both `plans` and `plans.drafts` only when no explicit URL open
  state exists; respect deep links and deliberate closing. Show the draft count on the collapsed
  heading. Preserve expiry dates and all existing restore/action checks.
- Keep existing panel URLs: `plans.versions` remains the role-dependent versions/cleanup panel.
  Administrators' new personal-version panel needs its own id. Do not derive personal versions from
  deletable cleanup candidates; those exclude Official versions. Recommended, pending confirmation:
  include accessible authored Official versions and check actions separately. Personal work spans
  all subject-grades where it remains accessible; it never includes another user's drafts.
- **C — two labelled library dropdowns**, All subjects / All grades, from configured Subjects and
  SubjectGrades for signed-in users, including empty configured pairs. Recommended: narrow grades
  to the selected subject's configured pairs; on a user-initiated subject change reset an incompatible
  grade to All grades. Preserve explicit bookmarked filters, even when they yield no lessons.
- Recommended public behaviour: anonymous options come only from publicly visible Official lessons;
  do not expose the private configured taxonomy or widen its authenticated APIs. Grade order is numeric.
- Keep client-side filtering, search and `?subject=&grade=` URLs, including Back/Forward. Distinguish
  an empty curriculum selection (e.g. "No Biology lesson plans for Grade 8 yet.") from a search with
  no matches ("No lesson plans match your search."). These are suggested strings to approve.
- Each change needs unit/browser coverage of its new behaviour and existing role/privacy boundaries;
  update the Guide and USER_GUIDE. Add wire authorization coverage if implementation changes an
  endpoint or access rule. Keep each as a separate ready PR; no merge or deployment without approval.


### Separate proposal — Insert link beside each framework phase (2026-10-20)

The operator proposed an **Insert link** button beside Predict Phase, Observe Phase, Explain Phase,
Driving Question Board (DQB) Creation and Model Building Phase in the editor. Teacher-chosen links
would appear beneath the existing ARES resources in the corresponding Phase cell in Word/PDF,
as illustrated by the operator's screenshot. Recording requested; design and implementation approval
are still pending. This is separate from B/C; its place in the work order is not decided.

The button would know its target phase directly, removing the need to focus a prose field first.
Placement is straightforward; the full feature is a moderate data/export change because the existing
ARES resource recommendations are system-only. Proposed approach: keep them protected and store
teacher-added links separately. Define native storage, field-level permissions and the supported
ARES generator integration before coding; no schema or rendering mechanism has been selected.

The plan must cover versions, ordinary and Combine draft capture/restore, Combine conflict handling,
and correct phase placement in DOCX/PDF. Reuse the approved address/label validation and ARES/Kolibri
normalization. Agree the layout, link add/edit/remove behaviour and wording first; define migration
needs and prove export fidelity and authorization, including wire tests for any changed endpoint or
access rule. Do not change the current Insert link implementation as part of merely recording this idea.

Nonblocking #410 follow-ups: filter plans with an unlinked whole major > 1; recompute only affected
release descendants in id order and remove linear row lookups; consolidate re-ingest's history
reads; scope the migration integration test to its own plan and clean its user in finally; remove
impossible duplicate-major handling and duplicate release regexes. Add a system-written release
marker before any manual version-bump control ships. No extra cleanup is required for these two fixes.

### Wording approved by the operator

- #410 refusal: “One version changes content only an administrator can edit, and the other changes
  the resource links. These changes cannot be combined automatically. Open one version and copy
  across the text you need from the other.”
- Release hint: “There's a newer ARES release, version {newer}. To bring your changes onto it,
  save your draft as a version, then combine it with {newer}.”
- Descendant hint: “Version {newer} builds on version {source}. To bring your changes together,
  save your draft as a version, then combine it with {newer}.”
- Existing “Combine with {newer}” action stays unchanged. Implement these exact approved messages.

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

> Pick up Lesson3. Fetch; read AGENTS → CLAUDE → SPEC → this file and recent relevant DECISIONS.
> PR #432 is merged after green CI; v1.03 is tagged. Verify the release publisher's result and
> checksummed bundle before installation. It includes the Node 24.22.1 security patch, corrected
> ARES Education attribution, lesson filters, #431 taxonomy confirmation and the Mac trial guide.
> No deployment was performed in this release session; the Rock is operator-reported at v1.02.
> Next operational work: confirm backup-contact settings and run the workstation restore drill.
> Phase B is paused until test machines exist. Other deferred features remain unapproved.
> Use only an isolated lesson3-codex-probe stack for fixture-writing tests.
