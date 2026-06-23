# Changelog — session-by-session build log

The chronological build log (newest on top). This is **history**, kept for provenance.

- For the **live launch prompt** (current state + what to do next), read **`docs/NEXT-SESSION.md`**.
- For **decisions and their reasoning**, `docs/DECISIONS.md` is canonical.
- For **architecture and domain rules**, `SPEC.md` is canonical.

---

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
