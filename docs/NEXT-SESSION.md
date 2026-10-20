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

# CURRENT STATE — 2026-10-19

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
5. Modes, connectivity and school networking are direction only (identity foundations are built,
   #416). Each needs a separate proposal and approval. **Next to build when the operator chooses:
   Standard/Advanced mode, site-wide** — it needs the operator's marked-up inventory
   (`docs/DESIGN-modes-connectivity-network-2026-10-19.md` §2). Ask ARES about ares.edu; Plan A+ and structural drafts remain deferred.

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
> #414 merged as ca16830; v0.98 is published with verified bundle/checksum and both architectures.
> Gotenberg 8.38.0 / LibreOffice 26.8.1.1 maintenance is complete; Arial and PDF fidelity are proved.
> See DEPENDENCY-REVIEW-2026-10-19.md. Rock installation has not been performed by Codex.
> Next priority is deployment/ARES hardware validation with the operator. Plan and obtain approval
> before further feature work; do not merge or deploy without authorization for that work.
> Full phase 4 and network implementations remain deferred. Only lesson3-codex-probe:3103.
