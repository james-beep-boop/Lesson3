# Start here — plan the next phase

You are picking up the **ARES Lesson Library (Lesson3)**: a versioned lesson-plan repository that
uploads/imports ARES CBE lesson plans as structured lesson data, lets teachers/editors view + edit
them under field-level RBAC, tracks one **Official** version pointer per lesson plan, and exports
high-fidelity DOCX/PDF by reusing ARES's own generator. Node/TypeScript + Payload CMS (Postgres)
end to end.

**Read first, in order:** `CLAUDE.md` (working rules — auto-loaded each session anyway) → `SPEC.md`
(canonical architecture/domain) → `AGENTS.md` (stack, layout, commands) → `docs/DECISIONS.md`
(build-time decisions + reasoning; newest on top). **`DECISIONS.md` is large (~1600 lines) — skim
the most recent entries and grep it for the area you're touching; don't read it end to end.** This
file is the launch prompt; the build history lives in `docs/CHANGELOG.md` (consult only for provenance).

**The chosen track is PRODUCTION HARDENING, and it is IN PROGRESS (2026-06-27).** The Official-version
cutover is long done; the current work is the hardening backlog below. **Bucket A + items ⓪ + ① are now
PUSHED + Rock-verified (origin/main `847fdd7`). See "▶ RESUME HERE" next — the next work is item ②
(dependency advisories).**

---

## ▶ RESUME HERE (2026-06-28) — Bucket A + ⓪ + ① DONE; next is ② dependency advisories

**State: clean. Everything below is pushed to `origin/main` (HEAD `847fdd7`) and DEPLOYED + verified on
the Rock.** Worked from the **home Mac mini M4** (not the laptop): GitHub push works from Bash here
(osxkeychain token cached); Rock SSH works after `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` (same
key authorised on both machines).

**✓ Latest (2026-06-28, this session): item ① — endpoint/authz e2e (`test:http`) — DONE, Rock-verified.**
Commits `059b18d` (suite) + `847fdd7` (fixes). New `tests/http/endpoints.http.spec.ts` +
`vitest.http.config.mts` + `test:http` drive the RUNNING app over HTTP (graphql-404, preview auth/read/
edit gates + CSP, export DOCX+PDF end-to-end read-gated, Bucket-A invariants over the wire); stale
`tests/e2e/frontend.e2e.spec.ts` removed. **`test:http` 13/13** on the Rock. Distinct run procedure from
`test:int` (hits live `lesson3` + `E2E_BASE_URL=http://app:3000`; see DECISIONS 2026-06-28 top entry).
The e2e surfaced a **real Low finding: the next.config `/:path*` CSP overrides the preview endpoint's
strict `default-src 'none'` CSP** (preview loses its intended strict policy; sanitized HTML so low-risk)
→ tracked in the follow-ups below. **Next: item ②.**

**✓ Earlier this session: Bucket A item ⓪ — create-path Official-pointer gap — DONE, deployed +
Rock-verified.** Commits `68fc706` (hook + specs) + `ca826f1` (spec cleanup-order fix).
`validateOfficialVersionPointer` now also rejects `officialVersion` on an authenticated create; the
`#2` int spec is rebuilt two-phase + a create-guard spec added. `test:int` **15/15** on the Rock, a
sanity-flip fails only the new spec (gate has teeth), app rebuilt (migrate clean), graphql still 404.
Full write-up in DECISIONS.md 2026-06-28 (top entry). **Next: item ①.**

**Earlier this day (prior session):**

**What this session did:**
- **Pushed** the 4-commit hardening batch (`68677ae..a97d596`: GraphQL off, preview sanitize+headers,
  int harness, docs) — it had been stuck unpushed on the laptop for credential reasons.
- **Deployed on the Rock** (`git pull` → `docker compose up -d --build`; migrate had nothing pending;
  app healthy). Host `npm ci` is NOT needed/used — `node_modules` is root-owned and the image installs
  deps internally from the lockfile (which already has `dompurify`).
- **Verified the hardening:** `POST /api/graphql` → 404, `GET /api/graphql-playground` → 404; security
  headers all present (nosniff / X-Frame-Options:DENY / Referrer-Policy / DNS-prefetch off / non-script
  CSP); `next build` clean; `test:unit` **33/33** (incl. `sanitizeHtml` keeping tables, stripping
  script).
