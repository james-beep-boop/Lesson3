# Changelog — session-by-session build log

The chronological build log (newest on top). This is **history**, kept for provenance.

- For the **live launch prompt** (current state + what to do next), read **`docs/NEXT-SESSION.md`**.
- For **decisions and their reasoning**, `docs/DECISIONS.md` is canonical.
- For **architecture and domain rules**, `SPEC.md` is canonical.

---

## 2026-07-21 — review round 2 + orphaned pre-warm no-op (#138, #139)

### Fixed
- **`enqueueDetached` had lost the task↔input type check** (#138) — a mismatched `{ task, input }`
  compiled where native `jobs.queue` rejects it. Made the helper generic over the task slug; pinned
  both negatives (`req`, mismatched input) in `tests/unit/enqueueDetached.spec.ts`.
- **Orphaned pre-warm reported as a failure** (#139) — `generateVersionArtifact` now treats a vanished
  version (a benign L3-03 orphan) as a `logger.info` no-op via `disableErrors`, not a
  captureException + rethrow. Real generator faults still capture and rethrow.

### Tests
- Permanent coverage for BOTH PDF-preview twins' blocked-popup path (#138) — the silent-success bug
  had none, and had already recurred once.
- Orphaned-pre-warm classification test in `bestEffortEnqueue.int.spec.ts` (#139); int 71 → 73.

### Ops
- **Deploy of #139 is pending** — the Rock began rejecting SSH mid-session (changed host key, then
  publickey denied). Live site healthy; runtime change not yet deployed. Needs operator attention.

## 2026-07-21 — /simplify follow-ups + sharp security bump (#135, #136)

### Security
- **sharp 0.34.2 → 0.35.3** (forced major; `<0.35.0` has no patch) for the libvips CVEs
  (GHSA-f88m-g3jw-g9cj); also clears the `next` finding that was only `via: ["sharp"]`. Native binary
  exercised on the Rock post-deploy (libvips 8.18.3).

### Fixed
- **PDF preview silent-success bug in the twin `openPreparedPdfInNewTab`** — the teacher per-document
  button and editor "View as PDF" still had the unchecked popup retry #133 fixed only in its sibling.

### Changed (quality)
- `enqueueDetached` centralises the L3-03 "no caller transaction" invariant and makes passing `req` a
  compile error; three sites adopt it.
- prewarm enqueues now run concurrently; messages widening owned in one place; shared `tests/helpers/db.ts`.

## 2026-07-21 — forgot-password timing oracle closed + review follow-ups (#133)

### Security
- **Forgot-password leaked account existence through response TIME** even with byte-identical
  replies. Measured on the Rock (n=20/branch): unknown 23–29 ms vs registered 60–140 ms — one request
  sufficed to classify an address. Responses are now padded to a fixed floor (400 ms, env-tunable via
  `FORGOT_PASSWORD_RESPONSE_FLOOR_MS`). Re-measured after deploy: gap 65 ms → **0.2 ms**, overlapping.

### Fixed
- "Show older messages" was a dead link once already on `?older=1`.
- PDF preview could resolve without opening anything when a popup blocker rejected the retry.
- The password-reset migration's `down()` failed if any reset job row survived.
- Three comments claimed job rows ride the caller's transaction, contradicting #131.
- USER_GUIDE / in-app guide contradicted each other and the code on Teacher version access.

### Tests
- Durability test for the `prewarmVersionArtifacts` half of L3-03 (int 70 → 71).
- Wire test pinning the forgot-password response floor.
- The enqueue suite now returns the shared global signup budget it consumes.

## 2026-07-21 — L3-03: best-effort enqueues moved out of the caller's transaction (#131)

### Fixed
- **A failed job enqueue could silently discard the write it rode on.** `messagePing` and
  `prewarmVersionArtifacts` passed `req` to `jobs.queue`, enlisting the job insert in the caller's
  transaction. A failed insert aborted it, the catch swallowed the error, and drizzle's
  `commitTransaction` turned the doomed commit into a rollback **without rethrowing** — producing a
  201 with the document in the response body and nothing persisted. Both now omit `req`, so the
  insert runs on its own connection.
- `messagePing` confirms the message still exists before emailing (jobs are no longer atomic with
  the write, so an unrelated rollback can orphan one).
- `passwordResetEmail` gained the `logger.error` + `captureException` wrapper its sibling jobs have.

### Tests
- `tests/int/bestEffortEnqueue.int.spec.ts` — fault-injects a **real** failing statement on the
  caller's transaction. An earlier mock-only draft passed against the broken code; this one fails
  there with `expected +0 to be 1`. int suite 68 → 70.

## SHIPPED + DEPLOYED 2026-07-20/21 — audit remediation (#119–#126), incl. a same-day security correction

All merged through the protected-branch gate and deployed to the Rock, which now runs `main` `5d50c24`.

- **#119 — caller lesson-plan create denied** (`lessonPlanCreate: () => false`), mirroring the existing
  version-create deny. A Subject Admin could previously mint unlimited pointerless, invisible,
  unrepairable, self-undeletable plans. Ingest is unaffected (Local API `overrideAccess`).
- **#120 — two hazards retired, −238 lines.** The legacy e2e fixture deleted and recreated a FIXED
  account (`dev@payloadcms.com`) via the Local API and would have destroyed a real user of that name
  on a persistent DB. The PDF pixel gate was both methodologically abandoned (Word vs LibreOffice) and
  arithmetically broken (it concatenated ImageMagick's absolute and normalised values), so every
  number it ever produced was garbage.
- **#121 — VersionsChip composed onto the shared Modal**, gaining a real Tab focus trap, focus
  restoration and body-scroll lock for keyboard/AT users.
- **#122 — REVERTED #119's forgot-password half.** Surfacing `!res.ok` created an account-existence
  oracle; the reasoning that justified it was half-true and the missing half was fatal.
- **#123 — `/simplify` follow-ups**: de-duplicated comments; documented the ingest access coupling.
- **#124 — the forgot-password oracle closed SERVER-side.** The revert only stopped our UI showing the
  difference; a direct API caller still saw 200 vs non-2xx. A shadowing endpoint now runs the operation
  with `disableEmail: true` and queues delivery to a retrying job, so both branches answer identically
  AND "a reset link is on its way" became true. **Carries a migration** (task-slug enum).
- **#125 — PDF preview made completion-aware.** A fixed 3 s busy timer against 5.3–6.9 s Rock
  conversions meant the button re-enabled mid-conversion on essentially every production preview.

**Same-day correction (2026-07-21):** #124's follow-up lookup re-matched the RAW request email while
Payload finds the account with a normalised one, so a mixed-case address minted a live reset token and
queued nothing — recovery silently dead, and invisible to a wire suite whose fixtures are all
lowercase. Now resolved by the returned token, which cannot drift from upstream normalisation, with a
mixed-case/whitespace regression test.

## DEPLOYED + LIVE-VERIFIED 2026-07-20 — routing 404s fixed (`/lessons`, `/manage`)

`https://test.kenyalessons.org/lessons` and `/manage` returned 404. The top-nav labels "Lessons" and
"Manage" are not routes — the canonical routes are `/` (catalogue) and `/admin` (Payload manage) — so
typing the visible label as a URL 404'd. Fix (PR #114, `app/next.config.ts`): two config-level
redirects, `/lessons` → `/` and `/manage` → `/admin`, using the same routing-layer mechanism as the
existing `/admin/login` → `/login`. `source: '/lessons'` is an exact match, so the `/lessons/[id]`
lesson pages are untouched; 307 (temporary) so `/` and `/admin` stay canonical.

Deployed to the Rock via `scripts/deploy.sh` (app-level, NO migration); Rock now on `main` `9a1049a`.
Live-verified on test.kenyalessons.org: `/lessons` → `/` → 200 catalogue (authed), `/manage` → `/admin`
→ 200 (authed), `/lessons/143` still routes to the lesson page (not swept to `/`), `/lessonsX` still
404. Operational note: the production build sets a Secure host-scoped auth cookie, so curl-over-http
drops it — use `Authorization: JWT <token>` for authed API checks.

## VERIFIED ON THE ROCK 2026-07-20 — resource-links cutover live and healthy in production

Direct SSH inspection of the Rock (`david@rock5b`, `/srv/lesson3`) confirmed the deployment the prior
entry could only report second-hand. The corpus was already uploaded and the child-row model is
working in production:

- **Code/schema:** Rock on `main` `2db0570`; `payload_migrations` newest two are
  `20260719_185124_ares_resource_links_cutover` then `20260719_210359_resource_links_child_rows`. The
  de-flattening is real: `lesson_bundle_versions_lessons` is back to 20 columns and the child table
  `lesson_bundle_versions_lessons_resource_links` exists.
- **Corpus:** 42 lesson plans, each with an Official `1.0.0`; the 42 Official versions hold exactly 384
  lessons (the expected baseline). One extra `1.0.1` Not-Official draft exists on plan 143 (an editor
  save-as-new; both its versions have 6 lessons, so no row was added and the Official pointer did not
  move) — accounting for the 43-version / 390-lesson totals.
- **Resource data:** 1,950 resource rows (390 lessons × 5 phases); every row has a populated video
  `direct_url`, reading `direct_url`, and `fallback_search_url`; 0 non-`http(s)` URLs.
- **Runtime:** app healthy (`/` → 307); Teacher auth OK; a Teacher DOCX export returned 200
  (97,474 B, valid OOXML, 140 embedded `ares.local` hyperlinks) and PDF 200 (470,428 B, valid `%PDF`)
  for Physics 4.1 (v200) — proving the generator reads the child-row storage end to end.

The only remaining Rock-only items intentionally NOT run this pass are the full DB-backed
int/http/e2e suites (CI already runs these on every push and the gate was green at `2db0570`).

## DEPLOYED (OPERATOR-REPORTED) 2026-07-19 — current `main` through resource-row preservation fix

The operator reported a successful Rock deployment of `main` `2db0570` (through PR #111). GitHub's
post-merge `main` CI gate passed at the same SHA, and the local checkout was clean and synchronized
before deployment. This release includes the normalized child-row `resourceLinks` correction from
#108 and the Subject-Administrator duplicated-lesson resource preservation fix from #111, together
with all intervening merged work.

This session did not independently inspect the Rock after deployment because the SSH private key was
not unlocked in the assistant's agent. Treat the migration ledger, Rock int/http/e2e/build gates,
Physics smoke/fidelity checks, and replacement-corpus counts as unverified until operator evidence is
recorded in `docs/NEXT-SESSION.md`.

## FIXED + LOCALLY VERIFIED 2026-07-19 — Subject-Admin duplicated lesson rows retain system resources

A post-merge audit found one P2 in the resource-link save boundary: Subject Administrators are allowed
to add lesson rows, but every new row lost its hidden `resourceLinks` and then failed the generatable
gate. Payload's installed `DUPLICATE_ROW` implementation deep-copies the complete row state (including
hidden nested fields) while assigning fresh row ids, so duplicating an existing lesson is the safe
authoring path.

- The server now accepts a new lesson's resource data only when it exactly matches a `resourceLinks`
  value already stored in the source version, ignoring Payload row ids. It then restores the stored
  server copy. Invented or modified resource data is still stripped and rejected by validation.
- Existing lessons still always receive their stored resources; Editors still cannot change lesson
  cardinality; new Lesson Plans remain Site-Admin-only through trusted upload/import.
- Added unit coverage plus two Rock HTTP regressions (allowed exact duplicate; denied forged links),
  and synchronized the admin field description, `USER_GUIDE.md`, and `/guide` instructions.
- Local evidence: unit 207/207; TypeScript clean; lint 0 errors/87 warnings; ingest 25/25; contract
  16/16; adapter/fidelity 6/6; production audit 0 high/critical; `git diff --check` clean. The two new
  DB-backed HTTP cases remain for CI/Rock.

## FIXED + LOCALLY VERIFIED 2026-07-19 — resource-link upload PostgreSQL 100-argument failure (Rock migration pending)

The first Rock smoke upload of a definitive ARES JSON file returned 500 and rolled back. The file was
valid; the deployed Payload schema flattened five resource buckets (95 resource leaves) onto each
`lesson_bundle_versions_lessons` row. Payload's Postgres read-after-create query reconstructed that
wide row with `json_build_array(...)`, exceeding PostgreSQL's hard 100-function-argument limit. This
was a release-blocking defect missed because the previous review ran only DB-free gates; the documented
Rock upload smoke test had not been run.

- Kept the external `LESSONS[].resourceLinks` object and every locked contract decision unchanged.
  Internally, each lesson now stores exactly five native child rows (`phase`, `video`, `reading`, and
  `fallback_search_url`). The generator adapter restores the exact phase-keyed ARES object.
- Generated `20260719_210359_resource_links_child_rows`, which creates the child table and removes the
  95 flattened parent columns. Both directions require zero lesson plans, versions, and lesson rows,
  preventing silent resource loss; the Rock currently reports zero plans and versions after the failed
  upload.
- Strengthened the HTTP regression to upload and then read a full resource bundle, covering the exact
  read-after-create operation that failed in production.
- Local evidence: all 42 files / 384 lessons conform and round-trip; unit 201/201; contract 16/16;
  extraction 25/25; TypeScript clean; lint 0 errors; current DOCX fidelity 4/4; adapter fidelity 6/6;
  `git diff --check` clean.
- **Full audit (Claude, same day): the DB-backed gates were then RUN LOCALLY** against a scratch
  compose environment (fresh DB; the dev DB left untouched): full migration chain incl.
  `185124 → 210359` applied clean; http 88/88; int 68/68 (after fixing one fixture that bypassed
  ingest's map→rows conversion in `reingest.int.spec.ts` — product code was correct); a REAL Physics
  4.1 corpus file uploaded over HTTP → Official 1.0.0, stored resources deep-compared byte-equal to
  the source, DOCX+PDF exported with all source hyperlinks present. Remaining Rock steps: backup,
  deploy, apply `210359`, re-run gates there, then upload the 42-file corpus.

## BUILT + LOCALLY VERIFIED 2026-07-19 — definitive ARES JSON 1.0.0 resource-link cutover (deploy pending)

The old Lesson3 lesson corpus has been permanently deleted and will be replaced by the current ARES
JSON exports. The clean cutover is now implemented locally; Rock migration/deployment and replacement
corpus upload remain pending.

- `schemaVersion: "1.0.0"` is intentionally re-baselined as the only supported contract; this is a
  clean cutover, not a backward-compatible extension. Old files without resource data will be rejected.
- Every lesson must carry strict lesson-level `resourceLinks` for the five ARES phase buckets. Lesson3
  stores the complete upstream metadata as system-only native Payload fields and does not run the
  Python/SQLite recommender.
- The one LessonSequence layout remains a five-column table with resources inline beneath the phase
  name—never a separate Resource column and never a user-facing standard/compact choice.
- Implemented the strict contract, native system-only Payload fields, preservation boundary, lossless
  adapter, clean migration retiring `framework[].resources`, current generator re-pin, pure-Node
  stored-resource bridge, and explicit render-cache revision.
- Added corpus and DOCX gates. Local results: 42/42 files (384 lessons) conform and round-trip;
  contract 16/16; extraction 25/25; unit 197; TypeScript clean; current DOCX oracle 4/4; adapter/oracle
  6/6; lint 0 errors; production audit 0 high/critical (5 moderate transitive `esbuild`, no fix).
  Resource text, five-column widths, striping, page breaks, and 140 hyperlink targets are checked.

**Claude review + `/simplify` + follow-up fixes (2026-07-19, after the Codex build):** a full code audit
(correctness/contract, security/RBAC/migration, fidelity/generator) found no P1/P2 defects; a 4-agent
`/simplify` pass applied behaviour-preserving cleanups (single-sourced key lists + `isObject`, a
named-path guard, a shared `scripts/lib/payloadRowIds.ts`). Two follow-up fixes from a further review:
(1) the migration `down()` now refuses rollback on a non-empty corpus (the legacy schema can't preserve
`resourceLinks`, so a blind rollback would destroy data) — SQL guard only, snapshot JSON unchanged;
(2) `getAllPhaseResources` now throws on an over-read so a "called twice" vendor drift fails loudly
instead of returning blank resources, with unit regressions added. Local DB-less gates re-run green: lint
0 errors, `tsc` clean, unit 199, contract 16/16, ingest-extract 25/25, fidelity-spike 4/4, adapter-fidelity
6/6, `git diff --check` clean. DB-dependent (int/http/e2e), migration apply, and corpus upload were NOT run.

**Status:** code and migration generated locally, not committed, pushed, deployed, or applied. Rock
preflight and DB-dependent gates must pass before uploading the replacement corpus.

## SHIPPED + DEPLOYED + VERIFIED 2026-06-25 (Stage 2b finish + Stage 3 retire `lesson-bundles`)

Cutover complete. Code `d1bb614`; Rock-generated types + drop migration `1959daf`. Rock-verified
2026-06-25: roundtrip-regression 3/3 byte-identical, `verify-rbac` 7/7, `verify-stage2b-edit` 13/13,
`verify-stage2b-preview` 7/7, `verify-stage2-export` DOCX+PDF; app healthy on the new schema. The
collection-drop migration needed two hand-edits before applying — see DECISIONS 2026-06-25.

- **Stage 2b finish — admin Preview/Export on versions.** New version preview endpoints
  (`endpoints/previewVersion.ts`, GET saved + POST unsaved; shared shell/body-parse in
  `previewShared.ts`); the `PreviewBundle`/`ExportBundle` admin controls now drive the
  `lesson-bundle-versions` endpoints (a version has no published gate). Verifier:
  `verify-stage2b-preview.ts`.
- **Stage 3 — legacy `lesson-bundles` retired.** Deleted the collection and its entire bundle-path
  (`exportBundle`/`exportStatus`/`previewBundle` endpoints, `generateForBundle`, `generateArtifact`
  job, `bundleIntegrity`/`generatable` hooks, the five `lessonBundle*` access fns, `findReadableBundle`,
  `bundleScope`, and the obsolete bundle scripts). Shared content fields extracted to
  `fields/lessonContent.ts`; web upload re-homed to `lesson-plans` (`POST /api/lesson-plans/upload`);
  the generator/adapter/preview chain retyped from the vanishing `LessonBundle` to `LessonBundleVersion`
  (deleting the Stage-2a `as unknown as LessonBundle` casts). `verify-rbac.ts` slimmed to the
  People/Curriculum RBAC it uniquely covers (lesson-content RBAC lives in `verify-stage2b-edit`).
  Deployed: `generate:types` (dropped the `LessonBundle` type + `generateArtifact` task slug) +
  the `20260625_125532_drop_lesson_bundles` migration (applied 2026-06-25; 0 bundle tables remain,
  `lesson_plans`/`lesson_bundle_versions` intact).

## SHIPPED + DEPLOYED + VERIFIED 2026-06-24 (Official-version cutover: Stages 1, 2a, 2b-admin)

The Official-version model went from "schema only" to powering the live teacher + admin paths. All
deployed to the Rock and verified. See DECISIONS 2026-06-24 for reasoning.

- **Stage 1 — corpus backfill (`503b09f`).** Migrated the 13 legacy published bundles (ids 63–75) into
  13 `lesson-plans` + Official `lesson-bundle-versions` 1.0.0. Verified LOSSLESS: 39/39 documents
  regenerate byte-identically to their source bundles (`verify-migration.ts`). Legacy left untouched.
- **Stage 2a — teacher read/view/export on versions (`f857fb9`…`97b9379`).** Browse lists plans via
  their Official version; detail uses the plan id with a `?version=` selector (Official by default);
  content-preview + DOCX/PDF download run off the selected version. Generator-agnostic artifact cache
  (opaque `scope` key), `generateForVersion` (no published gate), `generateVersionArtifact` job,
  version export endpoints (GET serve / POST prepare / status). `roundtrip-regression` repointed to the
  version model (it had broken when ingest moved off bundles). Verified: roundtrip 3/3 byte-identical,
  reads 13/13, export DOCX+PDF.
- **Stage 2b — editing on versions (`d18a544`…`36e9500`).** Working-copy model: Official versions are
  immutable (`enforceVersionImmutable`) and undeletable (`enforceOfficialNotDeletable`); **Edit**
  (Editors + admins) forks a Not-Official working copy (`POST /:id/fork`) and opens its admin editor;
  **Make Official** (admins only, `POST /:id/make-official`) moves the plan pointer with no content
  copy. **Editors prose-edit** the working copy — the field-split was factored out of
  `enforceBundleStructure` into a shared `applyEditorFieldSplit` (bundle behavior unchanged) and
  applied to versions; `lessonBundleVersionUpdate` editor-scoped, `…Create` admin-only. Verified:
  `verify-stage2b-edit` 13/13 (immutability, fork, mutable copy, make-official, editor prose
  applies / structure+admin preserved, delete guard, editor+teacher denials), `verify-rbac` 36/36.
- **Remaining (at the time of this entry):** cut admin Preview/Export components to versions; **Stage 3**
  retire `lesson-bundles`. *(Both now CODE COMPLETE — see the newer entry at the top.)*

## SHIPPED + DEPLOYED 2026-06-24 (Audit #3 — export GET/POST split, Rock-verified)

- **Closed audit #3** (`9c9a701`): the export endpoint that enqueued heavy work on a cold GET was
  split — `GET /:id/export` is now serve-only (warm → 200 zip, cold → 409, never enqueues), and a new
  `POST /:id/export` is the only state-changing op (enqueue + rate limit). With the Payload auth
  cookie `SameSite=Lax` (confirmed in installed source), a cross-site POST has no cookie → 401, so the
  CSRF/enqueue vector is closed and GET is idempotent. `exportClient.ts` now POSTs to prepare then GETs
  to download.
- **Verified end-to-end on the Rock:** cold POST → 202 → poll ready → GET 200 zip; cold GET → 409;
  unauth POST → 401; Teacher POST `/api/payload-jobs` → 403. (Unauth `…/payload-jobs/run` → 404, not
  401/403 — noted in DECISIONS.)

## SHIPPED + DEPLOYED 2026-06-24 (Official-version model slice + schema migration)

- **Official-version product model chosen and first implementation slice shipped.** User clarified:
  upload/import creates `1.0.0 Official`; every edit creates a retained Not Official version; one
  global Official pointer per lesson plan; teachers can view/export all versions; Site Admins and
  matching Subject Admins can move the pointer without copying/restoring content. `SPEC.md` and
  `docs/DECISIONS.md` updated accordingly.
- **New Payload collections added** (`273816c`): `lesson-plans` owns stable identity +
  `officialVersion`; `lesson-bundle-versions` owns immutable structured snapshots. New access helpers
  gate version creation and Official pointer changes; hooks enforce generatable saved versions and
  reject an Official pointer to a version from another plan/subject-grade.
- **Upload/import write path moved to the new model** (`273816c`): valid uploads now create
  `LessonPlan` + `LessonBundleVersion 1.0.0`, then set `LessonPlan.officialVersion` to that exact
  snapshot. UI/CLI copy now says upload/import and Official/Not Official rather than ingest/draft/publish.
- **Editor convenience patch included** (`273816c`): frontend lesson detail shows an Edit button for
  users with edit scope; the browse page includes in-scope draft rows for admin-panel users; disallowed
  Manage collections are hidden from roles that cannot use them.
- **Schema migration follow-up** (`5c847e2`): initial deploy missed generated Payload types +
  migration, causing Rock admin errors such as `relation "lesson_plans" does not exist`. Generated on
  the Rock with Node 22, committed `payload-types.ts`, migration
  `20260624_221905_official_version_model`, and `migrations/index.ts`; redeployed successfully. Recent
  app logs no longer show missing-table errors.
- **Transition state at the time of this slice (since superseded — see the top entry):** legacy
  `lesson-bundles` still powered most browse/view/export/edit UI, and the 13 legacy bundles weren't yet
  copied into the new collections. All of that next work — version selector, export-by-version,
  edit-from-version, Make Official, and the corpus copy — shipped in Stages 1/2a/2b (top entry).

## SHIPPED 2026-06-24 (UX batch: one login, consistent menu, resources checkbox, admin polish)

Pushed to `main` (`783f019`…`bc9b656`); **not yet runtime-verified on the Rock** (the auth redirect,
admin header injection, one-logout, and font scale are admin-shell changes that can't be tested
locally). Details + reasoning in DECISIONS 2026-06-24.

- **One login form** (`b6eb0bc`): `/admin/login` → the frontend `/login` via a `next.config` redirect
  (replaced a 404-ing Payload view-override and an over-built middleware attempt). Everyone lands on
  `/` after sign-in; admins use the header "Admin" link. Brand `…Repository 3` → `…Repository`; admin
  login Logo graphic dropped; logged-out header hidden so `/login` is a clean splash.
- **Consistent top-right user menu** on both surfaces (`fbd637a`, `21769d1`): username · [Admin|Lessons]
  · logout · initials avatar. Admin side via `admin.components.header`; **one logout everywhere**
  (Payload's nav logout hidden); shared `Avatar` + `LogoutButton`. Dashboard "Browse lesson library"
  removed (header "Lessons" covers it).
- **"Include ARES Resources" checkbox** (`657bd3e`, `bc9b656`) replaces Standard/Compact on the teacher
  view + admin export + admin preview — one checkbox, unchecked by default, drives the view and all
  downloads; 4 teacher download buttons → DOCX/PDF. Mapping centralized in `lib/format.ts`; shared
  `ResourcesCheckbox`.
- **Admin polish** (`2ed3667`, `618f536`): fixed an admin-font regression (the `--base-body-size` bump
  was a spacing *divisor* and shrank things) by scaling the rem root/body to 15px; replaced the
  clipped "LPR3" nav wordmark with an 18×18 SVG document glyph (sized to Payload's `.step-nav__home`).
- **e2e login helper** updated for the single login (`4a19742`).

## SHIPPED 2026-06-23 (UI/admin redesign: strand-first Lesson Plans page + custom admin dashboard)

- **Strand-first Lesson Plans page** (`34b6122`, `7717088`; deployed + verified on the Rock). Replaced
  the arbitrary blue/grey title list with a server-rendered, strand-first browse shared by all roles:
  subject-grade → strand → sub-strand in **curriculum order** (`meta.substrand_id`, dotted-NUMERIC so
  `1.4 < 1.10`), four-step type scale (22/18/16/14), ink titles (accent only on hover), lesson counts,
  and a modest server-side `?q=` search. Labels use `meta.substrand_name` (drops the shouty stored
  `BIOLOGY GRADE 10: …` title); strand headings strip the stored `Strand N.M:` prefix → `Strand N:
  Name`. Pure logic in `src/lib/substrand.ts` with a DB-free unit suite (`tests/unit` + its own
  `vitest.unit.config.mts` + a `test:unit` script; `test`/`test:int` untouched). No schema/endpoint
  change.
- **Custom admin dashboard** (`7a2397b`, importMap `9e1e8cf`; deployed + verified). Replaced Payload's
  default collection-card dashboard (which duplicated the nav) with a quiet, role-aware landing
  (`src/components/AdminDashboard` via `admin.components.views.dashboard`; scoped styles in
  `(payload)/custom.scss`, theme-aware): title + factual role/scope line + additive-only actions
  (Site-Admin-only ingest hidden otherwise). NOT the modular widget system (its only built-in widget
  is the same collection cards). Registering a view needs an importMap regen (Node 22) — reproduced
  the generator's `default_<md5(path)>` entry locally so origin stayed correct without a Rock push.
- **Admin polish:** dropped the redundant Lesson-Bundles "META > Title Doc" list column
  (`disableListColumn`, `676333c`); renamed/reordered nav groups Content/Taxonomy/Collections →
  **Lesson plans / Curriculum / People** (`9d4d882`) — a truly headingless nav isn't a Payload config
  option (`admin.group:false` hides items), so renaming is the clean native fix. **Pending final Rock
  redeploy** for the last two (dashboard already live).

## SHIPPED + DEPLOYED + VERIFIED 2026-06-23 (async export: Jobs Queue + artifact cache + rate limit)

- **Phase 5 — readiness #1 closed (the "heavy generation is synchronous + unthrottled" top risk),
  and the deferred async half of the PDF slice finished. DEPLOYED + VERIFIED LIVE on the Rock**
  (merged to `main` as `aff318a`; feature `191510f`, Rock types+migration `17614f7`, Dockerfile fix
  `d3525c0`). Three composing protections:
  - **Artifact cache behind a seam** (`src/generator/artifactCache.ts`, `exportArtifacts.ts`):
    content-stable bytes cached by `(bundle, lockVersion, format, kind, doc)` — `lockVersion` is the
    cache-buster. Bounded on-disk LRU, durable via a `lesson3_artifact_cache` named volume. Warm
    `?as=pdf` skips Gotenberg entirely.
  - **Per-user rate limit** (`src/lib/rateLimit.ts`) on export + both preview verbs → `429 +
    Retry-After` (Payload 3 has no built-in `rateLimit`; verified against installed source).
  - **Jobs Queue async export** (`src/jobs/generateArtifact.ts` + `jobs` config): the `payload-jobs`
    collection (one migration). In-process `autoRun` with `limit` as the global concurrency cap on
    heavy conversions. Export is two-phase — warm → `200` zip; cold → enqueue + `202` + a status URL
    (`GET …/export/status?jobId=`). Frontend (`components/exportClient.ts`, admin button, teacher
    `DownloadButtons`) follows the 202 → poll → download handshake.
  - **Verified live:** cold export `202` → `autoRun` produced + cached → status `ready` → warm
    `200 application/zip` with a valid PDF (bundle 63).
- **Two Rock deployment traps found, fixed, recorded** (see DECISIONS 2026-06-23): a fresh Docker
  named volume mounts **root-owned** (app runs as `nextjs` uid 1001 → `EACCES`, export stuck at
  `202`) → Dockerfile now pre-creates + `chown`s the cache dir; and **`ARTIFACT_CACHE_DIR` must be in
  `.env`** (+ recreate the container) or the cache falls back to the non-writable `/app/.artifact-cache`.
- **Still open:** the formal PDF **fidelity gate** (`scripts/pdf-fidelity-check.ts`) — conversion is
  proven, the layout-faithfulness measurement still needs Rock-side ImageMagick + 3 Word oracle PDFs.
- **Post-merge `/simplify` cleanup** (tsc/eslint clean; behavior-preserving): shared
  `authorizeExportRequest` gate (`endpoints/exportAuth.ts`) across export + status; removed the
  now-redundant `TypedJobs` casts (types regenerated); restored **concurrent** PDF conversion in
  `produceArtifacts` (a serial-loop regression); de-duplicated `safePrefix` + the rate-limit `Bucket`
  type. Not yet runtime-verified on the Rock — re-run the export smoke-test on the next deploy.
- **External audit (GPT-5.5, 2026-06-23) + fixes** (tsc/eslint clean; **not yet runtime-verified**):
  - **Jobs surface locked down** (`5b58b41`): Payload's job defaults were open (run endpoint
    `() => true`; `payload-jobs` collection any-auth-user) → `jobs.access` + `jobsCollectionOverrides`
    restrict to Site Admins / system path. **High finding.**
  - **Async-export correctness** (`8bede30`): per-write-unique cache temp file (concurrent-write race),
    `isExportReady` now verifies every artifact not just the manifest, and the status poll returns
    `409 retry` on stale `lockVersion`/expired artifacts instead of spinning at "preparing".
  - **Deferred:** audit #3 (GET `/export` enqueues → move to POST) — held to pair with Rock runtime
    verification. Remaining audit items (#2/#7–#12) are the hardening backlog (NEXT-SESSION).

## SHIPPED + DEPLOYED + VERIFIED 2026-06-22 (§5 smoke-test PASSED + PDF export slice live)

- **§5 editor refinements browser smoke-test — ALL PASS on the Rock** (driven via Chrome MCP
  over Tailscale, real Teacher + Editor logins). Results: Teacher login redirects `/admin`→The App
  home; teacher format toggle Compact↔Standard re-renders server-side; **Teacher POST `/:id/preview`
  → 404** (edit-gated) while **GET → 200** (read-gated; the verb split holds); **Editor unsaved
  prose edit → Preview renders it** (banner "UNSAVED EDITS", nothing saved — stored bundle verified
  pristine afterwards); **Editor structural change (6→5 lessons) → 422**; oversize (>4 MB) → 413;
  array row labels via the shared `RowLabel` confirmed on all nested arrays (**Lesson N —**,
  **Phase N —**, **Section N —**, **Rubric row N —**). Closed the last open §5 item.
- **PDF export slice (§9) — DEPLOYED + VERIFIED LIVE on the Rock (commit `9ef5ccc`; cleanups
  `916341e`; hardening `293fea1`).** PDF = the generated DOCX run through a **local office engine**
  (one source of layout truth) via a swappable `docxToPdf(buffer)` seam → a **Gotenberg sidecar**
  (`gotenberg/gotenberg:8`, internal-only, no exposed port). `?as=pdf` on the export endpoint reuses
  the exact READ gate (`findReadableBundle` + `generateForBundle`) then converts each DOCX (502 if
  the converter is down; 120s `AbortSignal.timeout`); DOCX/PDF picker on the admin Export button +
  teacher download links. New files: `src/generator/docxToPdf.ts`, `scripts/pdf-fidelity-check.ts`;
  `GOTENBERG_URL` + `GOTENBERG_TIMEOUT_MS` in `.env.example`. **Verified live:** `gotenberg /health`
  → 200; authenticated Teacher `?as=pdf` of bundle 66 → 200 `application/zip` with 3 valid `%PDF`.
  No schema change → no migration. Jobs Queue deferred (synchronous-first, approved fallback).
- **`/simplify` cleanups (`916341e`):** moved `parseExportKind` into `parseFormat.ts` beside
  `parseLessonSequenceFormat`; parallelized the up-to-3 conversions with `Promise.all`; hoisted
  `gotenbergUrl()`. **Codex 2026-06-22 review:** PDF-specific findings fixed (Gotenberg timeout +
  teacher-render logging, `293fea1`); the rest triaged into the readiness backlog (see NEXT-SESSION).
- **Cosmetic follow-up:** lesson rows read "Lesson 1 — Lesson 1 — …" — `RowLabel` prepends
  `Lesson N —` but the stored `title` already begins with its own; Phase/Section/Rubric don't double.

## SHIPPED + DEPLOYED 2026-06-22 (UNIT model + contract hard gate + clean re-ingest)

- **Interim UNIT model fix DONE — the Sub-Strand Overview now renders end-to-end.** Modelled the
  17 canonical UNIT fields (was a dead `overview` stub), migration `add_unit_fields` applied on the
  Rock. `roundtrip-regression` **3/3** through the full DB path — LessonSequence **381 → 408 blocks**
  (the +27 overview rows). See DECISIONS (2026-06-22).
- **Contract drift promoted to a HARD GATE.** `ingestItems` pre-flight now throws on any drift.
  13/14 conform; **chem_1_4 is rejected** until its string `LESSONS[].number` → integer (deferred
  from the corpus). Once Mark fixes it: re-pull `upstream`, stage, ingest (gate admits it) → 14th.
- **Corpus re-ingested clean (13 fresh, ids 63–75, published 1.0.1).** Wiped the old empty-UNIT
  bundles (`scripts/wipe-bundles.ts`, new) and re-ingested the 13 conforming upstream files; all
  carry populated UNIT in the DB. Fidelity oracle refreshed to the populated-UNIT bio_1_4 + ARES's
  regenerated DOCX (Rock `out/ares-demo`, Desktop pending if wanted).
- **Teacher /admin UX fixed.** A Teacher who authenticates at `/admin` (stale cookie / admin login)
  was shown Payload's hard "no admin access" error. Now overridden via Payload's own
  `admin.components.views.unauthorized` → a server component `redirect('/')` to The App home.
  Verified on the Rock (Teacher→`/`, Editor→Dashboard). `importMap.js` regenerated canonically via
  `generate:importmap` (Rock, Node 22). See DECISIONS (2026-06-22).
- **On origin `c7b0589`; Rock mirrors origin, app rebuilt + up.** Types/migration/importMap were
  generated on the Rock (Node 22) then pulled to origin so **origin is the single source of truth**.
  `verify-rbac` 36/36; `roundtrip-regression` 3/3; hard gate proven to reject chem_1_4 live.
- **Rock staging dirs:** `out/ares-demo` (refreshed fidelity oracle — keep, used by
  `roundtrip-regression`), `out/ares-data` (the 13 staged corpus files — keep for re-ingest).
  Pre-existing untracked strays `11.17.0` (empty file) + `ingest-data/` (old bio_1_4) left as-is.

## 2026-06-18 (ARES contract — essentially converged)

- **Outcome: 13/14 ARES files now conform to our contract** (`upstream/main` @ `f36d47c`). Over a
  same-day back-and-forth Mark conformed the whole pipeline to `ares-contract v1.0.0` AND made the
  generator **schema-validate its own tool-use output + retry on off-schema** (the P1 validate-on-emit
  ask, built in). Drift trend 55→43→18→**8**. All earlier issues resolved upstream (bio_1_4 parse
  regression, `safetyNotes` corruption, stray `UNIT.keyInquiry`, missing `META`/`UNIT.content`,
  bio_3_1 gap). **We adopted ARES's canonical `storylineThread`** to match their SCHEMA.md (commit
  `8071078`; gate 10/10; live schema URL updated).
- **Only remaining drift:** the new **chem_1_4** sub-strand emits `LESSONS[].number` as a string
  (`"1"`) not an integer (all 8 lessons). Flagged to Mark. Corpus is also **growing past the original
  13** (Chemistry now appearing) — expect dozens→hundreds.
- **Drift snapshots committed:** `docs/drift.md` (latest = `c9a539f`, snapshot at `f36d47c`).

## SHIPPED 2026-06-17 (ARES data-contract)

- **Contract drafted, shared with ARES, and validated on every ingest.** ARES agreed to
  canonicalise output. `app/src/ingest/ares-contract.schema.json` is the single source of truth
  (co-located so the validator imports it AND it's the artifact shared with ARES). New
  `src/ingest/contract.ts` — a dependency-free subset validator (no ajv) emitting alias/typo-aware
  drift messages; was wired NON-BLOCKING into ingest pre-flight (later promoted to a hard gate, see
  2026-06-22). `scripts/contract-drift.ts` prints the full per-file report; `scripts/contract-check.ts`
  is the DB-less gate. See DECISIONS (2026-06-17) + `docs/ARES-DATA-REQUEST.md`.

## SHIPPED 2026-06-17 (§5 editor refinements code-complete + round-trip regression)

- **§5 editor refinements — all three code-complete** (no new stored fields / no migration). tsc 0 / eslint 0.
  1. **Live-unsaved preview:** `POST /:id/preview`: **EDIT-gated** (`isEditorFor` — Teachers→404; GET
     stays read-gated) and runs the posted data through the real save hook (`enforceBundleStructure`)
     so an Editor previews only what they could save (admin/structural change→422); 4 MB cap (413).
     `PreviewBundle` posts `reduceFieldsToValues(useAllFormFields())` via a hidden `<form target=_blank>`.
     GET/POST share one `renderPreviewResponse`. `endpoints/previewBundle.ts` + `components/PreviewBundle`.
  2. **Teacher format toggle:** `(frontend)/lessons/[id]` Standard/Compact `?format=` toggle
     (server-rendered searchParam); default stays Compact (2026-06-16 decision).
  3. **Array row labels:** all five nested arrays show "<noun> N — <field>" via ONE shared
     `components/RowLabel` (clientProps `{field,noun}`); single importMap.js entry. See DECISIONS.
- **Repeatable round-trip regression — DONE, 3/3 on the Rock.** `app/scripts/roundtrip-regression.ts`:
  one self-cleaning command that proves the *stored* path (seed-if-missing taxonomy → ingest
  `bio_1_4_data.js` → publish → `generateForBundle` → diff vs the approved DOCX, Resource column
  excluded). Fully in-process on the Rock. Tears down everything it creates in a `finally`. Committed
  `890632e`. Rock gotchas logged: (1) commit+push before the Rock `git pull` can see a script; (2)
  stage the approved DOCX + data file on the Rock (`ARES_DEMO_PATH`, e.g. `/srv/lesson3/out/ares-demo`).

## SHIPPED 2026-06-16 (§5 content preview)

- **§5 content preview — DONE, DEPLOYED + verified on the Rock.** Teacher view
  (`app/(frontend)/lessons/[id]`) renders all three documents (FE/ST omitted when absent). Admin
  draft-capable preview: `generator/previewBundle.ts` (HTML-only render core + shared `docxToSections`,
  no published gate), `endpoints/previewBundle.ts` (`GET /:id/preview?format=…`, access-gated via
  `findReadableBundle(draft:true)`, script-free CSP-locked HTML, 422 via `validateGeneratable` for
  incomplete drafts), a `PreviewBundle` button, `endpoints/parseFormat.ts` (shared `?format=` parser).
  - **On-screen preview defaults to COMPACT** (admin Preview keeps a toggle; teacher inline view is
    Compact-only). Reason: the Resource column is deferred/blank, so Standard's on-screen view shows
    an empty column. **Decided AGAINST injecting fixed column widths into the HTML preview** —
    faithful layout/colour belongs to the **PDF** (the converted DOCX). See DECISIONS 2026-06-16.
- **Corpus published + deduped → 13 canonical published bundles** (10 Biology + 3 Math); duplicates
  deleted. **6/13 produce empty FE/ST** (upstream gap — trust the generator's null buffers).
- **Codex review triaged.** Fixed: #5 (preview blanket-catch), #8 (`publish-drafts` exit code), #1
  (`PAYLOAD_SECRET` prod fail-fast), #10 (scaffold route removed). Deferred items rolled into the
  readiness backlog (see NEXT-SESSION).

## SHIPPED 2026-06-14 (web upload + .json ingest + branding + idle-logout)

- **Site-Admin web upload + `.json` ingest.** Ingest reads `.js` AND `.json` (`extractAresJson` =
  safe JSON.parse + `__proto__`/required-group guards). Site-Admin-only browser upload `POST
  /api/lesson-bundles/upload` (JSON-only, server-side `isSiteAdmin` gate) — a DEVIATION from SPEC §7's
  "no HTTP/upload surface", security-reviewed. Shared ingest core refactored to `ingestItems(payload, items)`.
- **Admin branding** "Lesson Plan Repository 3" (titleSuffix + custom Logo/Icon); **local Node pinned
  to 22.17.0** (`.nvmrc` + volta) to match the Rock.
- **Reliable idle-logout** (`IdleLogout` provider). Server-side 15-min expiry was already sound; added
  a wall-clock backstop so idle/backgrounded tabs terminate promptly. See DECISIONS (2026-06-14).
- **Phase 2+ "The App" decided:** a unified role-aware frontend all roles log into; cross-user
  features live here (browse/view/export, email-a-doc, messaging, translation, AI). See SPEC §2/§10.

## SHIPPED 2026-06-13 (§9 export first slice + compact format)

- **§9 export — first slice DONE and LIVE.** Per-export DOCX download as a `.zip` from the admin
  edit view, via a READ-access-gated endpoint `GET /api/lesson-bundles/:id/export?format=standard|compact`.
  Proven on the Rock: unauth → 401, bad format → 400, published → 200 + `application/zip` (3 docx).
- **Second LessonSequence format (`compact`).** Drops Section C's Resource column and re-balances
  widths. Lesson3-owned `app/src/generator/buildSowCompact.cjs` reusing vendored primitives; the
  vendored `standard` path stays byte-pristine (fidelity 3/3). New gate `app/scripts/format2-check.ts`.
- **Payload 3.85.0 → 3.85.1** (deliberate patch). **Dev caveat:** `payload generate:*` CLIs break on
  local Node 25 (bundled tsx 4.22.4); fine on the Rock's Node 22.

## Phases 0–4 (foundation, through 2026-06-09)

- **Phase 4 — DONE (bio_1_4 DB round-trip, 3/3 on the Rock).** Seeded Biology G10 + Mathematics G10
  → `ingest.ts` bio_1_4 → 1.0.0 draft → publish → generate → `compareDoc` vs approved = **3/3
  content-identical** (LessonSequence 381 blocks, FinalExplanation 52, SummaryTable 37; Resource
  column excluded). The architecture is validated end to end. See DECISIONS (2026-06-09 Phase-4 entry)
  for bugs fixed (the `payload run` silent no-op) + mechanics.
- **Phase 3 — safe ingest (SPEC §7).** Static extraction of ARES `.js` data modules → stored 1.0.0
  drafts via the Local API; dev-only CLI, never teacher-facing, **parsed, never executed**.
  - `app/src/ingest/extract.ts` — security-critical: `acorn` AST parse + `literalToJson` that
    evaluates ONLY pure data literals and **rejects** everything executable/dynamic via a
    `default`-throw (calls, identifier refs, member access, templates-with-`${}`, spread, getters,
    `__proto__` — at both object and `module.exports` layers). No `require`/`vm`/`eval`/`Function`.
    `acorn@8.16.0` is an exact direct dep.
  - `app/src/ingest/toBundle.ts` — inverse of the Phase-2 adapter (UPPERCASE groups → camelCase).
  - `app/src/ingest/validateGeneratable.ts` — completeness gate: META present; each lesson has `slo`
    + `summaryTablePrompt` + ≥1 framework phase; every `phase` ∈ vocab. Plus `deliverableWarnings()`
    (FE ≥1 section / ST ≥1 row) as WARN-ONLY (see the FE/ST decision, DECISIONS 2026-06-09).
  - `app/src/hooks/generatable.ts` — native publish-time gate (`ValidationError` when a publish isn't
    generatable; drafts may be incomplete WIP).
  - `app/src/ingest/index.ts` — read-only pre-flight (report every problem) then one all-or-nothing
    transaction; SubjectGrade resolved by exact `(Subject.name, grade)` match, require-existing, fail-loud.
  - GATE `app/scripts/ingest-extract-check.ts` (DB-less) — parity, non-execution canary, adversarial
    rejects, completeness assertions. DB-less gates honor `ARES_DEMO_PATH`.
  - **Decisions locked (DECISIONS 2026-06-09):** ingest = dev-only CLI / parse-never-execute;
    SubjectGrade exact-match/require-existing/fail-loud; ingested 1.0.0 is a DRAFT; FE/ST warn-only.
