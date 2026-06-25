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

**Do this BEFORE planning a new phase** (see "▶ Start the next session here" below) — there is a
defined, in-flight sequence to resume, not a blank-slate phase choice.

---

## ▶ Start the next session here (defined sequence — resume, don't re-plan)

The current work-in-flight is the **Official-version model migration**, not generic hardening. The
user clarified the product model on 2026-06-24:

- A lesson plan has many retained immutable versions.
- Exactly one version is **Official** at a time, globally.
- Upload/import creates version `1.0.0` and makes that exact snapshot Official immediately.
- Editing any version creates a new Not Official version; it does **not** mutate that version.
- Site Admins and matching Subject Admins can move the Official pointer to any retained version.
- Teachers can view/export all versions; Official is a default/trust marker, not an access/export gate.

What is already on `origin/main` and deployed to the Rock:

- `273816c` added `lesson-plans` + `lesson-bundle-versions`, official-pointer access rules, upload/import
  writes to the new model, and product-language/docs updates.
- `5c847e2` added the missing Payload generated types + migration
  `20260624_221905_official_version_model`; it was deployed and the one-shot migrate container exited
  successfully. The missing-table admin error (`relation "lesson_plans" does not exist`) is fixed.

Resume in this order:

1. **✅ DONE (2026-06-24) — Editor symptom verified resolved (server-level).** Migration applied
   cleanly (`Migrated: …official_version_model`), all `lesson_plans`/`lesson_bundle_versions` tables
   exist, no runtime errors, `/admin/collections/lesson-bundles/:id` serves 200, APIs 403 unauth (not
   500). The `relation "lesson_plans" does not exist` crash is gone.
2. **✅ DONE (2026-06-24) — Stage 1: data backfill.** The 13 published legacy bundles (ids 63–75) are
   migrated into `lesson-plans` + Official `lesson-bundle-versions` 1.0.0 and verified LOSSLESS
   (39/39 docs content-identical) on the Rock. Scripts: `scripts/migrate-bundles-to-versions.ts`
   (idempotent, dry-run default) + `scripts/verify-migration.ts`. See DECISIONS 2026-06-24. Legacy
   `lesson-bundles` left untouched (reversible). **DB now: 13 plans / 13 official / 13 versions.**
3. **◐ IN PROGRESS — Stage 2: read/export cutover.**
   - **✅ Stage 2a DONE + verified on the Rock (`0d4a49a`).** The TEACHER path (browse, detail +
     `?version=` selector, content-preview, DOCX/PDF download) now reads `lesson-plans` +
     `lesson-bundle-versions`. Generator-agnostic artifact cache (scope key), `generateForVersion`,
     `generateVersionArtifact` job, version export endpoints on `lesson-bundle-versions`,
     `findReadablePlan`/`findReadableVersion`. roundtrip-regression repointed to versions (it had
     broken when ingest moved to the new model). Verified: roundtrip 3/3 byte-identical;
     `verify-stage2-reads` 13/13; `verify-stage2-export` DOCX+PDF. See DECISIONS 2026-06-24.
   - **▶ NEXT — Stage 2b:** edit-in-place fork-on-save (open a version in the admin editor; intercept
     save → spawn a new Not-Official version; needs the field-split enforcement — `enforceBundleStructure`
     equivalent — replicated for `lesson-bundle-versions`); cut the admin Preview/Export components over
     to versions; **Make Official** UI (set `LessonPlan.officialVersion`, no content copy). Until this
     lands, admin editing still uses the legacy bundle editor (so admin edits ≠ teacher views).
   - **Stage 3:** retire `lesson-bundles` (drop collection + its export/preview endpoints + migration).
   Original dependency-ordered notes + locked decisions below:
   - **Read scope = open to all authenticated (teachers see all subjects).** The existing
     `Boolean(user)` read access on `lessonPlanRead`/`lessonBundleVersionRead` is CORRECT and stays —
     no rewrite. (A subject-grade-scoped read was considered then reversed: plain teachers have no
     association, and versions have no draft to hide, so scoping reads would hide everything for no
     gain. See DECISIONS 2026-06-24.) WRITES stay subject-grade-scoped (already correct).
   - read layer (`lib/readBundle.ts` → add `findReadableVersion` + a plan resolver; frontend pages)
     → `lesson-plans`, defaulting to the Official version, with a version selector for all versions;
   - **Detail URL = `/lessons/<planId>?version=<id>`** (plan id; Official by default). Old
     `/lessons/63` bundle-id links break — acceptable (non-production Rock only).
   - generator: `generateForBundle` → `generateForVersion(versionId)`; **drop** the published-only
     `assertExportable` gate (a version already passed `enforceBundleVersionGeneratable` at create).
     `bundleToAresData` works on a version unchanged (proven by Stage-1 verify).
   - export/preview/status endpoints (now on `LessonBundles`) → re-mount with version-snapshot
     semantics; **artifact cache key `lockVersion` → the immutable version id** (simpler, content-stable);
   - **Edit = edit-in-place, fork on first save** — open the version in the admin editor; intercept
     the save to spawn a NEW Not-Official version (semver bump, `sourceVersion` set) instead of
     mutating the snapshot. (More hook machinery than a server-action copy — chosen for fewer clicks.)
   - **Make Official** → UI control sets `LessonPlan.officialVersion` only, no content copy
     (`canSetOfficialVersion` + `validateOfficialVersionPointer` already enforce it).