- **Got `test:int` actually running for the first time ever** — it had never executed anywhere with a
  DB. Fixed 3 real bugs (committed): `vitest.config.mts` `jsdom`→`node`; fixture phase
  `'Predict'`→`'Predict Phase'`; `access.int.spec.ts` now resubmits the working copy's real rows (with
  ids) instead of an id-less fresh bundle. **`test:int` 9/9 green**, and a **sanity-flip** (kill the
  immutability guard) flips only the matching test red — the gate has teeth. Full write-up + the **Rock
  test-DB procedure** (isolated `lesson3_test` + temp `test.env` swap) in DECISIONS.md 2026-06-27.

**✓ Bucket A — server-side invariant hardening — DONE, deployed + Rock-verified (2026-06-28).**
Commits `0caf341` (hooks/helper) + `fb72cec` (unique-index migration). The product invariants are now
enforced as collection hooks + a DB constraint, not just in the workflow paths:
- **#2** `validateOfficialVersionPointer` rejects an AUTHENTICATED update that clears `officialVersion`
  to null; the system/`overrideAccess` path (ingest, roundtrip cleanup, fixture teardown) stays exempt.
  *(Follow-up: this covered only the UPDATE path — the CREATE-path sibling gap is item ⓪ below.)*
- **#3a** new `enforceVersionPlanConsistency` — a version's `subjectGrade` must equal its plan's.
- **#3b** `semver` is server-immutable (field `access.update: () => false`), not just UI `readOnly`.
- **#4** fork uses `nextSemverForPlan` (next free patch across the plan) + a **unique
  `(lessonPlan, semver)` index** (`lessonPlan_semver_idx`, migration
  `20260628_154237_add_version_semver_unique`, idempotent up/down). Pre-applied cleanup: deleted the
  two non-Official `1.0.1` verifier-cruft working copies on plan 10 (versions 23, 26) so the index
  could build — corpus now has zero `(plan, semver)` dups. **`test:int` 14/14** (4 new invariant specs
  + the unique-index regression). Migration applied to live `lesson3` AND `lesson3_test`.
- **#10 DEFERRED** (lowest): DB-level uniqueness for subject-admin-per-grade — the hook fan-out
  (`autoDemotePriorSubjectAdmins`) still handles it; a partial unique constraint needs a representation
  change, out of scope for this batch. Revisit if concurrent promotions become a real risk.

**Next — continue the hardening order:**

- **✓ ⓪ Bucket A follow-up — create-path Official-pointer gap — DONE (2026-06-28).** Closed +
  deployed + Rock-verified (commits `68fc706` + `ca826f1`). `validateOfficialVersionPointer` rejects
  `officialVersion` on an authenticated create; system/`overrideAccess` exempt. `#2` int spec rebuilt
  two-phase, create-guard spec added, `test:int` **15/15**, sanity-flip proven. See DECISIONS 2026-06-28.
- **✓ ① endpoint/authz e2e — DONE (2026-06-28).** New `tests/http/endpoints.http.spec.ts` +
  `vitest.http.config.mts` + `test:http` (commits `059b18d` + `847fdd7`): graphql-404, preview
  auth/read/edit gates + CSP, export DOCX+PDF end-to-end (read-gated, no Official gate), Bucket-A
  invariants over HTTP. Stale `frontend.e2e.spec.ts` removed. **`test:http` 13/13** on the Rock (hits
  live `lesson3` + `E2E_BASE_URL=http://app:3000` — second run procedure, see DECISIONS 2026-06-28).
