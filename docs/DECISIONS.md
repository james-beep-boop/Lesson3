# Decisions & Lessons

Durable, team-visible record of decisions made during the build and lessons learned
from corrections. Committed to git (unlike the assistant's private cross-session memory).

- **SPEC.md** remains canonical for *architecture and domain rules*. This file is for
  build-time decisions and corrections that don't rise to the level of spec changes.
- **Newest entries on top.** Each entry: date, one-line title, then the decision/lesson
  and the reasoning. When a correction teaches a general rule, capture the rule, not just
  the incident.

---

## 2026-06-22 — Teachers redirected from /admin to The App (no "unauthorized" error)

A Teacher who authenticated against `/admin` (the admin login form, or a stale post-logout
cookie reopening `/admin`) hit Payload's hard **"this user does not have access to the admin
panel"** error. Teachers live entirely in The App (SPEC §2; DECISIONS 2026-06-14), so this is a
dead end. Fixed by **overriding Payload's built-in `unauthorized` view**.

- **Mechanism (verified in installed source).** On admin-panel-access denial, Payload's `RootPage`
  calls `redirect(handleAuthRedirect(...))`; for an *authenticated* user that targets
  `admin.routes.unauthorized` (`/admin/unauthorized`), which renders the default `UnauthorizedView`.
  `getRouteData` resolves a per-key custom view first (`getCustomViewByKey`), so
  `admin.components.views.unauthorized` overrides the built-in. This is the **single chokepoint**
  for every admin-access denial, so it covers all entry paths (login, stale cookie, direct nav).
- **Fix.** New server component `components/AdminUnauthorizedRedirect` = `redirect('/')` (The App
  home / lesson-plans browse). Server-side → no error flash. It only ever runs for a user who
  failed `canUseAdminPanel` (Teachers); every authenticated user can view `/` (`requireUser`).
  Hand-registered in `importMap.js` (generate:importmap blocked on local Node 25).
- **Why the view-override, not middleware.** A Next.js middleware can't distinguish a Teacher from
  an Editor: `roles` is `saveToJWT` but `assignments` is NOT, and `canUseAdminPanel` =
  `isSiteAdmin || assignments.length`. The decision needs the DB-backed user, which the
  Payload-rendered view already has. The view-override is also config-only, no new route.
- **Verified on the Rock** (curl with real logins): Teacher → `GET /admin` follows to
  `http://…/` (200, "Lesson plans"); Editor → `GET /admin` stays at `/admin` (200, "Dashboard").
  Admins unaffected. Test users seeded + deleted.

## 2026-06-22 — UNIT model fix + contract hard gate + clean corpus re-ingest (deployed)

Three converging tracks, all shipped and verified on the Rock. The interim UNIT model fix
(deferred since 2026-06-17) is done: the Sub-Strand Overview now renders end-to-end.

- **UNIT model (Track 3).** The `unit` group modelled only a dead `overview` stub (the generator
  never reads `unit.overview` — Section B reads `lesson.overview`), so ingest dropped ARES's now-
  populated `UNIT`. Replaced it with the **17 canonical UNIT fields** the generator's
  `subStrandOverview()` reads (`vendor/lib/sections.js`) and the contract declares: 5 short
  (`structureText`: gradeLevel/subject/strand/substrand/totalDuration) + 12 prose (`proseAdmin`:
  content/learningOutcomes/coreCompetencies/values/sep/pcis/careers/focus/drivingQuestion/
  phenomenon/supportingPhenomena/storylineThread). All admin-only — the `enforceBundleStructure`
  whitelist preserves the whole `unit` group wholesale for Editors (UNIT isn't in `EDITOR_INFLUENCED`),
  so no hook change was needed. Migration `add_unit_fields` (idempotent `IF [NOT] EXISTS` on both
  `lesson_bundles` + `_lesson_bundles_v`; drops `unit_overview`). **Proven:** `roundtrip-regression`
  3/3 on the Rock through the full DB path — **LessonSequence 381 → 408 blocks** (the +27 are the
  Sub-Strand Overview rows), FE 52 / ST 37 identical.
- **Contract → HARD GATE (Track 2).** Flipped the warn-only drift check to blocking: `ingestItems`
  pre-flight now throws on any non-empty `contractDrift(raw)` (all-or-nothing, like
  `validateGeneratable`). 13/14 upstream files conform (`f36d47c`); **chem_1_4 is rejected** until
  its string `LESSONS[].number` is coerced to integer — the gate doing its job (we deferred chem_1_4
  from the corpus accordingly). `contract-check` gained the string-number reject case (11/11).
- **Clean re-ingest (Track 3e).** Per the user: version lineage beyond 1.0.0 is disposable in early
  testing → **wipe + re-ingest fresh** (not in-place backfill). New `scripts/wipe-bundles.ts`
  (deletes all bundles incl. published, guarded by `--yes`; companion to `publish-drafts.ts` whose
  `--delete` refuses published). Wiped the 13 old empty-UNIT bundles → ingested the 13 conforming
  upstream files once (all passed the hard gate) → published. DB confirms all 13 carry populated
  UNIT (`unit_content`/`unit_storyline_thread`/`unit_learning_outcomes` non-null).
- **Fidelity oracle refreshed.** The Desktop/Rock oracle was stale (`UNIT={}`, May-30 DOCX with no
  overview). Re-staged from `upstream/main`: populated-UNIT `bio_1_4_data.js` + ARES's regenerated
  `Biology_Chemicals_of_Life_*` DOCX (`data/outputs/docx/Grade 10 Biology/Bio 1.4/`, confirmed to
  carry the overview rows; its `_data.json` UNIT is byte-identical to the data file). Oracle = the
  generator's own regenerated output (proves OUR pipeline matches the generator on the new data).

**LESSON — local `tsc` can't catch type errors from dropped/renamed Payload fields.** Dropping
`unit.overview` left a stale `unit: { overview: null }` literal in `scripts/adapter-fidelity.ts`.
Local `tsc` passed because **`payload generate:types` is blocked on local Node 25**, so the Mac's
`payload-types.ts` still had `overview`; the Rock's *regenerated* types removed it and `next build`
failed the type-check. Rules: (1) when dropping/renaming a Payload field, **grep the whole codebase
for the old name** before deploying; (2) to type-check against the real new types without a Rock
round-trip, **fetch the Rock-regenerated `payload-types.ts` and run `tsc` against it locally**
(done here — caught nothing further; all gates green pre-redeploy).

**Git flow note.** Types + migration are generated on the Rock (Node 22 + DB), but to avoid stranded
un-pushable Rock commits, their content was pulled to the Mac and committed to origin (`3b9a364`),
then the Rock `reset --hard origin/main`. **origin is the single source of truth; the Rock mirrors
it.** Verified on the Rock: migration applied (38 ms), `verify-rbac` 36/36, app up.

## 2026-06-17 — ARES data-contract: drafted, shared, and validated on every ingest

ARES (Mark) agreed to canonicalise their data output. Root cause of the blank Sub-Strand
Overview: 12/13 source files carry a rich `UNIT`, but our `unit` group was modelled as a stub
(`{overview}`) so ingest dropped it. We delivered our half of the offer — a contract + drift
validation — WITHOUT yet doing the interim UNIT model fix (still deferred).

- **Canonical schema is the single source of truth, co-located in the app.** Moved the drafted
  JSON Schema to `app/src/ingest/ares-contract.schema.json` (from `docs/`) so the validator
  imports it directly (`resolveJsonModule`) and Next bundles it — a relative import across the
  `app/` boundary is fragile. `docs/ARES-DATA-REQUEST.md` links to it there; it's both our
  validation source AND the artifact shared with ARES, so the two can't drift.
- **Hand-rolled subset validator, not ajv (`src/ingest/contract.ts`).** Only ajv 6 is present
  (transitive, draft-07) and the project pins deps deliberately; our schema uses a small fixed
  keyword set (type/required/properties/additionalProperties/items/enum/pattern/minItems/minimum),
  and hand-rolling lets us emit ACTIONABLE drift messages — alias hints (`UNIT.duration` →
  `totalDuration`) and typo hints (`slo.safety3otes` → corrupted `safetyNotes`). De-risked by a
  DB-less gate (`scripts/contract-check.ts`, 9/9: conforming→0 drift, null sections allowed, each
  drift class detected).
- **Drift is NON-BLOCKING (report, don't gate) — for now.** Current ARES output doesn't conform
  (that's the drift we report), so a hard gate would block ingesting the preliminary corpus.
  Wired into ingest pre-flight as a per-bundle warning (alongside `deliverableWarnings`), validated
  on the RAW UPPERCASE object the contract describes. Promote to a hard gate once ARES conforms
  (same staged approach as the FE/ST deliverable decision). `scripts/contract-drift.ts` prints the
  full per-file report — both a pre-ingest preview and the artifact we send ARES.
- **What the report found across the 13 files** (sent upstream): widespread `safetyNotes`
  corruption (`safety1otes`..`safety8otes` in 5 files), missing `META.titleDoc`/`substrand_id`/
  `substrand_name` in several, a missing `LESSONS[3].summaryTablePrompt.explained` (bio_3_1), the
  `duration`/`storylineThread` aliases + stray `UNIT.keyInquiry` (bio_2_1, math_*), bio_1_4's empty
  UNIT, and a universally-missing `schemaVersion`. Validates that the contract is doing its job.

## 2026-06-17 — Codex review of the §5 preview: POST authz/boundary hardened; triage

Codex reviewed the live-unsaved preview + editor refinements. No critical RCE/secret issue.
Fixed the three High findings (all in the new `POST /:id/preview`) + two Lows; the rest are
pre-existing/tracked. All fixes tsc 0 / eslint 0; DB-less gates still green (ingest 24/24,
adapter 5/5, format2, fidelity 3/3). **Behavioural verify is on the Rock** (`verify-rbac.ts`
covers `isEditorFor` + `enforceBundleStructure`; the round-trip script covers cleanup-exit).

**FIXED:**
- **#1 POST preview authz — was read-gated, now edit-gated.** My "equivalent to save-then-
  preview" claim was WRONG: a Teacher can read (and so could POST to) any *published* bundle,
  but cannot save — so read access let a non-editor drive the render path with arbitrary
  content. Rule: **unsaved preview is an EDITING affordance → require `isEditorFor` for the
  bundle's subject-grade** (Teachers → 404). GET stays read-gated (it shows only stored content).
- **#2 Field-boundary bypass — now reuses the save hook.** The whole-object overlay bypassed
  `enforceBundleStructure`'s editor whitelist, so an Editor could preview admin-only/structural
  changes they couldn't save. Fix: **call `enforceBundleStructure` (a pure, sync function)
  directly on the posted candidate** — Editor → prose-only overlay, structural change → 422,
  Subject/Site Admin → unrestricted. Reusing the hook (not a parallel whitelist) means preview
  and save can't drift — the key altitude point. The hook trusts that update-access already
  passed, which is exactly why #1's gate must run first.
- **#3 No payload cap — added.** Cap the posted JSON before parse/generate
  (`MAX_PREVIEW_JSON_BYTES = 4 MB`, 413). Full per-request body-limit + rate-limit + Jobs-Queue
  for generation stays the deferred production item (#2/#3 below).
- **#10 round-trip cleanup now fails the gate.** A self-cleaning gate that leaves rows behind is
  a failed gate (else CI/Rock silently accumulate state) — track cleanup failures, exit non-zero.
- **#9 RowLabel committed.** The new `components/RowLabel/` is part of the commit with its
  importMap entry (was untracked at review time).

**TRIAGED / pre-existing (NOT this session's regressions):**
- **#4 optimistic concurrency (`lockVersion` incremented but not checked)** — real, but
  pre-existing and already an open item; API/script updates can still clobber. Backlog.
- **#5 sanitize shared `docxToSections` HTML + add CSP to the teacher frontend route** — the
  same tracked XSS-hardening item (low exploitability today: prose is plain text, mammoth
  escapes; raise priority when Resource links land). The admin preview already sends a
  script-blocking CSP; the teacher Next.js route does not (needs an app-wide CSP strategy).
- **#6 FE/ST warn-only vs SPEC's three-documents** — the deliberate deferred decision (promote
  `deliverableWarnings` to a hard gate once the corpus is confirmed to always carry all three).
- **#7 dep advisories (vitest/postcss/esbuild, dev-tooling)** — backlog; deliberate pinned
  upgrade + re-run gates.
- **#8 no tests for POST preview authz/whitelist/limits** — fair. The logic is covered indirectly
  by `verify-rbac.ts` (roles + hook). Follow-up: add HTTP-level int tests (Teacher POST→404,
  Editor structural→422, oversize→413) — needs the cookie-auth + role-fixture harness the
  current `tests/int/api.int.spec.ts` lacks; deferred rather than shipped unrun (no local DB).

## 2026-06-17 — §5 editor refinements: live-unsaved preview, teacher format toggle, array row labels

Three §5 editor refinements (priority #2), code-complete + tsc/eslint clean; functional verify
is on the Rock (admin-component / endpoint / field-config changes → `up -d --build`, NOT a
script-only re-run). **No new stored fields, no migration, no payload-types regen.**

- **Live-unsaved preview.** Preview now reflects the editor's CURRENT form state — unsaved
  edits included — instead of only the latest saved snapshot. Added `POST /:id/preview`
  alongside the existing `GET` (`endpoints/previewBundle.ts`): same READ gate
  (`findReadableBundle(draft:true)`), then OVERLAYS the posted form values onto the stored
  bundle (pinning stored `id`/`_status` so the body can't spoof identity/exportability) and
  renders. Output stays HTML-only behind the same script-free CSP — rendering the caller's own
  posted content is **equivalent to save-then-preview**, so no new trust surface. The
  `PreviewBundle` control reads form state via `useAllFormFields` + `reduceFieldsToValues(.,true)`
  and submits a hidden transient `<form method=POST target=_blank>` so the new tab gets the
  endpoint's real HTML response (real CSP headers) — no fetch/blob round-trip. GET (saved) and
  POST (unsaved) share one `renderPreviewResponse` so they can't drift on gating/422/500/CSP.
- **Teacher format toggle.** The teacher inline view (`(frontend)/lessons/[id]`) gained a
  Standard/Compact toggle via a `?format=` **searchParam** (server-rendered, no client JS),
  matching the existing download links. Default stays **Compact** (the 2026-06-16 decision —
  Standard's Resource column is deferred/blank); Standard is available on demand.
- **Array row labels.** Collapsed rows for all five nested arrays (lessons, framework phases,
  FE sections, summary-table rows, rubric) now read "<noun> N — <first line of a field>"
  (e.g. "Lesson 1 — …", "Phase 2 — Observe Phase") instead of generic "Lesson 01". ONE shared
  client component `components/RowLabel` configured per array via `admin.components.RowLabel`
  `clientProps: { field, noun }`; falls back to "<noun> N" for an empty new row. **Lesson: one
  importMap.js entry covers all five** — the entry keys on the component PATH
  (`@/components/RowLabel#default`), not the call site, so reusing one component across many
  arrays needs a single hand-registered binding (generate:importmap still blocked on local
  Node 25). `PHASE_OPTIONS` has label===value, so the phase row label just shows `data.phase`
  — the component stays fully generic (`{ field, noun }`), no phase special-casing.

## 2026-06-17 — Repeatable round-trip regression (priority #1 DONE; 3/3 on the Rock)

The manual Phase-4 round-trip is now ONE self-cleaning command, run + green on the Rock.

- **New gate `app/scripts/roundtrip-regression.ts`.** Proves the *stored* path stays
  content-faithful (not just the DB-less `fidelity-spike`): seed-if-missing taxonomy →
  `ingestPaths(bio_1_4_data.js)` → 1.0.0 draft → publish → `generateForBundle('standard')` →
  `compareDoc` ×3 vs the approved DOCX (Resource column excluded for the SoW). Reuses
  `scripts/lib/docxDiff.ts`. **Result: 3/3 content-identical.** Runs fully in-process on the
  Rock — no Mac round-trip (the earlier Phase-4 proof pulled the DOCX to the Mac to diff).
- **Self-cleaning + non-destructive (the design rule for DB gates):** track every record the
  script creates and delete it in a `finally`, newest-first (bundle → SubjectGrade → Subject).
  Seed taxonomy only if absent and delete only what was seeded; ingest always creates a *fresh*
  draft, so the live published bundle is never touched. Cleanup runs on pass AND on crash, so
  re-running is always safe. (Same track-and-teardown pattern as `verify-rbac.ts`.)
- **Lessons (Rock script-run gotchas, both hit live):**
  1. **A script-only change must be committed + pushed before the Rock can run it.** The Rock
     bind-mounts `/srv/lesson3/app`; `git pull` only sees *committed* files — an uncommitted
     local script gives `ERR_MODULE_NOT_FOUND` for the `.ts` path. (Predicted, then hit.)
  2. **The approved DOCX + data file must be staged on the Rock** (e.g. `/srv/lesson3/out/
     ares-demo`) and pointed at via `ARES_DEMO_PATH`. They were Mac-only before this gate.
- **Invocation (deps-image + bind-mount + compose network, the established script-run line):**
  `docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules -w /app
  --env-file .env -v /srv/lesson3/out:/out -e ARES_DEMO_PATH=/out/ares-demo lesson3-deps
  npx payload run scripts/roundtrip-regression.ts`. Like the sibling gates, it's not a
  package.json script — the run command lives in the file header.

## 2026-06-16 — Preview layout: Compact default; HTML preview stays content-only (no width injection)

After deploying §5 and eyeballing real lessons in-browser, two layout decisions (don't re-litigate):

- **On-screen preview defaults to Compact.** The Resource column is deferred/blank, so Standard's
  HTML preview renders an **empty** column. Default both surfaces to Compact (the admin Preview
  keeps a Standard/Compact toggle; the teacher inline view is Compact-only — both export formats
  still download). Compact also gives the four content columns **equal** widths in the DOCX.
- **Do NOT inject fixed column widths into the HTML preview.** The browser's auto-layout makes the
  content columns uneven (sizes by text, ignoring the generator's DXA widths), which looks less
  balanced than the DOCX. We considered injecting the generator's `cw` proportions via a `colgroup`
  but **rejected it:** (1) it's cosmetic polish on the **content-preview tier**, which is explicitly
  *not* the faithful view; (2) it doesn't generalize — forcing the DOCX widths in **Standard** would
  reserve ~19% for the *empty* Resource column (worse, not better); (3) faithful layout/colour is the
  job of the future **PDF** (the *converted* DOCX), and the **DOCX export already has correct widths +
  colour**. Rule: the HTML preview is the fast content check; fidelity lives in the DOCX/PDF, never in
  a second HTML renderer (same single-source-of-layout-truth reasoning as the PDF decision).
- **Build gotcha (lesson):** the production `PAYLOAD_SECRET` fail-fast (#1) **broke `next build`** —
  build-time page-data collection runs with `NODE_ENV=production` but **without** the runtime secret
  (injected at container runtime via `--env-file`). Gate such runtime-only guards on
  `process.env.NEXT_PHASE === 'phase-production-build'`. Build-time config evaluation ≠ runtime.

## 2026-06-16 — §5 preview shipped; corpus published + deduped; Codex-review hardening

Three threads this session: the corpus went live, the §5 content preview shipped, and an
external (Codex) review was triaged.

**Corpus: 13 canonical published bundles (was 27 with duplicates).** The Rock had drifted
to 27 bundles — the Site-Admin web upload **dedups within a single request, not across
requests**, so re-uploading the same set created duplicate drafts (three waves on 06-14:
ids 36–47 and a verbatim 48–59, plus stragglers). Resolved by picking **batch B (48–59) +
bundle 33** (Chemicals, the fidelity oracle) as canonical — it already contained the only
pre-published members (33, 56, 59) so nothing had to be un-published — publishing its 10
remaining drafts and **deleting the 14 duplicates** (34–47). Result: one published bundle
per distinct sub-strand (10 Biology + 3 Math). New tool `app/scripts/publish-drafts.ts`
(`--list` / `--drafts` / id-list / `--delete`) did the batch work.
- **Correction — FE/ST presence:** a naive `--list` that checked field *truthiness* labeled
  all 13 as "FE ST", but the **generator's output is the truth**: **6/13 produce empty
  FE/ST** (the documented upstream gap). The field can be a non-null-but-empty group. Trust
  `generateBundleDocx`'s null buffers, not the stored field's truthiness.

**§5 content preview shipped (teacher + admin).** Teacher view now renders all three
documents (FE/ST omitted when absent). New **admin draft-capable preview** so an editor can
see saved-draft output before publishing. Design decisions:
- **Preview ≠ export — a separate HTML-only, draft-capable core.** `renderBundlePreview`
  (and the shared `docxToSections`) has **no published/exportable gate** — the deliberate
  difference from `generateForBundle`. It returns **HTML only, never DOCX bytes**, so it can
  never be an export bypass. Authorization is enforced at the endpoint
  (`findReadableBundle(draft:true)` — the read access rule still filters, so a Teacher can't
  reach a draft), exactly as the export endpoint does.
- **Incomplete-draft 422 reuses the publish gate.** The preview endpoint calls
  `validateGeneratable` (the same single-source gate `enforceGeneratable` uses) to return a
  **precise** "can't preview yet: <reasons>" (422); an unexpected throw *after* completeness
  passes is **logged and surfaced as 500**, not masked. (Fixes the first-draft blanket
  `catch` that turned every error into 422.)
- **Previews the latest SAVED snapshot**, not unsaved form state (live form-state preview is
  deferred — far bigger). Returned HTML page is **script-free + CSP-locked**; the frontend
  view relies on mammoth text-escaping (our prose is plain strings, no inline markup).

**Codex review — dispositions.** Fixed in-change: **#5** (blanket catch masking failures),
**#8** (`publish-drafts.ts` `process.exit(0)` overrode `process.exitCode` → false CI
success). Folded in as separate hardening: **#1** (fail-fast on missing `PAYLOAD_SECRET` in
production — was `|| ''`), **#10** (removed the dead `my-route` scaffold). **Deferred**
(pre-existing / already-tracked): #2 rate-limit/Jobs-Queue, #3 dep advisories, #6 FE/ST hard
gate, #7 official-version model, #9 CSRF posture (our preview is a read-only GET).
- **#4 XSS — kept as an open hardening item, not closed.** No *current* attacker-controlled
  HTML path (mammoth escapes text; our generated DOCX carries no user-controlled hrefs/
  images), but both preview surfaces *trust generated HTML*, so it stays a high-value
  hardening point. When the deferred **Resource-column links** land, sanitize in the shared
  `docxToSections` chokepoint (DOMPurify) — a deliberate dependency decision, declined for now.

**Calibration (lesson).** Two claims were corrected as overstated: "**Rock deploy** ≠
**production-ready**" (the Rock is a non-production verification environment; the audit's
production blockers stand), and the `validateGeneratable` happy-path invariant holds for
bundles **published via the normal hook**, not unconditionally (overrideAccess scripts /
legacy data / hook drift could violate it — the failure mode is a benign 422, not a crash).

## 2026-06-14 — PDF converter: open decision, but constraints locked (offline/free/faithful)

PDF output (and emailing/linking PDF + DOCX in the messaging platform) is confirmed in scope
(SPEC §9/§10). The converter is **not locked in**, but the constraints are:

- **Faithful** — must reproduce the generator's complex DOCX (40 tables, merged cells, shading,
  column widths). **PDF must be the *converted DOCX*, never a parallel renderer** (one source of
  layout truth — the same reason the mammoth view is a *content*-only preview). This **disqualifies
  semantic converters** (Pandoc, mammoth/HTML→Chromium/wkhtmltopdf): they reinterpret layout and
  won't match the approved DOCX. Good enough for a rough preview, not for the exact artifact.
- **Free — no paid/commercial product or service** (rules out Aspose/Apryse/Syncfusion/etc.).
- **Fully offline — no cloud** (rules out MS Graph convert and any metered API). Offline is a
  product goal; lesson content must not leave the box.
- These three together → the viable class is a **local office engine** (LibreOffice headless, or
  OnlyOffice/Collabora). There is **no lightweight free converter** at this fidelity — the bulk
  (~0.4–1 GB; minimal headless Writer ~0.4–0.7 GB, full suite ~1 GB+; ~150–300 MB RAM/run, slow
  cold start) is intrinsic to faithful Word layout. Fine on the Rock's **NVMe**.
- **Preferred packaging:** a **sidecar container** (e.g. Gotenberg wrapping LibreOffice — multi-arch
  incl. arm64, offline) so the app image stays slim and the converter is isolated/poolable. PDF is
  slow → **Jobs Queue (async)**.
- **How the engine gets chosen:** by a **golden-file fidelity test** (Word's own DOCX→PDF as the
  oracle) on a real ARES lesson, when the PDF slice is built. Until then, code calls a swappable
  **`docxToPdf(buffer)`** seam so nothing depends on the specific engine.
- **Artifacts are addressable/version-pinned/access-gated** (bundle, version, document, format,
  layout) — stable URLs that resolve deterministically (generation is content-stable). Email
  attaches freshly-generated bytes; messages link the URL; persistence/caching is a later
  optimization (avoids reintroducing media storage now).

## 2026-06-14 — Architecture: a unified role-aware App for all users + `/admin` as back-office

Confirmed the product is **two front-ends over one Payload backend** (one runtime/auth/access):
**The App** — a role-aware front-of-house frontend (`app/src/app/(frontend)`) that *all four roles*
log into — and **Payload `/admin`** as the content/admin back-office. See SPEC §2 ("Two application
surfaces") + §10 (the now-confirmed cross-user workflows).

- **What forced the decision.** The user confirmed a set of features **common to every role**:
  browse/view/export, **email a document**, **internal messaging + notifications** (any user → any
  user, optional bundle link/attachment), **translation** (Swahili), and **AI features**. A
  teacher-only frontend would force duplicating those across two apps (or making editors switch
  apps). So they belong in one shared App; `/admin` stays the editing/management console for
  Editors/Subject Admins/Site Admins.
- **Roles map cleanly to surfaces.** Teachers (the majority) live *entirely* in the App
  (intentionally excluded from `/admin`). Editors/Subject Admins use the App for the common
  features and `/admin` for editing; Site Admins administer in `/admin`. The §13 minimal-UI
  principle governs the App's role-aware rendering (show only what the role can do).
- **Resolves prior open decisions.** SPEC §2 "editor placement" → start in `/admin`, optionally
  move editing into the App later (the §5 Phase-2 custom editor, now well-motivated). SPEC §10
  workflows (messaging/favorites/browse) → **confirmed in scope**, plus email-out, translation, AI.
- **No core-architecture change.** New surface = the already-scaffolded `(frontend)` route on
  Payload's API + auth; new features = ordinary Payload collections/endpoints/hooks + the Jobs
  Queue. Single runtime preserved. Outbound services (AI, email, translation) stay server-side,
  rate-limited (§11); AI uses the current Claude API/models.
- **Sequencing.** Phase 2+ track; does NOT block current `/admin` work (publish the uploaded
  drafts, §5 editing cleanup). Recommended first App slice: the teacher-critical path
  (browse → view → export — the majority's core need and the only surface that doesn't exist yet).

### Sample role logins for UI testing (2026-06-14)

Added `app/scripts/seed-users.ts` — creates one Teacher, one Editor, one Subject-Grade Admin
(Editor + Subject Admin scoped to Biology G10 by default) via the Local API, to exercise the
role-tailored UI. Credentials from env or randomly generated + printed once (no secrets committed);
idempotent (skips existing emails). Run on the Rock (needs a DB). Note: the Teacher login has **no
surface until The App exists** — it's created ready for that.

## 2026-06-14 — Admin session timeout: 15-min expiry + reliable idle-logout backstop

Auth `tokenExpiration: 900` (15 min) is the admin inactivity window (commit `d0cf69a`).
Investigated a report that the "Stay logged in?" modal lingered for a very long time and the
session seemed resurrectable. Traced through the installed Payload 3.85 source and confirmed
behavior on the Rock:

- **Server-side enforcement is sound — no security hole.** The auth cookie's `Expires` and the
  JWT `exp` are both `issuedAt + tokenExpiration` (`auth/cookies.js` `getCookieExpiration`;
  `auth/jwt.js`). `jwtVerify` (jose) rejects an expired JWT, and the `refresh-token` operation
  throws `Forbidden` without a valid `req.user` (`auth/operations/refresh.js`). So after 15 min of
  real time the session genuinely dies — confirmed: reloading/navigating past the window bounces
  to login. No `autoLogin` is configured (ruled out as a resurrection path).
- **The defect was client-side.** Payload's *proactive* auto-logout is a single `setTimeout`
  scheduled for the deadline (`providers/Auth/index.js`); browsers throttle/suspend timers in
  backgrounded or slept tabs, so an idle tab lingers past expiry and only clears "eventually" (on
  the next server interaction). Annoying, not a breach — a stale tab can't act once the token dies.
- **Fix — `IdleLogout` wall-clock backstop** (`app/src/components/IdleLogout`, mounted via
  `admin.components.providers`, so it's always inside `AuthProvider`). Uses Payload's own auth
  context (`tokenExpirationMs` + `logOut`): a 30 s interval (focused-idle tab → out within ~30 s)
  plus `focus`/`visibilitychange` (slept/backgrounded tab → out immediately on return). It never
  logs out an active user — `tokenExpirationMs` advances on every refresh (activity or clicking
  "Stay logged in"). It changes no server behavior; it only makes the tab terminate promptly.
- **General rule:** don't rely on a single client `setTimeout` for security-relevant timing —
  browsers suspend timers off-screen. Enforce server-side (already true here) and, for UX, check
  the wall clock on an interval + visibility/focus.

## 2026-06-13 — Site-Admin web upload for ingest (DEVIATION from SPEC §7 "no HTTP/upload surface")

The user asked for an in-browser upload to add bundles, Site-Administrator-only, with the
control hidden from everyone else. This **reverses** SPEC §7's original "ingest is … never an
HTTP/upload surface." Recorded as a deliberate, documented deviation; SPEC §7 updated.

- **Why it's now safe.** The original rule existed to prevent **executing uploaded `.js`** (RCE).
  Uploads are never executed: the web path is **JSON-only** (`JSON.parse` via `extractAresJson`).
  `.js` stays CLI-only. So the threat the rule guarded against doesn't apply to the web surface.
- **Authorization is server-side, not cosmetic.** `POST /api/lesson-bundles/upload`
  (`app/src/endpoints/uploadBundles.ts`) enforces `isSiteAdmin(req.user)` → 401/403; the
  self-hiding list panel (`app/src/components/UploadBundles`, `beforeListTable`, returns null
  unless `roles` includes `siteAdmin`) is convenience only. `roles` is `saveToJWT`, so the client
  check needs no fetch.
- **Guardrails:** JSON only (`.json` extension + content-type-agnostic safe parse), per-file 5 MB
  / 50-file caps, the same `validateGeneratable` + exact-match taxonomy gates as the CLI, and the
  same **all-or-nothing** transaction. Pre-flight failures → **422** with the actionable per-file
  message; nothing written. Bundles land as **drafts** — publish stays a separate step (no
  auto-publish from upload).
- **Shared core (no duplication).** Refactored `app/src/ingest/index.ts` to a single
  `ingestItems(payload, items)` where each item is `{ name, extract() }` (a thunk so parse
  errors aggregate in pre-flight). `ingestPaths` (CLI) and the endpoint both call it; the endpoint
  runs it as the trusted system path *after* the Site-Admin gate.
- **Verified:** `tsc` 0 / eslint 0; ingest gate 24/24; importMap hand-updated for the new
  component (the `payload generate:importmap` CLI is blocked locally by the 3.85.1/Node-25 tsx
  bug — entry added with Payload's exact `default_<md5(path)>` binding so a Rock regen is a no-op).
  **Endpoint + panel are runtime-tested on the Rock (need a DB).** TODO before real exposure:
  **re-run `security-review`** on this web ingest surface (SPEC §7 calls ingest the highest-risk
  surface; a web entry point warrants a fresh pass).

## 2026-06-13 — Ingest accepts `.json` exports as well as `.js` modules (SPEC §7)

ARES prefers JSON as the transport format (and its repo now emits `*_data.json` exports), so
ingest now reads both. Confirmed the two are equivalent before building: for the same
sub-strand the `.js` module and ARES's official `.json` export are **deep-equal** (verified
on bio_3_3 — same five groups, same fields, ~213 KB each; neither carries `framework[].resources`,
so JSON does *not* un-blank the Resource column — that's still ARES's build-time Python step).

- **Only the read step differs; everything downstream is shared.** New `extractAresJson(source)`
  in `src/ingest/extract.ts` is the `.json` sibling of `extractAresData`. `src/ingest/index.ts`
  picks by extension (`gatherDataFiles` accepts `.js`/`.json`; `extractDataFile` branches), then
  feeds the same `rawToBundle → validateGeneratable → create` pipeline. Proven: a real clone
  `.json` → `extractAresJson` → `rawToBundle` is deep-equal to the `.js` path (0 validate problems).
- **Security: no new execution surface.** `JSON.parse` only yields data — there is no
  parse-never-execute concern as there is for `.js`. We still apply the structural guards the
  `.js` path enforces, for parity: reject a non-object root, **recursively reject `__proto__`
  keys** (JSON.parse makes `__proto__` an own property rather than polluting the prototype, but
  we reject it so downstream spread/assign can't be surprised), and require the five top-level
  groups.
- **CLI unchanged in spirit** — `payload run scripts/ingest.ts -- <file.js | file.json | dir>`;
  a directory ingests every `.js`/`.json` in it. (Pointing at a dir holding BOTH a `.js` and a
  `.json` for the same sub-strand would create two bundles — ingest has no dedupe; in the ARES
  clone the two live in different dirs so this doesn't arise.)
- **Verified:** `ingest-extract-check.ts` extended to **24/24** (round-trip JS↔JSON parity +
  the three reject guards + accept-valid); `tsc` 0 / eslint 0.

## 2026-06-13 — Payload 3.85.0 → 3.85.1 (deliberate patch bump)

Took the 3.85.1 patch after reviewing the changelog (none of the seven fixes touch us —
they're upload-collections / import-export-plugin / conditional-tabs / TS6 areas we don't
use). Bumped all six pins (`payload` + `@payloadcms/{db-postgres,email-nodemailer,next,
richtext-lexical,ui}`) to exact `3.85.1`; transitive `@payloadcms/{drizzle,graphql,
translations}` followed. Verified locally: `tsc` 0, eslint 0, **fidelity 3/3**, **format2
7/7** — the fidelity-critical chain is intact.

- **Caveat (dev-env only) — `payload generate:importmap`/`generate:types` fail locally on
  Node 25.** 3.85.1 bundles `tsx@4.22.4`, whose loader throws
  `ENOENT … node:path?tsx-namespace=…` under **Node 25** (my local). It works on **Node
  22.17.0** (the Docker base, `app/Dockerfile`) — so the **Rock is unaffected** (build,
  migrations, `payload run` scripts all run on Node 22). Our own DB-less gates use the
  project's `tsx@4.21.0` devDep and are fine. **Not worked around:** an `overrides: { tsx }`
  pin (a) didn't re-resolve payload's nested copy cleanly and (b) would impose a tsx pin on
  the Rock to paper over a local bleeding-edge-Node issue — wrong trade. To run those two
  CLIs locally, use Node ≤23 (or the deps Docker image); otherwise they run on the Rock.
- **Deferred-to-Rock verification (unchanged from prior workflow).** `generate:types`,
  `generate:importmap`, and `next build` run on the Rock at deploy (Node 22). `next build`/
  `test:int` were already Rock-only (need a DB). The committed `importMap.js` and
  `payload-types.ts` are valid as-is — a patch with no schema/field change on our side
  doesn't alter generated output, and `tsc` passes against the committed types under 3.85.1.
  If `generate:types` yields a diff on the Rock, commit it.

## 2026-06-13 — Second LessonSequence DOCX format (compact, no Resource column)

Added a **second LessonSequence layout**, selectable per-export, alongside the existing
(now-named `standard`) one. The new `compact` format addresses two complaints with the
upstream layout: the narrow first column wrapped phase names mid-word, and the Resource
column rendered blank (the Python recommender is out of scope — see the 2026-06-08/09
resource decisions). Only **Section C** ("C. Lesson Implementation Framework") differs;
FinalExplanation and SummaryTable are identical across formats.

- **What changes.** `standard` Section C = 6 columns `[900, 2300, 2556, 3324, 2300, 2300]`
  with the (blank) Resource column. `compact` = 5 columns, Resource **removed**, widths
  `[2261, 2854, 2854, 2854, 2857]` DXA — Phase fixed at **1.57″ (2261 DXA)**, the other
  four split the remaining content width evenly so the row sums to exactly **13680 DXA**
  (no overflow). The four flex widths are *derived from* the vendored content width `W`
  (`floor((W − 2261) / 4)`, remainder on the last column), so they track any future margin
  change automatically.
- **Width reasoning (recorded so it isn't re-litigated).** Page is landscape US Letter
  (15840 DXA wide). The generator **overrides** margins to 0.75″ (1080 DXA), giving a
  **13680 DXA (9.5″)** content area — *wider* than docx's default 1″ margins would
  (`docx@9.6.1` `sectionMarginDefaults` = 1440 all round → 12960 DXA / 9.0″). The user's
  first instinct (four 2.00″/2880-DXA columns) overflowed by ~0.07″; at the kept 0.75″
  margins, even columns land at **1.98″ (2855 DXA)** and fit exactly. Chosen:
  keep 0.75″ margins, columns ≈ 1.98″. Phase column was explicitly kept at 1.57″.
- **Where the toggle lives — per-export parameter, NOT stored on the bundle.** Confirmed
  with the user. A format is a *presentation* choice; storing it on the versioned bundle
  would couple data to presentation and need a migration, against "edit the data, never the
  document" (SPEC §5). So `format: 'standard' | 'compact'` is a function/CLI argument
  (default `'standard'`), threaded `generateBundleDocx` → `generateForBundle` → the
  `generate-bundle` CLI `--format=` flag, and ready for the future §9 export/preview UI to
  pass per request. No schema change, no migration.
- **Vendored code stays byte-pristine.** Format 1 remains the pure vendored path
  (`vendor/lib/build_docs.js` → `sections.js`), so its fidelity is untouched — re-verified
  **3/3 content-identical** via `fidelity-spike.ts`. Format 2 is Lesson3-owned
  `app/src/generator/buildSowCompact.cjs`: a CommonJS bridge that **reuses** the vendored
  primitives (`docx_kit`) and unchanged section builders (`sectionA/B/D/E`,
  `titleBlock`, …), re-implementing only `sectionC` + the `buildSoW` wrapper. It is loaded
  via `createRequire` like the vendored generator; a one-file eslint override exempts it
  from the ESM-only `no-require-imports` rule (require() is correct for the CJS bridge).
- **LESSON — a CJS bridge file outside `vendor/` MUST be `.cjs`, not `.js`.** First written
  as `buildSowCompact.js`; it ran under `tsx` (which transpiled it) but **broke under
  `payload generate:importmap`** with "require is not defined in ES module scope". Cause:
  the app root `package.json` is `"type":"module"`, so a bare `.js` there is ESM; the
  vendored `.js` only load as CJS because `vendor/package.json` declares
  `"type":"commonjs"`. Node's native `require(ESM)` path (used by the Payload CLI, not just
  tsx) then loads the `.js` as ESM and `require`/`module.exports` are undefined. Fix: the
  `.cjs` extension forces CommonJS unconditionally. Rule: any new require()-style bridge
  module living under the `"type":"module"` tree gets `.cjs` (or its own
  `package.json{"type":"commonjs"}`).

### §9 export — first slice: web download with the format toggle (2026-06-13)

Wired the standard/compact toggle into the admin UI (the user's follow-up: "toggle from the
web interface, not just the CLI"). This is the first piece of SPEC §9 (export/sharing) —
there was no export endpoint or admin component before.

- **Output = all three DOCX as one `.zip`** (confirmed with the user), mirroring the CLI.
  `jszip` promoted from transitive to an **exact direct dependency (3.10.1)** — it's now
  runtime app code, so the Rock's `npm ci` must resolve it from the lockfile (same reasoning
  as the acorn promotion). The format only changes the LessonSequence; FE/ST are identical.
- **Endpoint = Payload collection endpoint** (`app/src/endpoints/exportBundle.ts`), mounted
  `GET /api/lesson-bundles/:id/export?format=standard|compact`. Payload-first: a native
  collection endpoint, not a hand-rolled Next route, so it gets `req.user` + the Local API.
  **Authorization lives here, by design** — `generateForBundle` fetches with
  `overrideAccess:true` (trusted system path, per its own security note), so the endpoint
  FIRST re-reads the bundle with `overrideAccess:false` + `user` to enforce `lessonBundleRead`
  (a Teacher can export only published bundles; an Editor only within their subject-grades →
  else 404). `NotExportableError` (draft) → 409; bad format → 400; no user → 401.
- **Admin control = client component** (`app/src/components/ExportBundle/index.tsx`) injected
  via `admin.components.edit.beforeDocumentControls`. `useDocumentInfo()` gives `id` +
  `hasPublishedDoc`: hidden on unsaved docs, disabled (with a "publish to enable" tooltip)
  when no published version exists. Download is a same-origin `window.location` GET so the
  admin auth cookie rides along; the attachment Content-Disposition downloads without
  unloading the edit page. Registered in the import map (`@/components/ExportBundle#default`,
  committed `importMap.js`).
- **Synchronous for now.** SPEC §9 mentions the Jobs Queue for long generations; a single
  bundle generates in well under a second, so v1 returns the zip inline. Promote to the Jobs
  Queue if/when batch or very large exports need it.
- **Verification.** `tsc` 0 / eslint 0; `generate:importmap` loads the whole config through
  the new endpoint→generator→`.cjs` chain (also how the `.js`→`.cjs` bug surfaced);
  standalone zip round-trip = 3 valid DOCX entries; both DOCX gates still green
  (fidelity 3/3, format2 7/7). Endpoint+button runtime-tested on the Rock (needs a DB).
- **Deploy delta.** Unlike the CLI-only change, this adds app-server code + a dependency +
  a component, so the Rock needs a full `docker compose up -d --build` (not `git pull` +
  re-run), and `npm ci` picks up jszip from the committed lockfile.
- **Verification.** New DB-less gate `app/scripts/format2-check.ts` (7/7): unzips
  `word/document.xml`, asserts compact Section-C grids are 5-col `[2261,2854,2854,2854,2857]`
  summing to 13680, standard stays 6-col with Resource, no cross-leak, and FE/ST
  **content** (document.xml) is identical across formats. Note: full-buffer byte-equality
  is *not* a valid assertion — `docProps/core.xml` carries a per-build timestamp, so
  "byte-stable regeneration" (SPEC §4) means *content*-stable; compare `document.xml`, as
  the fidelity gate already does via mammoth. `tsc` 0 / eslint 0; standard fidelity 3/3.

## 2026-06-09 — Phase 3: safe `.js → JSON` ingest (SPEC §7)

Built the ingest path on `main`: ARES `.js` data modules → stored bundles created as 1.0.0
drafts via the Local API. New code under `app/src/ingest/` (`extract.ts`, `toBundle.ts`,
`validateGeneratable.ts`, `index.ts`, `errors.ts`), the CLI `app/scripts/ingest.ts`, the
native publish hook `app/src/hooks/generatable.ts`, the shared phase vocab
`app/src/fields/phases.ts`, and the DB-less gate `app/scripts/ingest-extract-check.ts`.
Decisions (confirmed with the user at design time):

- **Ingest is DEV-ONLY, a CLI, never teacher-facing.** Run by the app developer or the
  lesson-plan author (`payload run scripts/ingest.ts`). No HTTP/upload surface, no upload
  RBAC — the SPEC §9 endpoint stays deferred. It is a trusted Local-API system call
  (`!req.user` → `enforceBundleStructure` treats it as the system path).
- **Safe extraction = static `acorn` parse, evaluate literals only, NEVER execute.** The
  untrusted-input contract (SPEC §0/§7): parse to an AST and statically evaluate ONLY pure
  data literals (string/number/bool/null/array/object, plus unary ± on numbers and
  zero-expression template literals). REJECT everything executable/dynamic — calls,
  identifier references inside data, member access, template-with-`${}`, spread, getters,
  `__proto__` keys. No `require`/`vm`/`eval`/`Function`. acorn@8.16.0 was already in the
  tree (via Next/Payload); promoted to an exact **direct** dependency. (`tsc`/`typescript`
  could parse too but acorn is the lighter, purpose-built ESTree tool.)
- **`acorn`-as-direct-dep lockfile sync.** acorn was already resolved at 8.16.0 in
  `package-lock.json` (transitive); adding it to root `dependencies` needed only
  `npm install --package-lock-only` (one-line lock diff, zero version churn) so the Rock's
  strict `npm ci` stays in sync. **No migration / no schema change this phase** (only hooks
  + validation + a dep — `generate:types` left `payload-types.ts` byte-identical).
- **SubjectGrade: EXACT `(Subject.name, grade)` match, require pre-existing, fail loud.**
  The `.js` META carries only `subject` (free text) + `grade` (int), not a SubjectGrade id.
  Resolve by exact name match (trimmed) — **no fuzzy matching** (a silent mis-assignment
  corrupts RBAC scope, worse than a clear failure). Missing taxonomy aborts with an
  actionable message listing existing subjects. **No `--seed`/auto-create** — keeps the
  curated junction-entity invariant (2026-06-09 SubjectGrade decision) pure; seed taxonomy
  first. A read-only **pre-flight** resolves/validates all files and reports every problem
  before any write; the actual writes run in **one all-or-nothing transaction**.
- **Ingested 1.0.0 is a DRAFT; an administrator reviews & publishes.** Lesson plans land as
  `_status: 'draft'` (not official, not exportable) until an admin publishes (SPEC §6).
  Teachers never upload and never publish — they view/export published bundles only.
- **Generator-completeness gate, built the Payload-first way (the export-correctness check
  Codex flagged).** Schema-required fields + publish status are NOT enough: the generator
  unguarded-dereferences `lesson.slo.purpose`, `lesson.summaryTablePrompt.observed`,
  `lesson.framework.map(…)` and reads `META.*` (verified in `vendor/lib/sections.js` /
  `build_docs.js`); FE/ST are fully guarded there, so they're not gated. `validateGeneratable`
  (a pure function, single source of truth) requires META + per-lesson `slo`/
  `summaryTablePrompt`/≥1-phase + every phase ∈ vocab. Wired three ways: (1) the ingest
  script rejects incomplete data pre-write (even as a draft); (2) a native `beforeValidate`
  hook `enforceGeneratable` throws a Payload `ValidationError` **when the write would be
  PUBLISHED** — so it surfaces in the admin UI and via the Local API, not just the export
  path; drafts may be incomplete WIP; (3) native `minRows: 1` on `lessons` + `framework`
  for inline admin feedback (skipped on drafts, which is fine — the hook is the authority).
  Export then trusts validated-in data. The adapter's array-coercion stays the type-safety
  backstop (it can't *crash*); completeness is content-correctness, enforced here.
- **GATE `app/scripts/ingest-extract-check.ts` (DB-less, 13/13).** (1) PARITY — static
  extraction of `bio_1_4_data.js` deep-equals `require()`ing it (execution used ONLY as the
  test oracle, never in the product path). (2) SAFETY — a non-execution canary (a benign
  top-level statement never runs) + eight adversarial modules (require-in-data, member
  access, template-with-expr, identifier ref, IIFE, binary op, `__proto__` key, undefined
  export) all rejected. (3) completeness assertions. By transitivity with the Phase-2
  adapter gate (which runs `require(bio_1_4)` → adapter → DOCX, 5/5), extract → DOCX is
  proven faithful. All gates green: extract 13/13, fidelity 3/3, adapter 5/5, `tsc` 0,
  `lint` 0 errors.
- **`security-review` DONE (Phase 3 task 4) — no qualifying findings.** Reviewed the
  extraction + orchestration: no `require`/`vm`/`eval`/`Function` on the product path; the
  literal evaluator's `default`-throw rejects every executable/dynamic node; query inputs
  (`META.subject`/`grade`) are type-guarded and flow only through Payload's parameterized
  ORM; CLI paths are trusted; a malicious `.js` can't self-publish (explicit `draft: true`
  + `rawToBundle` shape). DoS/resource-exhaustion is out of scope by policy.
- **Still TODO:** the true DB round-trip — ingest → stored 1.0.0 draft → publish →
  `generateForBundle` → diff vs approved — is Phase 4 (needs a DB; run on the Rock).

## 2026-06-09 — Transport format from ARES: JSON preferred (not `.js`+JSON, not DOCX)

ARES asked which format Lesson3 needs to **store, edit, and generate** lesson plans: the JSON,
the `.js`, or both. **Answer: the data once — JSON preferred. Not both; not the rendered DOCX.**

**Why one format suffices.** Transport (how ARES hands us a lesson) is separate from storage. At
ingest, Lesson3 extracts the data and keeps it as **structured JSON in Postgres** (native Payload
fields, versioned). Store/edit/generate all run off that stored JSON; the DOCX/PDF are
regenerated build artifacts. So the original file is only an ingest *seed* — needed once, in one
form. This is exactly SPEC §3 ("canonical storage format is JSON; ingest extracts the `.js`").

**Why JSON over `.js` (recommend ARES emit JSON going forward).**
- **Safety:** a `.js` module is executable code, so ingest uses a deliberate parse-but-never-run
  extractor (acorn AST, literals only — the RCE-avoidance machinery). **Pure JSON is inert** →
  `JSON.parse`, no risk surface, no AST walk.
- **No JS-only quirks:** JSON sidesteps the things we had to special-case in the `.js`
  (cross-line string concatenation `'a\n' + 'b\n'`, single-quoted/unquoted keys in the Math
  files, `//` comments). JSON is lossless for this data — the modules are pure literals.

**Not needed:** both formats (identical data, redundant); the generated DOCX/PDF (we reproduce
them byte-faithfully — proven for bio_1_4). **Shape unchanged:** `{ META, UNIT, LESSONS[],
FINAL_EXPLANATION, SUMMARY_TABLE }`, ideally with the resolved `resources` included (see the
resource-sourcing entry below).

**Our-side follow-up (small, when ARES switches):** add a **direct `.json` ingest path** beside
the `.js` extractor — `JSON.parse` → the SAME `rawToBundle` + `validateGeneratable` + Local-API
create. Keep the `.js` extractor for backward compatibility / mixed inputs. No schema change;
just an input-format branch in `app/src/ingest/`.

## 2026-06-09 — Resource column: source resolved resources FROM ARES (un-defer the rendering)

Reviewing the Phase-4 output, the user flagged the blank Resource column as a major fidelity
issue — a blank column makes the document look incomplete, even though the *links* are useless
to the offline-majority audience (the original deferral rationale, 2026-06-08). Extracted the
approved column to confirm what it holds: **per-lesson recommended resources** — a video and a
reading, each `title + source` + "Search ARES" links (e.g. *Gene Expression Essentials* / PhET;
*…DNA Codons* / MIT Blossoms). Verified this text is **NOT in our pipeline**: bio_1_4's framework
rows carry no resource field, and the vendored generator pulls the column from the `aresResources`
*module* (our blank shim), not from the lesson data. (Also: the recommender's matches are uneven —
a DNA video landed on the diet-themed Lesson 1.)

**Decision (user-chosen): source the resolved resource data FROM ARES**, carry it through ingest
via the existing `framework[].resources` seam, and render it via an updated shim — no live Python,
no DOCX back-extraction, generalises to every bundle. This refines (not reverses) the deferral:
we still don't run the recommender; we ingest its *output as data*. The two lighter options were
declined: (b) one-off extraction from approved DOCX (doesn't generalise, inherits mismatches),
(c) keyword-only "Search ARES" guidance (non-blank but not the real titles).

**Data contract requested from ARES (per lesson — resources render identically across a lesson's
phases):**
```
resources: {
  video:   { title, source, direct_url?, search_url },
  reading: { title, source, direct_url?, search_url }
}
```
Delivery: ideally embedded in the `.js` data files (a lesson-level `resources`, or on each
`framework[]` row), else a side JSON keyed by (substrand_id, lesson number). `direct_url` may be
dead/omitted (offline) — `title`/`source` are what make the column non-blank.

**Our-side work (scoped, PENDING the data shape — do NOT build speculatively):**
1. **Schema gap:** the current `resourceLink` is `{ title, direct_url, search_url }` — **add
   `source`** (a migration). Hold until ARES confirms the shape/granularity (per-lesson vs
   per-phase).
2. **Render:** rewire the Lesson3 shim `vendor/aresResources.js` (`buildResourceParagraphs` /
   `getAllPhaseResources`) to render the stored resources (the 📹 VIDEO / 📖 PDF / Source / Search
   layout) instead of a blank paragraph — still pure Node, no Python.
3. **Ingest:** already carries `framework[].resources` through (adapter tolerates populated or
   empty); confirm the inbound shape maps cleanly.
4. **Fidelity gate:** once resources render, the diff can *stop* excluding the Resource column for
   bundles that have resource data (or keep excluding where `direct_url`s differ run-to-run).

Open question to settle with ARES: **per-lesson or per-phase** resources? Rendered output is
per-lesson; model accordingly once confirmed.

## 2026-06-09 — Phase 4 DONE: bio_1_4 DB round-trip proven on the Rock (3/3)

Closed the full pipeline against the real Postgres DB on the Rock: seeded taxonomy (Biology
G10, Mathematics G10) → ingested `bio_1_4_data.js` via the CLI → stored 1.0.0 draft (id 33) →
published → generated the three DOCX → diffed vs the stakeholder-approved set. **3/3
content-identical** (LessonSequence 381 blocks, FinalExplanation 52, SummaryTable 37; Resource
column excluded). The architecture is validated end-to-end: edit-the-data → regenerate
byte-faithful documents, through ingest + Postgres + versioning + the generator.

Two bugs surfaced + fixed, one wrinkle flagged:
- **[FIXED, `f696214`] `payload run` tears the process down before async work finishes.** The
  script scaffolds ended with a detached `run().then(() => process.exit(0))`. `payload run` only
  `await`s the module's EVALUATION, then calls `process.exit(0)` unconditionally
  (`payload/dist/bin/index.js:53,76`) — so the first two ingest attempts exited 0, created 0
  rows, and printed nothing (silent no-op; both the "no output" AND "no data"). Fixed with
  top-level `await run()` (like `verify-rbac.ts`, which always worked) + an explicit trailing
  `process.exit(0)` (so it also exits under `tsx`, where getPayload keeps the DB pool open).
  Applied to `ingest.ts`, `generate-bundle.ts`, `publish-bundle.ts`. **Rule: any `payload run`
  script MUST top-level-await its work — never fire-and-forget.**
- **[ADDED, `afd6f80`] `scripts/publish-bundle.ts`** — Local-API publish (`payload.update`
  `_status: 'published'`, overrideAccess). The admin "Publish Changes" button is disabled on a
  pristine/unchanged draft (expected Payload behavior — the form must be dirty), so a scripted
  publish is the clean path for round-trips.
- **[NOT A BUG — corrected] The 1.0.0 → 1.0.2 semver was TWO publishes, not a double-bump.**
  Initially mis-diagnosed as a single publish double-bumping; the user clarified they ALSO
  published via the admin UI (after a trivial edit to un-grey the disabled "Publish Changes"
  button) in addition to the scripted `publish-bundle.ts`. So: ingest 1.0.0 → publish 1.0.1 →
  publish 1.0.2 — **one bump per publish**, which is exactly what `enforceBundleStructure` does
  (every `update` bumps). No fidelity impact (generator ignores semver). **Lesson:** don't infer
  a bug from a version number without accounting for every write that occurred.
  **Minor open question (not urgent):** the hook bumps even on a *no-op* publish (the scripted
  one changed no content yet bumped). If "mark official without editing shouldn't bump" is
  wanted, skip the bump when only `_status` changes — small refinement, the user did not consider
  the current behavior a problem.

Mechanics learned (Rock round-trip):
- **Scripts run via the deps image + bind-mount** (`-v /srv/lesson3/app:/app`), so a
  script-only change is `git pull` + re-run — **NO image rebuild**.
- **Generated DOCX must go to a bind-mounted host dir** (`-v /srv/lesson3/out:/out`, pass `/out`
  as the `generate-bundle.ts` outDir) or they vanish with the `--rm` container's `/tmp`.
- The Mac drives Rock steps over passwordless SSH; the **content diff** (mammoth→HTML→jsdom via
  `scripts/lib/docxDiff.ts`) runs on the Mac, comparing the pulled-back DOCX vs the approved set
  (`compareDoc(label, generated, approved, stripResources)` — strip=true only for the
  LessonSequence). Not yet wired as a one-command regression (see NEXT-SESSION).

## 2026-06-09 — Removed the unused `subjects.slug` scaffold field

`Subject.slug` ("URL-safe identifier, e.g. biology") was `create-payload-app`-style residue —
referenced **nowhere** in logic: ingest matches Subject by `name` (exact), RBAC / SubjectGrade
link by `id`, and there are no subject routes/URLs in scope (SPEC §8 = discipline only). It also
cluttered the Subject create form with an extra (optional, blank-able) field. Same call as the
2026-06-09 Media-collection removal. Removed the field + its `defaultColumns` entry; fixed the
one consumer (`verify-rbac.ts` test fixture). **Migration hand-authored** (no local Postgres to
run `migrate:create`): `20260609_170000_drop_subject_slug` — `DROP INDEX IF EXISTS
subjects_slug_idx` + `DROP COLUMN IF EXISTS slug` (`up` idempotent per the migration-gen
lesson), `down` restores column + unique index. The `.json` snapshot was derived from the prior
one by deleting `public.subjects.columns.slug` + `indexes.subjects_slug_idx` (only the `.ts`
runs at apply time; the snapshot keeps future `migrate:create` diffs clean), registered in
`migrations/index.ts` (sorts last). `generate:types` dropped `Subject.slug`. Gates: tsc 0, lint
0, ingest 18/18, fidelity 3/3, adapter 5/5. **Pending Rock deploy** — rides the next
`docker compose up -d --build` (safe; slug data is disposable/unused).

## 2026-06-09 — Corpus dry-run: `+` concat folding + FE/ST readiness map

Ran the real extractor + gates over all **13** corpus data files (`generators/data/*_data.js`
at SHA `529be40`, materialized read-only via `git show`) before Phase 4, to confirm
ingestability and which SubjectGrades to seed. Two findings:

- **Seed exactly TWO SubjectGrades: `Biology — Grade 10` and `Mathematics — Grade 10`.** All 13
  files are grade 10; subjects are `"Biology"` (10 sub-strands) and `"Mathematics"` (3). Seed
  those exact subject names (ingest matches on `Subject.name` verbatim). NB Math META differs
  in *syntax* (unquoted identifier keys + single-quoted strings, vs Biology's JSON-style
  double quotes) and *labels* (`col3Label`/`col5Label` = "Teacher Actions"/"Assessment
  Strategy") — the acorn extractor handles both syntaxes; `JSON.parse` would NOT (proves acorn
  was the right tool, not a regex/JSON shortcut).
- **`+` string-concat folding added (user-approved, `+` only).** 6/13 files (bio_1_1, bio_1_3,
  bio_2_1, all 3 Math) initially failed extraction with `Unsupported expression
  (BinaryExpression)` — ARES authors build long prose as `'a\n' + 'b\n' + …`. Extended
  `literalToJson` to **constant-fold `+`** (and only `+`) on operands that each evaluate to a
  string/number literal. **Security boundary unchanged:** both operands recurse through
  `literalToJson`, so a non-literal operand (`'a' + ident`, `'a' + call()`) still throws; a
  non-`+` operator (`6 * 7`) still throws. Gate updated: the old `reject: 1 + 2` case became
  `reject: '+' with a non-literal operand` + `reject: non-'+' operator` + a positive fold
  assertion. Now **18/18**, and **13/13 files extract + pass the hard gate**.
- **FE/ST readiness (validates the warn-only decision).** 6/13 files have
  `const FINAL_EXPLANATION = null; // fill in or extract manually` (and the same for
  SUMMARY_TABLE) — bio_1_1, bio_1_3, bio_2_1, math_2_2/2_3/2_4. They are **upstream content
  gaps** (ARES hasn't authored FE/ST for those sub-strands yet), not a code/shape issue — the
  extractor handles `null` and the bundle just warns. So the corpus does NOT uniformly carry
  all three documents; **do not promote FE/ST to a hard gate** (it would reject ~46% of the
  corpus). The 7 complete bundles (bio_1_2, 1_4, 2_2, 2_3, 3_1, 3_2, 3_3) produce all three;
  the 6 produce only the LessonSequence until ARES fills in FE/ST. bio_1_4 (the Phase-4 oracle)
  is complete → ready for the full round-trip.

## 2026-06-09 — Phase 3 external review (Codex + CodeRabbit) triage + fixes

Codex/CodeRabbit reviewed the ingest work. Verified each finding directly; all green after.

- **[PRODUCT DECISION — FE/ST deliverable contract] WARN-ONLY for now.** SPEC §3 says every
  bundle "generates three documents," but the Phase-2 adapter omits empty FINAL_EXPLANATION /
  SUMMARY_TABLE (generator then produces only the LessonSequence), and `validateGeneratable`
  deliberately gates only crash-safety, not deliverable completeness. **User's call:** add the
  FE/ST checks but as a **non-blocking warning at ingest** (logged, not a hard publish block),
  until the full corpus is confirmed to always carry all three — then promote to a hard gate.
  Implemented as `deliverableWarnings()` (FE has ≥1 section, ST has ≥1 lesson row), surfaced
  per-file by the CLI; `validateGeneratable` (the hard gate) is unchanged. SPEC §3 stays the
  target (canonical); this interim stance lives here.
- **[FIXED — `__proto__` at the export layer] Consistency.** `literalToJson` rejected
  `__proto__` data keys, but the `module.exports = { … }` resolution loop did not — no global
  prototype-pollution exploit (it would only re-point the local `result` object's prototype),
  but it broke the stated "reject `__proto__`" contract. Added the same guard there + a gate
  test (`reject: __proto__ key in module.exports`).
- **[FIXED — CI portability] Hard-coded `~/Desktop/ares-docx-fidelity-demo`.** All three
  DB-less gates (`fidelity-spike`, `adapter-fidelity`, `ingest-extract-check`) hard-coded the
  demo path. Added an `ARES_DEMO_PATH` env override (defaults to the existing path, so local
  behaviour is unchanged) across all three, so the suite runs on CI / the Rock / another
  machine without editing.
- **[FIXED — type hygiene] Dropped the needless `as string` cast in `enforceGeneratable`** —
  `?? 'draft'` already yields the `'draft' | 'published'` union (CodeRabbit).
- **[NO ACTION] `npm run test:int` fails locally** — local Postgres isn't running; not this
  code path. The DB round-trip is Phase 4 on the Rock.

## 2026-06-09 — DEPLOYED to the Rock: SG compound index + media drop (migration-gen quirk)

Generated + applied the migration `20260609_164927_subjectgrade_unique_drop_media` on the Rock
(`docker compose up -d --build`; migrate exit 0 in 43ms; app healthy on :3001). Verified live:
`subject_grades` now has `"subject_grade_idx" UNIQUE btree (subject_id, grade)`, and the `media`
table is gone. The Rock now runs `0096f7a` (both branches + origin even at `0096f7a`).

**Hard-won lesson — Payload's migration generator collides `DROP TABLE … CASCADE` with an explicit
`DROP CONSTRAINT`.** The first `up` failed: `constraint "payload_locked_documents_rels_media_fk"
does not exist`. Cause: dropping a collection (`media`) that is referenced by Payload's internal
`payload_locked_documents_rels` FK generates, in order, `DROP TABLE "media" CASCADE` (which already
drops that FK) **and then** an explicit `ALTER TABLE payload_locked_documents_rels DROP CONSTRAINT
payload_locked_documents_rels_media_fk` — which now errors because CASCADE already removed it.
Migrations are transactional, so it rolled back cleanly (no partial state).

**Fix (rule for the next collection removal):** make the generated `up` idempotent by hand before
applying — `DROP TABLE IF EXISTS … CASCADE`, `DROP CONSTRAINT IF EXISTS`, `DROP INDEX IF EXISTS`,
`DROP COLUMN IF EXISTS`, `CREATE … IF NOT EXISTS`. (Equivalently: delete the redundant explicit
`DROP CONSTRAINT` line, since CASCADE handles it.) `IF EXISTS` throughout also makes the migration
safely re-runnable regardless of any partial state. The migration was patched, re-applied, and the
idempotent version committed (`0096f7a`). **Process note:** the migration is authored *on the Rock*
(needs DB access to diff schema), so it flows Rock→git→Mac (pull to sync) — the reverse of normal.

## 2026-06-09 — Preview strategy locked: derive from the generator (DOCX→HTML), never parallel HTML

Discussed how the "Preview as Word/PDF" trust-builder (SPEC §5) should render lesson plans, and
whether a JSON→HTML preview would be "close enough." Locked the approach (also tightened SPEC §5).

- **Principle (non-negotiable): preview is always DERIVED from generator output, never a parallel
  HTML renderer.** A hand-built HTML template re-implementing the layout would be a *second source
  of layout truth* that can drift from the real DOCX and **mislead the teacher** — fatal for a
  trust-builder aimed at a Word-centric stakeholder, and a return of the "HTML is lossy" problem we
  rejected for storage. One layout source: the generator.
- **What Payload provides (verified in installed source):** the *plumbing* only — `admin.livePreview`
  (`LivePreviewConfig`: iframe + breakpoints + form-state `postMessage`) and `admin.preview`
  (`GeneratePreviewURL`: a preview-button URL). Payload does NOT render your data as HTML; you supply
  the view/URL. So "does Payload manage HTML natively" = harness yes, document rendering no.
- **Two fidelity tiers:**
  1. **Fast in-browser content preview** = real DOCX (generated in-process from the working copy) →
     HTML via **`mammoth`**. We already do this in the fidelity harness, so it's nearly free. It is
     the *actual document's* content + table structure; mammoth intentionally drops styling
     (colours/widths/fonts). Adequate *because* teachers edit prose and the generator owns visuals,
     which don't change with prose edits; our grammar (`\n`=para, `- `=bullet) round-trips cleanly.
     (Implication: `mammoth` moves devDep → dependency when this ships.)
  2. **Exact visual check** = the real DOCX download and/or DOCX→PDF. PDF needs a converter
     (headless LibreOffice or similar) — heavier; fold into §9 PDF export. HTML is never the
     "exact look" answer; the DOCX/PDF is.
- **Trigger:** a preview button / custom edit-view component (the §5 component note), NOT continuous
  live-preview — regenerating a DOCX per keystroke is wasteful; the value is "check before publish."
  A debounced "Refresh preview" on the draft is the sweet spot.
- **Gates differ:** preview runs on the **working draft** (that's its purpose, so it bypasses the
  published-only export gate); **export** stays published-only via `generateForBundle`. Preview ≠
  export.
- **Status:** design decision only; built with the §5 editor / §9 export work, not now.

## 2026-06-09 — Removed the unused scaffold `Media` collection

Audited `Media` (Payload-first tidy-up): it was pure `create-payload-app` scaffold residue — an
`upload` collection with only an `alt` field, **zero domain references** (the only mentions were
the config registration, auto-generated `payload-types.ts`, the initial migration's `CREATE TABLE
"media"`, and Payload's internal `payload_locked_documents_rels.media_id`). The editor grammar is
plain strings (SPEC §4) and the generator owns all visuals, so there is no upload need; an empty
"Media" collection in the admin sidebar was misleading dead weight.

Removed: `src/collections/Media.ts`, its `payload.config.ts` import/registration, and the
media-only `images.localPatterns` block in `next.config.ts`. `generate:types` regenerated (Media
gone from `payload-types.ts`); `tsc` 0 errors, `lint` 0 errors, fidelity gates 3/3 + 5/5.
**Pending Rock migration:** a `DROP TABLE media` (+ the locked-docs FK) rides the next deploy —
safe, the table is empty. If image/attachment support is ever needed, re-adding an upload
collection is trivial.

## 2026-06-09 — SubjectGrade modeling locked (junction entity) + native compound-unique index

Deliberate review of "two fields (subject, grade) vs one SubjectGrade entity" (SPEC §8),
confirmed with two requirements the user nailed down:

- **(1) Teachers are ALWAYS assigned at `(subject, grade)` granularity → SubjectGrade stays a
  first-class junction entity.** The decisive test is the *permission grant*: a grant is a tuple
  ("Grade 10 Math"), and a teacher holds several independent tuples. Two *independent* fields
  (`subjects[]`, `grades[]`) can only express their **cross-product**, which over-grants (e.g.
  Math-10 + Biology-12 would also grant Biology-10, Math-12). So the pair must be atomic — an
  entity. This also gives clean Payload access queries (`subjectGrade: { in: [...] }`, mirrored in
  `readVersions`), referential integrity (a curated list of valid combos, no garbage/typos), and
  matches the domain mental model (Subject + Grade = building blocks; SubjectGrade = their curated
  junction). **Caveat recorded:** the entity's justification rests entirely on per-pair
  assignments; if that ever softened to subject-only or grade-only grants, two fields would be
  simpler and this should be revisited.
- **(2) Cross-axis reporting ("all Biology across grades", "all Grade 10") is OCCASIONAL → do NOT
  denormalize.** Mirror `subject`/`grade` columns on bundles would buy direct querying at the cost
  of permanent sync upkeep + more secure-by-default whitelist surface — not worth it for occasional
  use. Pattern instead: the **two-step** (resolve SubjectGrade ids for the subject/grade, then
  `bundles where subjectGrade in (...)`), which always works regardless of adapter query support. A
  one-shot relationship dot-path (`where: { 'subjectGrade.subject': … }`) may also work — verify
  against the DB before relying on it; the two-step is the safe default.
- **`grade` stays a constrained integer**, not its own `Grade` collection (YAGNI). Promote to a
  relationship via migration only if grades gain attributes (alternate names like "Form 4",
  ordering/banding, per-grade metadata).

**Action taken — adopt the native compound-unique index** (supersedes the 2026-06-08 audit note
"DB-level composite unique index still deferred; app-level check acceptable"). Added
`indexes: [{ unique: true, fields: ['subject', 'grade'] }]` to `SubjectGrade` (verified in
installed source `collections/config/types` — Payload natively supports compound unique indexes;
this is the Payload-first replacement for relying on the hook alone). Kept the `beforeValidate`
duplicate check for a friendly error message (a raw unique-violation is opaque) → defense in depth.
`generate:types` parses clean, `tsc` 0 errors, `payload-types.ts` unchanged (no new fields).
**Still needs a migration generated + applied on the Rock** (the index is DDL); existing data is
safe because the app-level check has prevented duplicates all along.

## 2026-06-09 — "Payload-first" working rule (+ leverage audit)

**Rule (adopted; also added to SPEC §13).** Before adding any new custom endpoint, editor,
permission layer, workflow, or persistence code, first check whether Payload already provides it
— via collection config, access control, field/collection hooks, versions/drafts, admin config,
the Jobs Queue, or the Local API. Build custom only when Payload genuinely cannot; when you do,
**document the specific gap** in a code comment and/or here. Keep leaning on Payload's tested
machinery instead of re-implementing it.

**Audit to date (grounded in the code, not memory) — strongly compliant.** Where we leverage
Payload:
- **Data model:** sub-strand bundle as native nested groups/arrays (`LessonBundles.ts`), NOT a
  JSON blob — the choice that unlocks per-field validation, field access, and versioning.
- **Auth:** built-in Payload auth on `Users` (JWT, `forgotPassword`, `tokenExpiration`); no custom auth.
- **RBAC:** collection + field access functions; reads return `Where` queries
  (`lessonBundleRead`) with a mirrored `readVersions` so history can't leak drafts — the idiomatic
  query-filter approach, not post-fetch filtering.
- **Versioning:** Payload `versions` + `drafts` as the history/official-version engine; restore is
  Payload's. Custom layer = only `semver`/`bumpType`/`lockVersion` (Payload has no semver).
- **Structural integrity:** `enforceBundleStructure` is a `beforeChange` hook used *because* field
  access cannot gate array cardinality/order (a documented Payload limitation) — right primitive,
  not reinvention. Same for the other hooks (`autoDemotePriorSubjectAdmins`, `guardPasswordChange`,
  `grantSiteAdminToFirstUser`, subject-rename refresh), all threading `req`.
- **Editor UI:** Phase 1 uses Payload admin edit screens; no custom React editor (SPEC §5 "only if
  needed"). **Email/migrations/persistence:** `@payloadcms/email-nodemailer`, `payload migrate` +
  `db-postgres`, Local API in scripts. **Generation:** script + reusable core via Local API; custom
  endpoint deliberately deferred to §9.

**Opportunities to be MORE native (flagged, all future — honor when these phases land):**
- **Async export (§9):** use Payload's built-in **Jobs Queue**, not a hand-rolled queue.
- **`validateGeneratable` (Phase 3):** implement as Payload field `validate` + a
  `beforeValidate`/`beforeChange` hook so it runs on save/publish/ingest and surfaces in the admin
  UI — not a standalone function only the export path calls.
- **`generateForBundle` `overrideAccess`:** trusted system path now; the §9 endpoint must switch to
  `req`-based access (Payload custom endpoint reusing access + Local API).
- **"Preview as Word/PDF" (SPEC §5):** when built, make it a Payload **admin custom component** (an
  edit-view button via `admin.components`) that calls the generate endpoint — NOT a separate React
  app. Verified caveat: Payload's native `admin.preview`/Live Preview targets HTML *frontend* URLs,
  so it does NOT fit DOCX rendering; only the *button* lives in Payload's component slots.
- **Optimistic concurrency:** currently Payload document-locking + a `lockVersion` counter; true
  reject-if-stale OCC, if needed, is a custom-endpoint concern (documented earlier).

**Verdict:** the only custom code maps to justified, already-documented gaps. The rule formalises
existing practice; its main forward use is steering Phase 3/§9 (validation + async export) toward
Payload's native validate-hooks and Jobs Queue.

## 2026-06-08 — Phase 2 external review (Codex/CodeRabbit) triage + fixes

Codex reviewed the just-committed Phase 2. Five findings, all valid; verified each directly
(don't trust the summary) and fixed. Gates re-run green afterward.

- **[FIXED — broken gates, mine to own] Repo lint + `tsc` were red, since Phase 0/1.**
  Verified: `npm run lint` → **10 errors, all the vendored pristine CJS** (`require()`
  forbidden) — eslint was never told to ignore `src/generator/vendor/`. `tsc --noEmit` → the
  vendored `.js` aren't checked (tsconfig `include` is `**/*.ts`), but `jsdom` was untyped in
  `scripts/`, so **`next build` would have failed too** (uncaught only because Phase 0/1 was
  never built on the Rock). **Calling it "pre-existing" was the wrong call** — a committed gate
  that doesn't pass is a broken gate. Fixes: eslint `ignores: ['src/generator/vendor/**']`
  (pristine code we must never edit + our sibling shim); added `@types/jsdom@28.0.3` (exact,
  matches `jsdom@28.0.0`). Now `lint` 0 errors / `tsc` 0 errors. **Rule:** run the *repo-wide*
  `npm run lint` / `tsc`, not just `eslint <my-files>` — a gate is the whole tree or it's nothing.
- **[FIXED — latent crash] Published ≠ generator-valid; adapter turned null arrays into `''`.**
  The publish gate only enforces *schema-required* fields (`title`, `subjectGrade`,
  `framework[].phase`); the generator unconditionally `.map()`s LESSONS / `lesson.framework` /
  FE.sections / FE.rubric / ST.lessons. Payload normally returns `[]` for empty arrays, but I
  proved `clean(null) → ''` — a null array would have crashed `.map`. (Codex's group examples —
  `slo.purpose` etc. — don't actually crash: Payload groups always materialise and the adapter
  nulls→''.) Fix: `bundleToAresData` now force-coerces those five iterated slots to arrays.
  **Content-completeness validation stays an ingest/publish concern (SPEC §5 "reject anything
  that would produce a broken document"), built in Phase 3** — export trusts validated-in data
  + publish status; the adapter just guarantees it can't *crash*.
- **[FIXED — product call: BLANK column] Resource cells showed "(ARES resources unavailable)".**
  `sections.js`'s try/catch fallback printed that placeholder into real DOCX (the fidelity
  harness strips the column, so gates didn't catch it). Decided (user): render the column
  **blank**, not the placeholder and not removed (removing it would diverge from the approved
  baseline, which keeps the column). Added a **Lesson3-authored** pure-Node shim
  `vendor/aresResources.js` (`getAllPhaseResources → {}`, `buildResourceParagraphs → [para('')]`)
  at the fixed `require('../aresResources')` path. No Python, deterministic. The re-sync script
  copies only the three lib files, so the shim survives a re-pin. Verified: generated
  LessonSequence contains no placeholder; gates still 3/3 and 5/5.
- **[FIXED — doc, future-endpoint] `generateForBundle` uses `overrideAccess: true`.** Correct
  for the trusted CLI/system path, dangerous if a future §9 endpoint reuses it without a read
  check. Hardened the docstring to a firm contract: the endpoint must enforce the caller's READ
  access (or pass `req`) before calling; do not expose this directly as a handler. Restructure
  when the endpoint lands.
- **[FIXED — hygiene] `meta.filePrefix` flowed into a path join unsanitised.** Operator script
  writing to a temp dir, but `filePrefix` is ingested data → trivial path-traversal hygiene.
  Now sanitised to a bare filename component (`[^A-Za-z0-9._-] → _`).
- CodeRabbit's null-check (Payload `findByID` throws by default) and duplicate-fetch notes:
  noise/minor; the script's second `findByID` is a deliberate convenience for the filename. No change.

## 2026-06-08 — Phase 2: generator integration (adapter + validity-gated core)

Built the stored-bundle → ARES generator path on `feat/generator-ingest`. Decisions:

- **Adapter is a thin rename + clean, not a field-by-field mapping.** The ARES *inner*
  keys already match the Payload field names verbatim (verified against `bio_1_4_data.js`),
  so `bundleToAresData` (`app/src/generator/adapter.ts`) only (1) renames the five top-level
  groups (`meta→META` …), (2) deep-strips Payload's row `id`, (3) converts **`null` → `''`**,
  and (4) drops **empty** `framework[].resources` / `FINAL_EXPLANATION` / `SUMMARY_TABLE`.
  **Why null→'':** Payload returns `null` for empty optional strings, but the generator's
  `cell()` wraps a non-string/non-array child as `[content]` → a raw `null` produces invalid
  docx; ARES data files never contain `null`, so the adapter restores that invariant. A
  *populated* `resources` is carried through untouched (the deferred-resources future seam).
  Verified the generator **never reads `framework[].resources`** anyway (`sections.js` pulls
  the Resource column from the absent Python `aresResources` module via its no-op fallback),
  so this is fidelity-neutral.
- **Validity gate lives in the shared core, not the caller (secure by default).**
  `generateForBundle(payload, id)` (`app/src/generator/generateForBundle.ts`) loads the
  bundle (`overrideAccess`, no `draft:true` → the published snapshot), calls `assertExportable`
  (refuses anything whose `_status !== 'published'` with a `NotExportableError`), then runs the
  adapter + `generateBundleDocx`. The gate is enforced by **every** path by construction; the
  CLI uses it now and the future §9 export endpoint just adds READ access on top — it does not
  re-implement the gate. Publishing already enforces required fields, so a published bundle is
  schema-valid. Matches the deferred Codex finding (drafts must never export).
- **Generation exposed as a script for now** (`app/scripts/generate-bundle.ts`, run via
  `payload run`), not an endpoint — full export/sharing UI is SPEC §9, later.
- **Phase-2 GATE is DB-less** (`app/scripts/adapter-fidelity.ts`, 5/5): it *simulates* a stored
  Payload bundle from `bio_1_4_data.js` (camelCase groups + injected row `id`s + sidebar fields
  + `null` UNIT.overview + empty `resources` groups), runs the real adapter + generator, and
  diffs vs the approved DOCX — proving bundle→DOCX by transitivity with the Phase-1 gate. The
  true end-to-end **DB** round-trip + Rock verification stays Phase 4 (per NEXT-SESSION). Shared
  mammoth/jsdom diff helpers were extracted to `app/scripts/lib/docxDiff.ts` (both gates import
  them; Phase-1 gate still 3/3). *Tooling note:* `scripts/*` trip a pre-existing
  `@types/jsdom`-missing `tsc` warning (present since Phase 1); left as-is to avoid an
  out-of-scope dependency add.

## 2026-06-08 — Resources deferred (recommender out of scope); audience-driven priority note

**Decision (firm):** the ARES **Resource column is not populated** for the foreseeable future,
and the **Python recommender is not integrated at all** — not live *and not at ingest*. This
formalises the Phase-0 omission of `aresResources.js`. It is **within SPEC**, not a spec change:
§3/§4/§5/§7 already mark resources **optional and "undetermined… may be omitted entirely,"** and
the recommender path was always conditional ("if the column is enabled"). We are exercising the
already-specified "off" branch.

**What we keep (the future seam):** the optional `framework[].resources` field in
`LessonBundles.ts` stays. Removing it would be the one move that forecloses the future; keeping
it costs nothing (it already tolerates empty).

**Why (three distinct audiences, user-provided):**
- **A — schools with their own ARES server** (~10–60): links resolve to local content; genuinely useful.
- **B — schools using the online ARES demo** (hundreds): links useful if online.
- **C — little/intermittent internet** (thousands — the **largest** group): links are useless.

So links add value only for a minority, while the majority is best served by a self-contained
lesson-plan document (high-fidelity DOCX/PDF, no live links). This **aligns with** the existing
SPEC non-goal "not an offline content-distribution platform (Kolibri/RACHEL serve that need)."

**Future sourcing (no live recommender):** resources do **not** live in the ARES data files —
upstream they exist only in the *rendered* DOCX (computed at build time from `aresKeywords`). So
if links are wanted later, the path is to **extract them from the ARES-produced documents** and
attach to `framework[].resources` — or, if the ARES team later embeds resources in the data
files, ingest simply carries them through. Either way, the same optional field absorbs it.

**Fidelity impact:** none. We already diff "everything-except-resources." The approved DOCX still
contain the column, so we keep excluding it; only a *structural* removal of the column would force
new baselines, and we are not doing that (that's the generator/format owner's call, not a fork).

**Flagged for a later deliberate SPEC pass (NOT changed now):** SPEC line 25 calls offline a
**"secondary goal."** The audience sizing above suggests the *exported documents* standing alone
offline is actually the majority case (distinct from running the *app* on an offline box, which
remains secondary infra). Before editing SPEC, firm up the audience numbers and think through the
downstream nudge toward **print/PDF/offline fidelity over interactive links**. Captured here as an
open question rather than a reactive spec edit.

---

## 2026-06-08 — Generator embedding (Phase 0): vendor pristine, omit Python, mirror the SHA

Starting the bio_1_4 end-to-end fidelity proof (NEXT-SESSION.md). Phase 0 vendors the ARES
Node generator into Lesson3. Decisions (all confirmed with the user at plan time):

- **Vendor pristine, not submodule/npm-dep.** The source lives on an **unmerged `claude/*`
  bot branch** (`markknit/cbe-generation-system@212da91…`), which can be rebased/force-pushed/
  deleted on merge — so any approach that points *live* at that ref (submodule SHA, npm
  git-ref) is fragile, and submodules add friction to the Rock's bind-mount Docker flow.
  **Decision:** copy the three lib files **byte-verbatim** into `app/src/generator/vendor/lib/`
  and never edit them; all integration lives in `app/src/generator/` (ours). Provenance +
  exact SHA in `vendor/PROVENANCE.md` and `docs/EXTERNAL-DEPENDENCIES.md`; one-command re-sync
  via `scripts/vendor-generator.sh`. **Pinned at `529be40`** (branch tip). *Process note:* the
  SHA was first taken as `212da91` from a **stale local fork**; the real tip was four commits
  ahead (`529be40`). Re-pinned after verifying the four intervening commits touched only
  docs/content/output DOCX — the three vendored lib files are **byte-identical** at both
  commits and the fidelity gate still passes. **Lesson:** `git fetch` before resolving a pin;
  don't trust a local clone's `origin`. **Rule:** because a generator change *also* ripples into
  our schema/adapter/approved-DOCX, an upgrade is never a silent SHA bump — the **fidelity
  regression is the acceptance gate** for adopting any new version. Vendoring makes that change
  visible and tested; a submodule's transparent bump would hide it.
- **Buffers need ZERO generator modification.** `build_docs.js` exports the three builders
  (`buildSoW`/`buildFinalExplanation`/`buildSummaryTable`), each returning a `docx` `Document`.
  Our wrapper calls them + `Packer.toBuffer()`. The NEXT-SESSION assumption that we'd "refactor
  `run()` to return Buffers" was unnecessary — `run()` stays untouched (disk-write parity only).
  This is what makes pristine vendoring cheap: no local patches to carry across upstream changes.
- **`aresResources.js` intentionally NOT vendored (deviation from NEXT-SESSION, rule-driven).**
  It `execSync`s `python3` against a SQLite DB for the Section-C Resource column. Single-runtime
  / "never invoke the Python recommender live" (SPEC §0) forbids that. `sections.js` already
  `try`-requires `../aresResources` and falls back to no-ops when absent — so **omitting the
  file** exercises that documented fallback, guaranteeing zero Python and a deterministic
  (empty) Resource column. The fidelity diff excludes the Resource column anyway.
- **CJS-in-ESM boundary.** The vendored files are CommonJS; the app is `"type":"module"`.
  Added `vendor/package.json` = `{"type":"commonjs"}` so Node parses them correctly without
  editing them; Lesson3 imports the builders from ESM via `createRequire`. (Smoke-tested: a
  builder produces a valid PK-zip docx Buffer.)
- **Pinned `docx@9.6.1` exact** (the version the generator was authored against) + **`mammoth@1.12.0`**
  (devDep, for DOCX→text diffing) in `app/package.json`.
- **Mirror tag pushed:** `lesson3-vendor-212da91` on `james-beep-boop/cbe-generation-system`,
  insurance against the upstream bot branch disappearing.
- **Export gate (confirmed, ties to the deferred Codex finding below):** generation is
  restricted to **published/official** (validated) versions; drafts are never exported.

---

## 2026-06-08 — External review (Codex) on versioning: read boundary + secure-by-default

Codex reviewed the deployed versioning work. Four findings; two acted on now (deployed,
`verify-rbac.ts` **36/36**), two recorded for the relevant upcoming phase.

- **[FIXED — security] Teacher read boundary.** `lessonBundleRead` was `Boolean(user)`, so
  with drafts enabled any authenticated Teacher could pull unpublished work via `?draft=true`
  and enumerate history via the versions endpoint. Not exploitable yet (only the Site Admin
  exists) but live the moment Teacher accounts do. **Decision (locked):** Teachers read only
  **published/official** bundles; **Editors/Subject Admins** additionally read any-status
  bundles (incl. drafts) **within their subject-grades**; Site Admins all. Implemented as a
  query-returning `read` plus a mirrored **`readVersions`** (`version._status` /
  `version.subjectGrade` paths — verified working against the live DB) so the version-history
  endpoint can't leak drafts. `verify-rbac.ts` covers teacher-sees-published,
  teacher-blocked-from-draft (list + by-id + versions), editor-sees-own-SG-draft.
- **[FIXED — secure-by-default] Top-level whitelist gap.** The hook's claim that "a new
  admin/system field is protected automatically" held for *array subfields* (overlayRows
  rebuilds each row from the original) but **not for top-level fields** — the Editor branch
  only restored enumerated keys (`title`/`subjectGrade`/`meta`/`unit`/`_status`), so a future
  top-level field added without access/hook handling would pass through an Editor update.
  **Fix:** invert to a true allow-list — restore EVERY top-level key from the original except
  the content containers (`lessons`/`finalExplanation`/`summaryTable`), the hook-set version
  fields (`semver`/`bumpType`/`lockVersion`), and Payload's `updatedAt`. New top-level fields
  are now protected by default. **Rule:** "secure by default" means *restore-all-except-known*,
  never *restore-known*; the latter silently rots as the schema grows.
- **[DEFERRED — export phase, SPEC §6/§9] Draft validity vs bulletproof export.** Enabling
  drafts relaxed DB `NOT NULL` and `draft:true` skips required validation, so an invalid draft
  snapshot can exist. SPEC says "any version regenerates on demand" — so **generation/export
  must validate the exact snapshot first, and/or only official/validated versions are
  exportable.** Honor this when the generator integration lands; not a bug today.
- **[DEFERRED — low] CodeRabbit migration notes.** `numeric` for integer-ish columns is the
  db-postgres default for `number` fields (style, not a bug); the down-migration `SET NOT NULL`
  only fails if you roll back after creating null-bearing drafts. Both downgraded; no action.

## 2026-06-08 — Versioning DEPLOYED + hard-won Payload/Docker lessons

Bundle versioning is merged and **deployed on the Rock** (migration
`20260608_224715_bundle_versioning` applied; `verify-rbac.ts` **30/30** against the live DB).
Getting there surfaced several non-obvious traps — recorded so the next schema change and the
public-production host don't re-hit them:

- **Regenerate `payload-types.ts` BEFORE building, after any schema change.** `next build`
  type-checks the whole tree; the generated `LessonBundle` type won't know new fields
  (`semver`/`bumpType`/`lockVersion`/`_status`) until regenerated, so the build fails on
  `verify-rbac.ts` (and would fail on the hook/collection too). It can't be regenerated
  locally here (no `node_modules`), so it's done on the Rock via the **deps image with the
  source bind-mounted** (anon volume preserves the image's node_modules):
  `docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app lesson3-deps npx payload generate:types`.
- **`migrate:create` needs a bind mount AND the compose network.** `docker compose run --rm
  migrate npx payload migrate:create` writes the migration file *inside* the ephemeral
  container (the builder stage `COPY . .`'d the source; there's no volume) — `--rm` then
  deletes it. Run it via the deps image with `-v /srv/lesson3/app:/app` (so the file lands on
  the host) **and** `--network lesson3_default --env-file .env` (migrate:create connects to
  Postgres to diff the schema). The exact workflow is in `docs/NEXT-SESSION.md`.
- **Publishing is `_status: 'published'` in *data*, not the `draft` op param.** Verified in
  installed source (`collections/operations/create.js`/`update*.js`): `draft: true` only forces
  draft status + skips required-field validation; the persisted `_status` otherwise comes from
  `data._status` (default `'draft'`). So **marking official = passing `_status: 'published'`**;
  `draft: false` alone does nothing. Publishing also **enforces required fields**, so a publish
  update must carry a valid doc (e.g. `framework[].phase`). The whitelist hook *preserves*
  `_status` for Editors, which both blocks an Editor from publishing a draft AND stops an
  Editor's edit from accidentally unpublishing an official bundle — both now covered by
  `verify-rbac.ts`.
- **`lockDocuments: true` is not a valid literal** (the option type is `false | { duration }`);
  document locking is **on by default** in Payload 3, so we leave it unset. An explicit `true`
  breaks the build type-check.
- **Test hygiene:** the versioning checks initially reused the suite's already-mutated bundle
  (semver long past its initial value) — they now create a **fresh** bundle. General rule:
  exact-value assertions need a fixture untouched by earlier steps.
- **`enforceBundleStructure` now treats `!req.user` as trusted** (system / `overrideAccess`),
  bypassing the Editor whitelist — so ingest/migrations can set all fields and publish.
  Unauthenticated updates are already denied at collection access, so this only frees genuine
  system calls. Matches the `guardPasswordChange` `!actor` convention.

## 2026-06-08 — Bundle versioning: implementation decisions (SPEC §6)

Implemented `versions: { drafts: true, maxPerDoc: 100 }` on `lesson-bundles` plus three
sidebar fields (`semver`, `bumpType`, `lockVersion`) and versioning logic in
`enforceBundleStructure`. Key decisions:

- **Payload drafts as the "official version" mechanism.** Payload's single published
  document per collection naturally enforces "≤1 official version per bundle" (SPEC §6).
  Publishing (`_status: 'published'`) = marking official. The whitelist hook preserves
  `_status` for Editors (`d._status = orig._status ?? 'draft'`), so only Subject Admins
  can publish.
- **bumpType is Editor-accessible.** SPEC §6 says "user may choose patch/minor/major" without
  restricting who. The `bumpType` field passes through the whitelist for all users; Editors
  can signal a minor/major bump when their change warrants it. The hook consumes and resets
  it to `'patch'` after every save.
- **Versioning logic runs before the admin early-return.** The semver bump and lockVersion
  increment are in the outer scope of `enforceBundleStructure` (before `if (isSubjectAdminFor)
  return data`), so all users get version stamps on every save. Subject Admins also get the
  whitelist bypassed (correct).
- **Restore interaction.** Version restore in Payload calls `update` with the old version's
  data, which goes through `enforceBundleStructure`. For Editors: the whitelist applies —
  only prose fields from the restored version are written; admin fields are preserved from
  the current document. For Subject Admins: the full restored data is written. The semver
  always bumps on restore (treated as a write), which is correct.
- **Optimistic concurrency: `lockVersion` counter + Payload's `lockDocuments`.** True
  server-side OCC (reject-if-stale) can't safely distinguish a restore (submitted old
  `lockVersion`) from a concurrent edit without Payload exposing a restore context flag.
  Implemented: `lockVersion` increments on every save (clients can use it to detect races);
  Payload 3 **document locking is on by default** (guards concurrent admin-UI edits) — note
  there is no `lockDocuments: true` literal (the option type is `false | { duration }`), so we
  leave it at the default rather than setting it explicitly. Server-side reject-if-stale can
  be added when building custom API endpoints — at that point callers can pass
  `_expectedLockVersion` and the hook can enforce it.

---

## 2026-06-08 — Admin login loop on Safari: serverURL forces strict CSRF

After a Rock reboot, browser login looped (enter password → flicker → back to login),
specifically on **Safari**. Diagnosed against the running stack (not guessed): app healthy,
account not locked, password valid, and **header auth (`Authorization: JWT`) worked while
cookie auth failed** — login POST set the cookie but the follow-up GET wasn't authenticated.

Root cause in installed source (`auth/extractJWT.js` + `config/sanitize.js`): setting
**`serverURL`** makes sanitize **push it onto `config.csrf`** (`if (serverURL !== '')`), and a
non-empty `csrf` makes Payload honor a cookie token on a request with **no `Origin`** only if
it carries `Sec-Fetch-Site: same-origin|same-site|none`. Browsers omit `Origin` on same-origin
GETs; **older Safari also omits `Sec-Fetch-Site`** → the admin's auth-check GET is rejected →
bounce to login. (Reproduced exactly: cookie + correct `Origin` ✓; cookie + no `Origin`/no
`Sec-Fetch-Site` ✗; cookie + `Sec-Fetch-Site: same-origin` ✓.)

**Fix:** default `serverURL` to `''` (empty → NOT pushed to csrf → cookie auth honored for all
browsers; CSRF still covered by the `SameSite=Lax` cookie, which blocks cross-site
POST/subrequests). The password-reset email base moved to a separate **`ADMIN_URL`** env via a
custom `forgotPassword.generateEmailHTML` (serverURL is no longer available for it). Env-driven:
a public **HTTPS** host may set `SERVER_URL` to opt into strict CSRF (modern browsers over HTTPS
send `Sec-Fetch-Site`, so they're fine). **Rule:** don't set `serverURL` on a plain-HTTP/internal
host that older browsers hit — it silently breaks their cookie login; use `ADMIN_URL` for email
links instead. Gotcha: `serverURL` must be the empty string, not `undefined` (undefined is still
pushed to csrf).

**Session policy (same session):** set `auth.tokenExpiration: 900` (15-min inactivity window).
With `admin.autoRefresh` off (Payload default), the admin shows a "Stay logged in?" prompt ~1 min
before expiry and **force-logs-out an unattended session at expiry even with the tab open** —
addressing the shared-device "someone sits down later" concern (cookie persistence alone wouldn't).
Avoided very short windows (e.g. 1 min): the prompt fires at `expiry − min(60s, lifetime/2)`, so a
1-min window nags every ~30s and logs you out on any brief pause, risking lost unsaved edits.
"Log Out" is always immediate. Note Payload has **no native session-cookie / "clear on tab/browser
close"** option (cookie carries `Expires` = tokenExpiration, and tabs aren't cookie-scoped), so the
inactivity window is the supported lever. Tune `tokenExpiration` (`app/src/collections/Users.ts`) if
15 min proves tight for real editing.

## 2026-06-08 — Bundle field protection: blacklist → whitelist (secure by default)

Follow-up to the audit below. The first fix made `enforceBundleStructure` restore an
*enumerated* list of admin-only fields from the original (a **blacklist**). That is
insecure-by-default: a new admin-only field added inside an editable array that someone
forgets to add to the hook would be silently Editor-editable. **Inverted to a WHITELIST**
(commit `2059156`, deployed, `verify-rbac.ts` **19/19** against the deployed image): for a
non-admin Editor the hook writes the *original* document with only the Editor-editable
**prose** fields overlaid from the submission. Everything else is preserved.

- **Why this is the right default:** forgetting to whitelist a field can only make it
  non-editable by Editors (a visible annoyance, caught in use) — never silently editable
  (a security hole). New admin/system fields are protected automatically.
- **Standing rules for anyone adding bundle fields (see the LessonBundles docstring):**
  1. A new field is **admin-only by default**. To make it Editor-editable, add it to the
     matching prose-whitelist constant in `hooks/bundleIntegrity.ts` (and use `prose()`).
     The cross-container regression test in `verify-rbac.ts` guards the contract.
  2. Field-level `access` is **not** the authority for the Editor/admin split — the hook is.
     (`prose()`/`proseAdmin()`/`structureText()` carry only grammar hints + UI/create access.)
  3. **Array edits must submit the full array** (same rows/order): the hook rejects
     cardinality/order changes by Editors. Fine for the Payload admin UI; required to know
     before building custom API/editor flows.
- **UNIT.overview** is admin-only (SPEC §5 does not list UNIT) — modeled with `proseAdmin`
  and preserved wholesale by the hook; it is intentionally not in the prose whitelist.
- Field-level access is still kept on groups (META/UNIT), `phase`, the `rubric` array, and
  top-level `title`/`subjectGrade` as harmless defense-in-depth, but the hook is the
  single source of truth.

## 2026-06-08 — External audit (Codex + CodeRabbit) triage + fixes

Second external pass on the auth/bundle work (already merged to `main`). Six findings; all
valid. Triage (live now / next-task / future) and resolution below.

**Status:** landed over two commits on `main`, both deployed to the Rock (rebuilt via
`docker compose up -d --build`, migrate exit 0, app running) and verified against the
deployed image (not bind-mounted): `eba6157` (the fixes below) verified 17/17, then
`2059156` (the whitelist inversion + cross-container test, see the dedicated entry above)
verified **19/19**. The current design point is the whitelist hook.

- **[live-when-roles-exist, FIXED] Subject Admins could reset any user's password.**
  Verified in installed source (`collections/operations/utilities/update.js`): Payload saves
  `data.password` with NO password-specific access check — only collection `update` gates it,
  and Subject Admins have collection update on all users (needed for assignment mgmt). Added
  `guardPasswordChange` (beforeChange): only self or Site Admin may change a password; `!actor`
  is treated as a trusted system/override call (unauthenticated REST is already denied at
  collection access, and the token reset writes hash/salt directly, never via this path).
  Not exploitable today (only the Site Admin exists) but mandatory before assigning Subject Admins.
- **[authz-correctness, FIXED] Editors could edit `sections[].exemplar` (an answer key).**
  SPEC §5 makes exemplar Subject-Admin-only. Fixing this surfaced a **deeper Payload
  limitation (the important lesson):** field-level access reliably retains denied values for
  **groups** and **required** array subfields, but **NULLS optional admin-only subfields inside
  open arrays** when a non-admin submits the array — and nulls them at *write* time even when
  the parent is merely *omitted* from the update (hook injection of an omitted field does NOT
  persist; only modifications to *submitted* fields do). Net effect: with field access, an
  Editor's ordinary save would **wipe** `exemplar`, `sections[].title`, and (pre-existing, missed
  by everyone) `lessons[].duration/substrand/aresKeywords`. **Resolution:** remove field-level
  access from those optional admin array subfields and make `enforceBundleStructure` the single
  enforcement point — it overwrites admin-only values from the original for non-admins (omitted
  parents are then retained intact by Payload's merge; submitted changes are corrected by the
  hook). **Rule:** do not rely on Payload field-level `access` to protect optional admin-only
  subfields inside shared/open arrays; enforce those in a hook. *(This hook was then inverted
  from this blacklist to a secure-by-default whitelist — see the entry above.)*
- **[future, DOCUMENTED—not changed] FK `ON DELETE SET NULL` on NOT NULL columns**
  (`subject_grades.subject_id`, `users_assignments.subject_grade_id`, `lesson_bundles.subject_grade_id`).
  Verified Payload 3.85 / db-postgres exposes **no `onDelete` config** — it hardcodes SET NULL
  for relationships. Practically, SET NULL on a NOT NULL column *prevents* deleting a referenced
  parent (the delete errors), so there's no orphaning/data-corruption risk today — only a less
  friendly error and a schema smell. Hand-forcing RESTRICT in a corrective migration would
  diverge from Payload's generated schema snapshot and fight `migrate:create`. **Decision:** keep
  Payload's default; when taxonomy *delete workflows* are built, add app-level `beforeDelete`
  guards on Subject/SubjectGrade that block deletion when dependents exist (clear message),
  rather than fighting the FK DDL. No delete workflows exist now; deferred deliberately.
- **[live dev harness, FIXED]** `playwright.config.ts` `webServer.command` was `pnpm dev` →
  `npm run dev` (`npm run test:e2e -- --list` now works; 4 tests listed).
- **[future-correctness, FIXED]** `SubjectGrade` uniqueness `beforeValidate` lookup omitted
  `req` → added (transaction-consistent, per the rule below). DB-level composite unique index
  still deferred (app-level check acceptable at this scale; documented).
- **[next-task, DONE] Coverage.** `verify-rbac.ts` extended to 17 checks incl. password-guard
  (subject-admin-blocked / self-allowed / assignment-mgmt-still-works) and exemplar
  (editor-blocked / admin-allowed / prompt-still-editable) and admin-array-subfield anti-wipe.

## 2026-06-08 — Code-review (high) follow-ups + a Payload transaction lesson

A correctness-focused review pass (complementing the security review) on the auth branch.
No High bugs; the access hooks held up. Actioned:

- **M1 (fixed) — denormalized title went stale.** `SubjectGrade.displayName` ("<Subject> —
  Grade N") is stored at write time; renaming the parent `Subject` left it stale. Added a
  `Subject` afterChange hook that refreshes dependent SubjectGrade titles on rename.
- **L3 (fixed) — duplicated access helpers consolidated.** Exported a shared `Assignment` type
  and a single `subjectGradeIdsByRole` from `access/index.ts`; removed the near-duplicate copies
  in `access/bundle.ts` and `hooks/userRoles.ts`. Behavior-preserving.
- **Transaction-consistency bug surfaced while fixing M1 (the real lesson).** The rename hook
  *looked* correct but the title still didn't update. Root cause, found by instrumenting:
  (1) Payload **merges existing field values into `data`** on update, so a `beforeChange` that
  guards on `data.grade == null` still runs its recompute even when you only passed one field;
  and (2) `SubjectGrade.beforeChange`'s subject lookup **omitted `req`**, so it read *outside the
  current transaction* and recomputed the title from the pre-rename name, clobbering the refresh.
  **Rule:** always thread `req` into nested `payload.find/findByID/update` inside hooks — not just
  for writes (atomicity) but for **reads**, or they see pre-transaction state. Don't assume a
  partial update means other fields are absent in `beforeChange`.
- **Verification:** `verify-rbac.ts` extended with a rename check; full gate green on the Rock
  (9/9), test data self-cleaned. Tooling note: `/code-review` resolved to the CodeRabbit plugin
  (name collision); the high-effort correctness pass was done inline instead.

## 2026-06-08 — Product model: authorization entities + sub-strand bundle

Modeled the authorization entities and the sub-strand bundle as **native Payload nested fields**
(SPEC §3, §5, §8), plus the Codex scaffold-hygiene fixes. Collections: `subjects`,
`subject-grades`, role-bearing `users`, and `lesson-bundles`. Verified locally as far as a
DB-less host allows — `generate:types`, config sanitization, `tsc --noEmit`, and `eslint` all
clean; the migration + true end-to-end run happen on the Rock. Decisions and the non-obvious
traps:

- **Content model grounded in real data, not memory.** Shapes were read from the
  fidelity-proven `~/Desktop/ares-docx-fidelity-demo/bio_1_4_data.js` (matches SPEC §3 exactly):
  `rubric[]` = `{criterion, excellent, proficient, developing}`; `sections[]` =
  `{title, prompt, exemplar}`; `framework[].resources` is **absent** in real data → modeled
  optional. `UNIT` is `{}` there → modeled minimally as a single optional `overview` pending a
  populated example.
- **Conflict resolved — admin-panel access.** NEXT-SESSION said "panel = Site Admins only";
  **SPEC §5 (canonical) has Editors/Subject Admins editing via the admin edit screen in Phase 1.**
  SPEC wins: `access.admin` (`adminPanelAccess`) allows **siteAdmin OR subjectAdmin OR editor**,
  excludes plain Teachers. General rule: when NEXT-SESSION (staged plan) and SPEC (canonical)
  disagree, SPEC governs; surface the conflict rather than silently following either.
- **Conflict flagged — phase vocabulary.** The local `cbe-generation-system` checkout is the
  older **Python** generator, so the authoritative Node `docx_kit.js` phase→colour map isn't
  available. The `framework[].phase` dropdown uses the **five phase strings from `bio_1_4`**
  (`Predict Phase`, `Observe Phase`, `Explain Phase`, `Driving Question Board (DQB) Creation`,
  `Model Building Phase`). **TODO: reconcile against the Node generator's colour-map keys when
  the generator integration / ingest lands** — an unknown phase silently degrades output (SPEC §4).
- **Field access gates *values*; a hook gates *structure*.** Payload field-level `update: false`
  silently keeps a field's existing value, but field access **cannot** stop add/remove/reorder of
  array rows. So SPEC §5 is enforced in two layers: per-field access (prose = Editor+, META /
  phase / duration / answer keys = Subject Admin+, resource column + lesson `number` = system-only),
  **plus** `enforceBundleStructure` (beforeChange) which rejects cardinality/order changes by
  non-admins and re-derives lesson numbers from order. Highest-risk surface → security-review.
- **≤1 Subject Admin per subject-grade.** `autoDemotePriorSubjectAdmins` (afterChange) demotes any
  prior holder to Editor in the **same transaction** (`req` threaded) guarded by a `context` flag.
  Scoped role management for Subject Admins is enforced by `enforceAssignmentScope` (beforeChange):
  a non-site-admin may only touch assignment rows for subject-grades they administer.
- **`req.user` carries full role data.** Confirmed in installed source: the JWT strategy
  re-fetches the user via `findByID` (`auth/strategies/jwt.js`), so `roles` and `assignments` are
  always present in access functions; relationships come back as raw IDs at the default auth depth
  (helpers normalize ID-or-object via `toId`).
- **Two Payload-3 gotchas (trust installed source).** (1) A **virtual** field can be `useAsTitle`
  *only* if it maps to a relationship field — so `SubjectGrade.displayName` ("<Subject> — Grade N")
  is a **stored** field maintained by a beforeChange hook, not virtual. (2) `payload generate:types`
  runs **without a DB** (pure config parse) and is a fast local correctness gate; `next build` and
  migrations do need the DB → run on the Rock.
- **Field naming.** Top-level groups are camelCase (`meta`, `unit`, `lessons`, `finalExplanation`,
  `summaryTable`) to avoid uppercase-column oddities; the generator adapter will map them back to
  `META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE`. Inner keys already match the ARES data verbatim.
- **ESLint fix.** `eslint-config-next` 16 ships native flat-config arrays; wrapping them via
  `FlatCompat.extends('next/...')` double-wraps the flat plugin config and crashes the legacy
  validator ("circular structure"). Fix: import `eslint-config-next/core-web-vitals` and
  `/typescript` and spread them directly (no FlatCompat).
- **Security-review finding (fixed) — don't backfill `name` from `email`.** The first migration
  backfilled the new, publicly-readable `users.name` from the private `email`. Because `name` is
  *intentionally* public (attribution — SPEC §8) while `email` is gated by `emailReadAccess`,
  copying email into name leaked it to any authenticated user for pre-existing rows. Fix: backfill
  with a neutral `'User ' || id` placeholder, not email. **Rule:** when adding a public field to a
  table with rows, never backfill it from a private column — fix the *data*, not the field's
  visibility (locking down `name`'s read would break required attribution). The migration had
  already applied on the Rock, so the data was corrected in place (admin `name` set to "Site
  Administrator") and the committed migration amended for the not-yet-deployed production host;
  amending an applied migration is acceptable here because only the pre-existing-row backfill
  changed — the schema snapshot is untouched and the Rock won't replay it.
- **Admin-panel lockout + bootstrap (fixed).** Gating `access.admin` on siteAdmin/assignment
  (correct per SPEC §5) locked out the *existing* Rock admin, whose `roles` was `[]` — login API
  returned 200 but `/admin` refused entry. Fixed in place (granted siteAdmin). The deeper bug:
  on a *fresh* deploy Payload's first-user creation also yields `roles: []`, so the new admin
  would be locked out too — a bootstrap deadlock. Fix: `grantSiteAdminToFirstUser` (beforeChange)
  forces `roles: ['siteAdmin']` when creating the first user (user count 0). **Rule:** any time
  panel/admin access is gated on a role, ensure the *first* user is granted that role
  automatically, or the system is un-bootstrappable. Lesson on testing: `verify-rbac.ts` passed
  because it created users *with* roles; it didn't cover the role-less pre-existing/first user —
  exercise the bootstrap path, not just the happy path.
- **Email adapter (operations).** Password resets silently no-op'd ("Email attempted without
  being configured") because no email adapter was set. Added a conditional `nodemailerAdapter`
  (enabled when `SMTP_HOST` is set; console fallback otherwise; `skipVerify` so boot isn't
  coupled to SMTP reachability). Gmail SMTP needs a 16-char **App Password** (2FA required), not
  the account password. SPEC §11 wants real email/observability before real users.

## 2026-06-08 — External review (Codex) triaged into the build plan

Codex audited the scaffold against the root docs. Its code reads were accurate and it ran the
real `lint`/`test`/`build` commands (caught genuine tooling breakage). Its weakness was
**urgency calibration**: it reviewed code-vs-root-docs without weighting the staged plan
(this file + `NEXT-SESSION.md`), so "no product model yet" was reported as a defect when it's
the intended scaffold state. Outcome:

- **Actionable items folded into `NEXT-SESSION.md`:** a "scaffold-hygiene" pre-flight
  (npm/pnpm drift in the `test` script; int-test DB host; ESLint flat-config; finish dep
  pinning; Media default-private), plus the security items attached to the auth task
  (`access.admin`; `username` + field-level `email` read). None is a live exploit today
  (only the admin user exists) — they're requirements for the imminent roles work.
- **Prompting lesson for cross-model review:** give the reviewer the plan/stage
  (`SPEC.md` + `DECISIONS.md` + `NEXT-SESSION.md`); ask it to classify findings as
  (a) live risk now / (b) requirement of the next planned task / (c) future, and to check
  exploitability before assigning P1; have it separate scaffold defaults from designed
  choices. Keep leaning on it for running the deterministic commands and (later) security
  review of the access functions.
- Reviews stay **advisory**; the deterministic gate (golden-file diff, type-check, CI) is the
  arbiter — consistent with the 2026-06-07 multi-agent decision.

## 2026-06-08 — Scaffold deployed on Rock 5B; build & DB-init gotchas resolved

Got the Payload + Postgres stack building and running in Docker on the Rock 5B
(`/srv/lesson3`, named volume `lesson3_pgdata`), co-tenant with nanoclaw, `/admin`
serving, first admin user created. Several non-obvious traps, recorded so the
public-production host (identical stack) doesn't re-hit them:

- **`npm ci` failed: "Missing yjs/monaco/@testing-library/... from lock file."**
  Root cause was **not** Node/npm version (that was a red herring that cost time — a
  pinned-npm "fix" was tried and reverted). The scaffold's **`app/.npmrc` sets
  `legacy-peer-deps=true`** (Payload 3 / React 19 / Next 16 peer conflicts), but the
  generated Dockerfile's `COPY` line **didn't include `.npmrc`** — so `npm ci` ran in
  strict-peer mode in the image and rejected the legacy-peer-authored lock. **Fix:**
  add `.npmrc` to the deps-stage `COPY`. Lesson: `.npmrc` must travel into the build;
  when install passes locally but `npm ci` fails only in Docker, suspect a missing
  `.npmrc`/config, not versions.
- **Build then failed at `COPY /app/public`:** the blank Payload template ships no
  `public/` dir but the generated Dockerfile assumes one. **Fix:** committed
  `app/public/.gitkeep`.
- **App ran but `/admin` 500'd: `relation "users" does not exist`.** Production builds
  do **not** auto-push the schema (push is dev-only); production needs **migrations**.
  Verified against installed Payload source: prod default `push:false`, CLI is
  `payload migrate*`, default `migrationDir = src/migrations`.
- **Migrations can't run from the prod image** (minimal Next standalone, no Payload CLI).
  Generated + applied the initial migration from a one-off container built off the
  Dockerfile **`builder`** stage, on the compose network. Initial migration committed
  (`app/src/migrations/*`).
- **Wired migrate-on-deploy:** added a one-shot **`migrate`** service to
  `docker-compose.yml` (builds `target: builder`, runs `npx payload migrate`), gated on
  a new Postgres **healthcheck**; `app` now `depends_on` it via
  `service_completed_successfully`. So `docker compose up -d --build` applies pending
  migrations before the app starts. Idempotent.
- **Open follow-up — schema-change workflow:** generating a *new* migration still needs
  the `builder`/tools image (or local dev) to run `payload migrate:create`; only the
  *apply* step is automated. Document the create step when we first change collections.
- **Latent risk:** dev Mac runs **Node 25**, the build image runs **Node 22** (LTS).
  Regenerate lockfiles in the Node-22 toolchain (or align local dev to Node 22) to avoid
  tree-resolution drift. Not yet fixed.

## 2026-06-07 — Multi-agent review: deferred, with a concrete trigger

Considered bringing in a second agent (OpenAI Codex, and/or **Hermes** — the Nous Research
always-on agent daemon on the MacBook Air, GPT-5.x-capable) to review/test alongside Claude
Code. **Decision: defer. Claude codes; the human is the arbiter; deterministic checks are the
gate.** Rationale and the rules we settled on:

- **Independent cross-model review is valuable** (uncorrelated blind spots), but the *verdict*
  stays deterministic — golden-file DOCX diff, type-check, eventual test suite + CI — never a
  model's opinion. Reviews are advisory input, not a merge gate; never auto-apply a reviewer's edits.
- **One writer, one reviewer, integrate at the PR.** Never two agents editing the same tree.
  Shared constitution: `SPEC.md` is canonical; `CLAUDE.md` (Claude) and `AGENTS.md` (Codex)
  both defer to it — keep the pointers in sync.
- **Do NOT use Hermes as a per-change reviewer** — it has no native git/PR pipeline, so that
  path is glue-building = complexity for no gain (Codex/CodeRabbit/`security-review` cover
  per-change review with full repo context already).
- **Hermes's real niche is out-of-loop, always-on scheduled jobs** (daemon + cron + cross-session
  memory + messaging): nightly fidelity-regression diff with notification, scheduled async GPT-5.x
  review of the day's diff, dependency/backup watches. Nothing else in the stack does this well.
- **Trigger to revisit:** once there is feature code, a test suite, and **CI** (the deterministic
  gate) — *then* Hermes is justified as the async layer that schedules regressions/reviews and
  pings on failure. Not before. CI (GitHub Actions) is the prerequisite and the next infra piece.
- **Cautions for that day:** (1) Hermes's *self-improving skills* cut against a verification
  role's need for consistency — pin/review skill changes, don't let them auto-evolve. (2) Hermes
  overlaps nanoclaw; if adopted it should *replace* a role, not add a fifth standing agent layer.

## 2026-06-07 — Tooling: Payload skill installed; connectors trimmed

- **Payload skill installed** at `.claude/skills/payload/` (`SKILL.md` + `reference/`),
  pulled from `payloadcms/payload@3.x` `tools/claude-plugin/skills/payload/`. This is the
  structural fix for the CLAUDE.md "Knowledge currency" worry (stale Payload 3 APIs) — prefer
  it over memory when working on collections, fields, hooks, access control, versioning.
  Re-pull the same path if it needs refreshing.
- **`laravel-boost` MCP server removed** from `~/Library/Application Support/Claude/claude_desktop_config.json`
  — it pointed at Lesson2's PHP `artisan` (irrelevant to this single-runtime Node project) and
  was failing to connect. Restorable from the Lesson2 repo if ever needed there.
- **Account-level connectors** (trivago, B12, website generators, mcp-registry, etc.) are **not**
  in local config — they're synced from the Claude account and toggled in the app's
  **Settings → Connectors**, not by editing files. Keep computer-use, Claude-in-Chrome/Preview,
  and pdf-viewer (planned uses: DOCX visual-fidelity checks, admin-UI verification, PDF export).
- **Permission allowlist:** committed `.claude/settings.json` holds only read-only MCP entries;
  most frequent Bash commands are already auto-allowed by Claude Code, and the rest are mutating
  or arbitrary-execution and were deliberately left out.

## 2026-06-07 — Scaffold layout, env var, and `output: 'standalone'`

- **Payload scaffolded into `./app`**, not the repo root, to preserve the committed root
  docs and co-tenancy `docker-compose.yml`. `docker-compose.yml` `build:` points at `./app`.
- **Standardized on `DATABASE_URI`.** `create-payload-app`'s blank template (v3.85.0) reads
  `process.env.DATABASE_URL`; changed `app/src/payload.config.ts` to `DATABASE_URI` to match
  the project convention and the committed `.env.example`.
- **Added `output: 'standalone'`** to `app/next.config.ts` — the generated Dockerfile copies
  `.next/standalone` and fails without it.
- **`create-payload-app` is fully scriptable** despite the abbreviated `--help`: the hidden
  flags `--db`, `--db-connection-string`, `--secret`, `--no-git`, `--no-agent` make it
  non-interactive. (The prior session's interactive/PTY blocker was avoidable.)

## 2026-06-07 — bio_1_4 fidelity proof passed

Regenerating the three DOCX from stored data reproduced the stakeholder-approved set
exactly, except the per-phase Resource column (which needs the absent Python recommender).
Validates the core architecture: edit the data, regenerate byte-stable documents.
See assistant memory `fidelity-proof-passed` for the diff detail.