4. **Stage 3 — retire `lesson-bundles`** once reads are cut over (drop the collection + migration;
   re-run `verify-rbac` 36/36 + `roundtrip-regression`).
5. **Then return to the hardening backlog** below: ~~async export verification~~, ~~GET `/export`
   enqueue semantics~~ (both CLOSED + Rock-verified 2026-06-24, `9c9a701` — see DECISIONS),
   pagination, GraphQL/Playground gating, CSP/sanitization, dependency advisories, endpoint
   tests, and PDF-fidelity CI.

---

## Where things stand (as of 2026-06-24, origin/main `97b9379`)

**Phases 0–5 are done, two UX batches shipped, the Official-version schema + migration are live, and
the TEACHER path is fully cut over to the version model (Stage 2a, deployed + verified).** The product
behavior migration is partway: teacher browse/view/export read `lesson-plans` + `lesson-bundle-versions`,
but ADMIN editing still uses the legacy `lesson-bundles` editor until Stage 2b lands. Treat the app as a
transition state until Stage 2b/3 (Start-here items 3–4) are done. What's live on the Rock (the
deploy/verification box — see "Rock"):

- **Upload/import** — safe static extraction of ARES `.js`/`.json` (parse-never-execute), one
  all-or-nothing transaction, **contract drift is a HARD gate**. Dev CLI + Site-Admin-only web upload.
  New writes create `LessonPlan` + `LessonBundleVersion 1.0.0` and set the Official pointer.
- **Data model + versioning** — the TEACHER read/view/export path now reads the new collections
  (Stage 2a): `lesson-plans` owns stable identity + `officialVersion`; `lesson-bundle-versions` owns
  immutable structured snapshots (META, UNIT, LESSONS[], FINAL_EXPLANATION, SUMMARY_TABLE).
  `20260624_221905_official_version_model` created the DB schema; the 13 legacy bundles are backfilled
  (Stage 1). The legacy `lesson-bundles` collection now powers only ADMIN editing + its own export/
  preview endpoints, until Stage 2b moves editing over and Stage 3 retires it.
- **RBAC** — Site Admin / Subject Admin / Editor / Teacher, field-level; `verify-rbac` 36/36.
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
- **§5 editing/preview** — admin editor with array row labels, draft-capable HTML preview, **live
  unsaved-edit preview** (`POST /:id/preview`, edit-gated), teacher "Include ARES Resources" toggle.
  **Browser smoke-test ALL PASS** (2026-06-22).