- **② dependency advisories (#1) — DO THIS NEXT (assessed 2026-06-28; `audit:prod` script added).**
  Current pins `payload@3.85.1` / `next@16.2.6`; `npm run audit:prod` is **RED** — 11 advisories (4 high),
  ALL framework-transitive: **undici** (high ×7, bundled under `payload`), **nodemailer** (high, no
  upstream fix, via `@payloadcms/email-nodemailer`; not exploitable in our usage — we don't use the `raw`
  message option), **postcss** (moderate, via `next`). **Do NOT `npm audit fix --force`** — it proposes
  destructive downgrades (`next@9.3.3`, `payload@3.79.1`). The task: research which Payload/Next release
  bumps the vulnerable transitive deps (knowledge-currency rule — read release notes/installed source,
  not memory), bump deliberately, regenerate types/migrations ON THE ROCK if the schema shifts, then
  `next build` + `test:int` (15/15) + `test:http` (13/13) + `audit:prod` all green. See DECISIONS
  2026-06-28.
- **③ NEW follow-up (Low) — preview CSP override.** The e2e (item ①) proved `next.config.ts`'s `/:path*`
  baseline CSP overrides (not intersects) the preview endpoint's own strict `default-src 'none'` CSP, so
  the preview loses its intended strict standalone policy (low-risk: preview HTML is DOMPurify-sanitized
  + script-free). Fix: scope the `/:path*` rule to EXCLUDE the preview path (e.g. negative-lookahead
  source) so the endpoint's Response CSP survives — and verify Next header precedence by `curl` on the
  Rock (don't trust the config alone; that's the assumption this finding broke). Then tighten the
  `test:http` preview assertion back to `default-src 'none'`. See DECISIONS 2026-06-28.

**Codex audit note (2026-06-27 eve):** 11 findings, 7/10. Bucket A (#2/#3/#4; #10 deferred) is now
DONE (above). Bucket B just re-confirms the existing backlog (#1, #6, #7, #8, #9). #5 export-job dedupe
is real → in the Phase-5 residuals. Corrections: the "local test runner broken (esbuild)" is an
env/platform artifact, not a defect — `test:int` 14/14 + `test:unit` 33/33 are green on the Rock; #11
upload-buffering is Site-Admin-only (Low).

---

## ▶ Track context — Production Hardening (the backlog below is the work)

The **Official-version model cutover is COMPLETE and Rock-verified** (origin/main `1959daf`,
2026-06-25) — it is the stable foundation the hardening work builds on (the in-progress work is the
hardening backlog, NOT the cutover; see "⚠ RESUME HERE"). The product model it implements:

- A lesson plan has many retained immutable versions; exactly one is **Official** at a time, globally.
- Upload/import creates version `1.0.0` and makes that exact snapshot Official immediately.
- **Editing forks a mutable Not-Official working copy** (Official versions are immutable); a Subject/
  Site Admin marks a working copy Official when ready (moves the pointer, no content copy).
- Teachers can view/export all versions; Official is a default/trust marker, not an access/export gate.

**`lesson-plans` + immutable `lesson-bundle-versions` are now the ONLY representation** — the legacy
`lesson-bundles` collection and its entire bundle path are gone, in code AND in the DB (drop migration
`20260625_125532_drop_lesson_bundles` applied; 0 bundle tables remain). The full stage history (1 →
2a → 2b → 2b-finish → 3) is in `docs/CHANGELOG.md`; the reasoning + the collection-drop migration
gotchas are in `docs/DECISIONS.md` (2026-06-25 + 2026-06-24 entries).

**Last Rock verification (2026-06-25):** roundtrip-regression **3/3 byte-identical**, `verify-rbac`
**7/7** (now People/Curriculum RBAC only — lesson-content RBAC lives in `verify-stage2b-edit`),
`verify-stage2b-edit` **13/13**, `verify-stage2b-preview` **7/7**, `verify-stage2-export` DOCX+PDF;
app healthy on the new schema.

**Small non-blocking follow-ups left by the cutover** (do opportunistically, not gating):
- ~~Unit test for `parsePreviewCandidate`'s 400/413 cases~~ — **DONE 2026-06-26**
  (`tests/unit/parsePreviewCandidate.spec.ts`, runs under `test:unit`; also added a Content-Length
  pre-parse guard test).
- The DB-less fidelity scripts need `-e ARES_DEMO_PATH=/ares-demo -v /srv/lesson3/out/ares-demo:/ares-demo`
  to run in-container on the Rock — worth baking into a Rock verify helper (see DECISIONS 2026-06-25).
- `ingest-data/` is untracked on the Rock — confirm it's meant to be gitignored.

---

## Where things stand (origin/main `1959daf`, all DEPLOYED + Rock-verified 2026-06-25)

**Phases 0–5 are done, two UX batches shipped, and the Official-version cutover is COMPLETE and live:
the teacher path (Stage 2a) and admin editing (Stage 2b) run on `lesson-plans` +
`lesson-bundle-versions`, the admin Preview/Export controls run on versions (Stage 2b-finish), and the
legacy `lesson-bundles` collection + its entire bundle path are deleted in code AND in the DB
(Stage 3).** Everything below is live on the Rock (the deploy/verification box — see "Rock"):

- **Upload/import** — safe static extraction of ARES `.js`/`.json` (parse-never-execute), one
  all-or-nothing transaction, **contract drift is a HARD gate**. Dev CLI + Site-Admin-only web upload
  (`POST /api/lesson-plans/upload`; panel above the Lesson Plans list).
  New writes create `LessonPlan` + `LessonBundleVersion 1.0.0` and set the Official pointer.
- **Data model + versioning** — `lesson-plans` owns stable identity + `officialVersion`;
  `lesson-bundle-versions` owns immutable structured snapshots (META, UNIT, LESSONS[],
  FINAL_EXPLANATION, SUMMARY_TABLE) — the content fields live in `fields/lessonContent.ts`.
  `20260624_221905_official_version_model` created the DB schema; the 13 legacy bundles were backfilled
  (Stage 1); `20260625_125532_drop_lesson_bundles` dropped the legacy collection. These are now the
  ONLY representation — the `lesson-bundles` collection and its bundle path are gone in code and DB.
- **RBAC** — Site Admin / Subject Admin / Editor / Teacher, field-level. Lesson-content RBAC (Editor
  prose vs admin structure/answer-keys, version immutability, read scoping) is covered by
  `verify-stage2b-edit`; the slimmed `verify-rbac` now covers only People/Curriculum rules
  (SubjectGrade displayName, ≤1-subject-admin auto-demote, password/assignment guards).
- **"The App"** (`app/src/app/(frontend)`) — the role-aware frontend ALL roles log into. Teachers
  live here only (excluded from `/admin`, redirected home). Has browse → view → preview → export.
- **UI / admin redesign (2026-06-23)** — the shared **Lesson Plans** browse page is now strand-first:
  subject-grade → strand → sub-strand in curriculum order (by `meta.substrand_id`, dotted-numeric),
  four-step type scale, lesson counts, ink titles, server-side `?q=` search; pure server component +
  `src/lib/substrand.ts` (DB-free unit suite, `test:unit`). The Payload **dashboard** boxes are
  replaced by a quiet, role-aware landing (`src/components/AdminDashboard`, `views.dashboard` override),
  and the nav groups are renamed/reordered to **Lesson plans / Curriculum / People**. The redundant
  Lesson-Bundles "META > Title Doc" list column is gone. Lesson Plans page + dashboard verified live;
  see DECISIONS 2026-06-23.
- **UX batch (2026-06-24) — deployed on the Rock** (DECISIONS 2026-06-24): **one login**
  (`/admin/login` → frontend `/login` via a `next.config` redirect; everyone lands on `/`); a
  **consistent top-right user menu** on both surfaces (username · Admin/Lessons · logout · initials
  avatar) with **one logout** (Payload's nav logout hidden via `admin.components.header` + custom.scss);
  a single **"Include ARES Resources" checkbox** replacing Standard/Compact across the teacher view +
  admin export/preview (`lib/format.ts` is the one mapping); admin font scale-up + an SVG nav glyph.
- **§5 editing/preview** — admin editor with array row labels, working-copy HTML preview, **live
  unsaved-edit preview** (`POST /api/lesson-bundle-versions/:id/preview`, edit-gated), teacher "Include
  ARES Resources" toggle.
  **Browser smoke-test ALL PASS** (2026-06-22).
- **§9 export (version path)** — DOCX **and PDF** on versions
  (`GET/POST /api/lesson-bundle-versions/:id/export?format=standard|compact&as=docx|pdf`), READ-access-
  gated, NO published gate (every retained version is exportable). PDF = the generated DOCX converted by
  a **Gotenberg sidecar** via the `docxToPdf(buffer)` seam. Stage 2a moved this to versions and Stage 3
  deleted the legacy `/api/lesson-bundles/:id/export` path.
- **§9/§11 async export (Phase 5) — readiness #1 closed. Live + verified 2026-06-23.** Export is
  two-phase: warm → `200` zip; cold → enqueue the `generateVersionArtifact` **Jobs Queue** task + `202`
  + a status URL (`GET …/export/status?jobId=`). An **artifact cache** (content-addressed by the
  immutable `versionScope`, on a `lesson3_artifact_cache` named volume) makes repeats free; a **per-user
  rate limit** (`429 + Retry-After`) guards export + preview; the queue `autoRun` `limit` caps concurrent
  heavy conversions. Frontend follows the 202 → poll → download handshake. See DECISIONS 2026-06-23.
  *(Stage 3 deleted the bundle-path `generateArtifact` job and dropped its task-slug enum value.)*
- **Corpus** = the 13 originally-published bundles (10 Biology + 3 Math, Grade 10), backfilled (Stage 1)
  into `lesson-plans` + Official 1.0.0 `lesson-bundle-versions` — verified lossless. The versions are
  now the ONLY representation (the legacy bundles are gone in code and DB). DB as of the Stage 3 deploy:
  13 plans / 14 versions (one extra working version from verifier runs — harmless).

**The Rock is an explicit NON-PRODUCTION verification environment** — not production-ready (see the
readiness backlog). It is the only place with a DB; `test:int` and `next build` only run there.

---

## The chosen track — Production hardening (IN PROGRESS) — and the alternatives

**Production hardening is the chosen, active track** (2026-06-27), being worked top-down in this agreed
order: GraphQL (done) → preview sanitize+CSP (done) → Bucket A invariants + ⓪ (done) → endpoint/authz
e2e (done) → **#1 dependency advisories (next; deliberate upgrade)**. The two alternatives below are NOT being pursued now — recorded
so a future session knows they exist.

1. **Production hardening** — *the active track.* The audit (2026-06-23) refined the backlog below;
   work it top-down. *Shifts the system from "validated" to "deployable for real."*
2. **Cross-user "The App" features (§10)** — the other major track. Email-a-doc, internal messaging +
   notifications, favorites, translation (Swahili), AI (summaries). All ordinary Payload
   collections/endpoints/hooks + the **now-live Jobs Queue**; none touches the generator/versioning
   core. SPEC §10. *Pick this for forward product progress instead of hardening.*
3. **Finish PDF (§9)** — only the **formal PDF fidelity gate** remains (audit #12). Small, Rock-side
   ops; can ride along with any track. See in-flight follow-ups.

## In-flight follow-ups (small, already scoped)

- **Formal PDF fidelity gate** (`app/scripts/pdf-fidelity-check.ts`) — conversion is proven; the
  layout-vs-Word measurement hasn't run. Needs, on the Rock: **ImageMagick** installed (poppler is
  present); **3 Word oracle PDFs** staged as `<name>.oracle.pdf` in `/srv/lesson3/out/ares-demo` (open
  each approved DOCX in Word → Save as PDF); and a path to reach the **port-less** `gotenberg` (expose
  it temporarily, or run the script in a tooling image on the `lesson3_default` network).
- **Row-label doubling** (cosmetic) — lesson rows read "Lesson 1 — Lesson 1 — …" because `RowLabel`
  prepends `Lesson N —` while the stored `title` already begins with its own. Fix in
  `components/RowLabel` (strip a leading `Lesson N —` for the lessons array, or drop its prefix).
- **chem_1_4 → 14th bundle** — blocked on Mark coercing its `LESSONS[].number` from string to integer
  upstream. When fixed: re-pull `upstream`, stage into `out/ares-data`, ingest (the hard gate admits it).
- **No-op publish semver bump** — superseded by the Official pointer model. Moving Official should
  update only `LessonPlan.officialVersion`, not create or bump a version.
- **Phase 5 residuals (small):** completed `payload-jobs` rows are kept (no auto-delete) for failure
  visibility → add periodic cleanup; the `…/export/status` endpoint is unthrottled (cheap, but a
  generous limiter could be added); the `429` rate-limit was deployed but not yet eyeballed under a
  burst (covered by the int-test work in readiness #6). The per-user limiter is **in-memory /
  per-process** — fine on the single-box Rock; must move to a shared store if ever horizontally scaled.
  **Export-job dedupe (Codex #5, 2026-06-27):** each cold `POST /:id/export` enqueues a NEW
  `generateVersionArtifact` job even for an identical `{versionId, format, kind}` already pending —
  add an idempotency key / pending-job lookup so repeats coalesce (the artifact cache already makes
  *completed* repeats free; this guards the in-flight window).
  **Export-status `jobId` binding (Codex re-review #4, 2026-06-28, Low):** `exportVersionStatusEndpoint`
  returns `{ready}` from the `isExportReady(spec)` short-circuit BEFORE the supplied `jobId` is looked
  up/bound, so once an artifact is cached any (even bogus) `jobId` gets `200 {ready}`. NOT a data leak
  (caller still needs version READ; status carries no job detail) — a contract nit (advertised
  job-specific, actually spec/version readiness). Fix: bind `jobId` before the ready short-circuit, OR
  make the API explicit that `jobId` is optional. See DECISIONS 2026-06-28 (eve).

## Production-readiness backlog (the Rock is NOT production)

**Do not soften this:** Codex (2026-06-22) found **no current Critical/High *exploitable application
bug***, but that is NOT "production-ready." The system must not serve real users / sensitive data at
scale until ALL of these land:

**External audit (GPT-5.5, 2026-06-23) — Phase-5 items already resolved (see DECISIONS):** the Payload
**jobs surface was open by default** (run endpoint `() => true`; collection fell back to any-auth-user)
→ **locked down** (`jobs.access` + `jobsCollectionOverrides`, `5b58b41`); and three async-export
correctness bugs — temp-file race, manifest-only readiness, stale-`lockVersion` stuck poll — **fixed**
(`8bede30`). **Audit #3 — CLOSED + Rock-verified 2026-06-24 (`9c9a701`):** the GET `/export` enqueue
(not idempotent / CSRF) was split — GET is now serve-only (warm → 200 zip; cold → 409, never enqueues),
and a new **POST `/export`** is the only state-changing op (CSRF-guarded by the SameSite=Lax cookie).
Verified end-to-end on the Rock (cold POST → 202 → poll → 200 zip; cold GET → 409; unauth POST → 401).
The numbered items below are the remaining hardening backlog.

1. **~~Heavy generation is synchronous + unthrottled~~ — CLOSED (Phase 5, 2026-06-23).** Fixed with
   the **Jobs Queue + per-user rate-limit + artifact cache** (deployed + verified live). Heavy
   conversion no longer ties up an app worker (cold → `202` + enqueue, bounded by the queue `limit`);
   repeats are free (cache); per-user `429` guards export + preview. Residuals tracked in the
   follow-ups above (jobs cleanup, status-endpoint limiter, per-process limiter caveat) — none blocking.
2. **Dependency advisories** — `npm audit` shows criticals/highs incl. `nodemailer`/`undici` via
   Payload's own deps. Resolve by a deliberate Payload/transport upgrade (not a blind bump).
3. **~~CSP + HTML-sanitization posture~~ — LARGELY CLOSED 2026-06-26.** Mammoth preview HTML is now
   sanitized at the single seam (`docxToSections` → `sanitizePreviewHtml`, DOMPurify+jsdom), and
   baseline security headers (nosniff, X-Frame-Options, Referrer-Policy, + a non-script CSP:
   object-src/base-uri/frame-ancestors/form-action) are set globally in `next.config.ts`. See DECISIONS
   2026-06-26. **Still open:** a strict nonce-based `script-src` CSP (deferred — needs Next hydration
   nonce plumbing); a review of CSRF posture beyond the SameSite=Lax cookie; and (NEW, found by item ①'s
   e2e 2026-06-28) the **preview endpoint's strict `default-src 'none'` CSP is overridden** by the global
   `/:path*` CSP — scope the global rule to exclude the preview path so the strict policy survives (see
   RESUME-HERE item ③ + DECISIONS 2026-06-28). Low risk (preview HTML is sanitized).
4. **Optimistic concurrency** — updates increment `lockVersion` but don't reject a stale client
   version. Add the check, but **EXEMPT system/ingest paths** (`overrideAccess` republish, migrations)
   or it breaks ingest.
5. **FE/ST deliverable model — CLOSED 2026-06-26 (option a).** Single-document sub-strands are
   legitimate: a missing FINAL_EXPLANATION / SUMMARY_TABLE is valid content, not incomplete data, so
   the deliverable check stays informational and must never become a hard gate. The always-present
   LessonSequence remains hard-gated by `validateGeneratable`. The typed `notApplicable` state
   (option b) is deferred (no functional gain today). SPEC §3 amended; see DECISIONS.md 2026-06-26.
6. **Tests** — the auth+role fixture harness EXISTS and runs at two layers: Local-API `test:int`
   (`tests/int/access.int.spec.ts`, **15/15** on the Rock 2026-06-28, sanity-flip proven) AND the new
   over-the-wire `test:http` (`tests/http/endpoints.http.spec.ts`, **13/13** on the Rock 2026-06-28 —
   preview/export/PDF/authz + `POST /api/graphql → 404`; closed the old item-#4 e2e gap and removed the
   stale `frontend.e2e.spec.ts`). **Still open:** both suites need a Rock-specific DB/URL procedure (see
   DECISIONS 2026-06-27 + 2026-06-28) — `test:int` an isolated `lesson3_test` + `test.env` swap,
   `test:http` the live `lesson3` + `E2E_BASE_URL` — bake BOTH into a one-command helper. PDF fidelity
   gate in CI (see above). Playwright `tests/e2e/` (browser, localhost:3000) is dev-only, not in the
   Rock flow. **Gate definition (Codex re-review #7, 2026-06-28):** the canonical verification gate is
   **`test:unit` + `test:int` + `test:http`**; the default `npm test` is the scaffold
   `test:int && test:e2e` and OMITS `test:http` (can't merge them — `test:http` needs the running
   container while Playwright `test:e2e` needs a dev server, so no single chain is runnable). A real CI
   runner that stands up app+DB then runs all three is the proper fix; until then run the three
   explicitly (see DECISIONS 2026-06-28 for the deps-image commands).
7. **~~Disable/gate unused GraphQL + GraphQL Playground~~ — CLOSED 2026-06-26.** `graphQL.disable: true`
   in `payload.config.ts` AND both generated `api/graphql*` route files deleted (the POST handler
   ignores the flag at runtime, so deletion is what actually 404s the endpoints). Rock build confirms
   `/api/graphql` + `/api/graphql-playground` are gone. See DECISIONS 2026-06-26. *(Add a `POST
   /api/graphql → 404` e2e assertion as a regression guard — folded into the endpoint-coverage work.)*
8. **Lesson browse hard-limits at `limit: 200`** with no pagination (`(frontend)/page.tsx`) — content
   becomes undiscoverable once the corpus grows to hundreds (expected). Add page/search.
9. **Ops** — error tracking (Sentry), off-site encrypted Postgres backups + pre-migration snapshots,
   CI/CD so deploy isn't bound to one machine. SPEC §11.

---

## Must-know operational knowledge

**Rock** = the deploy/verification box. Login `david@rock5b` (passwordless SSH over Tailscale);
app at `http://rock5b.tail49b05.ts.net:3001` (`/admin` + The App at `/`); repo at `/srv/lesson3`;
Docker compose (`app` on host :3001, `postgres` + `gotenberg` internal-only, one-shot `migrate`).
**origin/main is the single source of truth** — push first, then `git pull` on the Rock.

**Deploy:**
- *Code/data only (no schema change):* `git pull` → `docker compose up -d --build`. (Script-only
  changes that don't rebuild the app: `git pull` + re-run via the deps image, see below.)
- *Schema change:* regenerate types + migration ON THE ROCK (Node 22) and commit them, because the
  local `payload generate:*` CLIs break on newer Node:
  ```
  docker build --target deps -t lesson3-deps ./app
  docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app --env-file .env \
    lesson3-deps npx payload generate:types            # commit app/src/payload-types.ts
  docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
    -w /app --env-file .env lesson3-deps npx payload migrate:create <name>   # make up/down idempotent; commit
  docker compose up -d --build                          # one-shot `migrate` applies pending, then `app` starts
  ```
  Verify with `verify-rbac.ts` / `roundtrip-regression.ts` via the same deps-image + `--network` line.
  *(The Phase 5 `payload-jobs` migration and the 2026-06-24 Official-version migration were generated
  + committed this way; both are now on `main`.)*
- *Push from the Rock:* the Rock is normally pull-only (no git push credential, no `gh`, no SSH key).
  When the Rock must push (e.g. it generated types/migration), push once over HTTPS with a short-lived
  fine-grained PAT: `git push "https://<user>:<TOKEN>@github.com/<owner>/Lesson3.git" <branch>`.

**Artifact cache (Phase 5):** generated DOCX/PDF bytes are cached on a **`lesson3_artifact_cache`
named volume** at `ARTIFACT_CACHE_DIR=/var/cache/lesson3`. **Two deploy gotchas (see DECISIONS
2026-06-23):** a fresh named volume mounts **root-owned** but the app runs as `nextjs` (uid 1001) —
the Dockerfile now pre-creates + `chown`s the dir, but if you ever wipe the volume confirm it's
writable; and **`ARTIFACT_CACHE_DIR` must be set in `.env`** (then `up -d --force-recreate app`) or
the cache silently falls back to the non-writable `/app/.artifact-cache` and every export job fails
with `EACCES` (stuck at `202`). The job error names the exact failing path — that tells you which.

**Env** (`.env` on the Rock; `app/.env.example` documents all): `DATABASE_URI`, `PAYLOAD_SECRET`,
`ADMIN_URL`, optional `SERVER_URL` (leave EMPTY on internal/plain-HTTP — strict CSRF bounces some
browsers), SMTP_*, `GOTENBERG_URL=http://gotenberg:3000`, `GOTENBERG_TIMEOUT_MS=120000`,
`ARTIFACT_CACHE_DIR=/var/cache/lesson3` (Phase 5; required), optional `ARTIFACT_CACHE_MAX_BYTES`,
`RATE_LIMIT_*`, `JOBS_AUTORUN_CRON`/`JOBS_AUTORUN_LIMIT`.

**Logins** — `app/scripts/seed-users.ts` seeds a Teacher / Editor / Subject-Admin (scoped to Biology
G10 by default; passwords from `*_PASSWORD` env or printed once). The Rock already has Teacher +
Editor seeded (ask the user for the passwords — they are NOT in the repo).

**Watch-outs:**
- Any `payload run` script must **top-level-await** its work, or it silently no-ops.
- Generated files MUST land in a bind-mounted host dir (`/srv/lesson3/out`) or they vanish with `--rm`.
- Math META differs (`col3Label`/`col5Label`, single-quoted/identifier-key JS) — the acorn extractor
  handles it; carried verbatim. Mathematics G10 is seeded.
- The vendored generator path is **byte-pristine** (fidelity 3/3) — don't refactor it in passing.

**Assets** (verified — don't trust memory):
- Stakeholder-approved oracle: `~/Desktop/ares-docx-fidelity-demo/` (`bio_1_4_data.js` + 3 approved
  DOCX). Override the DB-less gates' location with `ARES_DEMO_PATH` (Rock: `/srv/lesson3/out/ares-demo`).
- Generator repo: `~/Documents/GitHub/cbe-generation-system` (on `upstream`). Entry
  `generators/lib/build_docs.js` exports `buildSoW`/`buildFinalExplanation`/`buildSummaryTable`.

## Open / blocked

- **Resource column from ARES (blocked on Mark).** The blank Resource column is a fidelity gap; the
  resolved per-lesson resources (video + reading) live only in the Python recommender's output.
  Plan when it arrives: add `source` to the resource schema (migration), carry via
  `framework[].resources`, render via `vendor/aresResources.js`. See DECISIONS (2026-06-09).
- **ARES confirmation** — awaiting Mark on which data/DOCX are canonical + the resource-data request.
  Not blocking core work.
- Corpus is expected to grow from 13 to dozens→hundreds (Chemistry/Physics incoming) — informs the
  pagination item and any browse/search work.