- **§9 export (legacy path)** — DOCX **and PDF** (`GET /api/lesson-bundles/:id/export?format=standard|compact&as=docx|pdf`),
  READ-access-gated, published-only under the old model. PDF = the generated DOCX converted by a
  **Gotenberg sidecar** via the `docxToPdf(buffer)` seam. **Live + verified under the old model.**
  Must be moved to version snapshots so any Official or Not Official version can export.
- **§9/§11 async export (Phase 5) — readiness #1 closed. Live + verified 2026-06-23.** Export is now
  two-phase: warm → `200` zip; cold → enqueue the `generateArtifact` **Jobs Queue** task + `202` + a
  status URL (`GET …/export/status?jobId=`). An **artifact cache** (content-addressed by
  `lockVersion`, on a `lesson3_artifact_cache` named volume) makes repeats free; a **per-user rate
  limit** (`429 + Retry-After`) guards export + preview; the queue `autoRun` `limit` caps concurrent
  heavy conversions. Frontend follows the 202 → poll → download handshake. See DECISIONS 2026-06-23.
- **Corpus** = 13 legacy published bundles (10 Biology + 3 Math, Grade 10, ids 63–75), all carrying
  populated UNIT. **Now also backfilled (Stage 1, 2026-06-24) into 13 `lesson-plans` + Official
  1.0.0 `lesson-bundle-versions`** — verified lossless. The legacy bundles remain as the live read
  source until the Stage 2 cutover; both representations coexist during the transition.

**The Rock is an explicit NON-PRODUCTION verification environment** — not production-ready (see the
readiness backlog). It is the only place with a DB; `test:int` and `next build` only run there.

---

## Choose the next phase (only after the start-here sequence above)

The immediate work is the **defined sequence in "▶ Start the next session here"** (verify the Rock
redeploy, then audit #3, then the hardening backlog) — that IS the chosen track (production hardening,
decided 2026-06-23). The options below are the bigger picture once that sequence is worked down:

1. **Production hardening** — the chosen/in-flight track. The audit (2026-06-23) refined the backlog
   below; work it in the start-here order. *Shifts the system from "validated" to "deployable for real."*
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
3. **CSP + HTML-sanitization posture** — generated Mammoth HTML is rendered with
   `dangerouslySetInnerHTML` on the teacher route (low risk today: plain-string inputs, Mammoth
   escapes — becomes real **when Resource links land**). Sanitize `docxToSections` output; add the
   preview endpoint's CSP to the teacher frontend route; global security headers + CSRF posture.
4. **Optimistic concurrency** — updates increment `lockVersion` but don't reject a stale client
   version. Add the check, but **EXEMPT system/ingest paths** (`overrideAccess` republish, migrations)
   or it breaks ingest.
5. **FE/ST deliverable model** — *reframed from "bug" to a spec/product modeling gap.* Today's
   warn-only conflates "this sub-strand legitimately has no FE/ST" (6/13 upstream) with "the data is
   incomplete." Resolve via either (a) SPEC §3 allowing single-doc bundles for some sub-strands, or
   (b) a typed `notApplicable`/intentionally-omitted state — THEN a hard gate can fire only on
   genuinely-missing data.
6. **Tests** — `tests/e2e/frontend.e2e.spec.ts` still asserts the blank Payload template (stale
   scaffold); replace/remove it AND add real **preview/export/PDF/authz** endpoint coverage (needs an
   auth+role fixture harness `tests/int/api.int.spec.ts` lacks). PDF fidelity gate in CI (see above).
7. **Disable/gate unused GraphQL + GraphQL Playground** (`payload.config.ts`) — scaffold-mounted,
   recon surface (access controls still apply). Verify the exact Payload `graphQL.disable` option
   against installed source before applying.
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
