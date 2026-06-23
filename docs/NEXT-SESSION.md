# Start-here for the next session — Phase 5+: §5 editor, PDF export, cross-user App features

> **2026-06-22 (§5 smoke-test PASSED + PDF export slice — code-complete, deploying):**
> - **§5 editor refinements browser smoke-test — ALL PASS on the Rock** (driven via Chrome MCP
>   over Tailscale, real Teacher + Editor logins). Results: Teacher login redirects `/admin`→The App
>   home; teacher format toggle Compact↔Standard re-renders server-side; **Teacher POST `/:id/preview`
>   → 404** (edit-gated) while **GET → 200** (read-gated; the verb split holds); **Editor unsaved
>   prose edit → Preview renders it** (banner "UNSAVED EDITS", nothing saved — stored bundle verified
>   pristine afterwards); **Editor structural change (6→5 lessons) → 422**; oversize (>4 MB) → 413;
>   array row labels via the shared `RowLabel` confirmed on all nested arrays (**Lesson N —**,
>   **Phase N —**, **Section N —**, **Rubric row N —**). This closes the last open §5 item.
> - **Cosmetic follow-up (not a failure):** lesson rows read "**Lesson 1 — Lesson 1 — …**" — `RowLabel`
>   prepends `Lesson N —` but the stored `title` already begins with its own `Lesson N —`, so it doubles.
>   Phase/Section/Rubric don't double. Fix later by stripping a leading `Lesson N —` in the lessons
>   row label (or dropping the number prefix for that one array). See `components/RowLabel`.
> - **PDF export slice (§9) — code-complete (tsc/eslint/compose all clean), deploying to the Rock.**
>   PDF = the generated DOCX run through a **local office engine** (one source of layout truth), via a
>   swappable `docxToPdf(buffer)` seam → a **Gotenberg sidecar** (`gotenberg/gotenberg:8`, internal-only,
>   no exposed port — matches the Postgres posture). New `?as=pdf` on the export endpoint reuses the
>   exact READ gate (`findReadableBundle` + `generateForBundle`) then converts each DOCX (502 if the
>   converter is down); DOCX/PDF picker added to the admin Export button + the teacher download links.
>   New files: `src/generator/docxToPdf.ts`, `scripts/pdf-fidelity-check.ts`; `GOTENBERG_URL` in
>   `.env.example`. **Jobs Queue DEFERRED** (approved fallback): synchronous convert ships first
>   (a single sub-strand is a few seconds); the async queue (Payload `jobs.tasks` generatePdf +
>   in-process runner + enqueue/poll) is the immediate follow-up.
> - **➡ Still to run on the Rock (needs the live box):** (a) `pdf-fidelity-check.ts` — the go/no-go
>   on Gotenberg layout fidelity; needs **3 Word-produced oracle PDFs** staged in `ARES_DEMO_PATH`
>   (`<name>.oracle.pdf`: open each approved DOCX in Word → Save as PDF) **+ poppler-utils +
>   imagemagick** on the host. (b) The Jobs Queue async wrapper. (c) The row-label cosmetic fix.
>
> **SHIPPED + DEPLOYED 2026-06-22 (UNIT model + contract hard gate + clean re-ingest):**
> - **Interim UNIT model fix DONE — the Sub-Strand Overview now renders end-to-end.** Modelled the
>   17 canonical UNIT fields (was a dead `overview` stub), migration `add_unit_fields` applied on the
>   Rock. `roundtrip-regression` **3/3** through the full DB path — LessonSequence **381 → 408 blocks**
>   (the +27 overview rows). See DECISIONS (2026-06-22).
> - **Contract drift promoted to a HARD GATE.** `ingestItems` pre-flight now throws on any drift.
>   13/14 conform; **chem_1_4 is rejected** until its string `LESSONS[].number` → integer (deferred
>   from the corpus). Once Mark fixes it: re-pull `upstream`, stage, ingest (gate admits it) → 14th.
> - **Corpus re-ingested clean (13 fresh, ids 63–75, published 1.0.1).** Wiped the old empty-UNIT
>   bundles (`scripts/wipe-bundles.ts`, new) and re-ingested the 13 conforming upstream files; all
>   carry populated UNIT in the DB. Fidelity oracle refreshed to the populated-UNIT bio_1_4 + ARES's
>   regenerated DOCX (Rock `out/ares-demo`, Desktop pending if wanted).
> - **Teacher /admin UX fixed.** A Teacher who authenticates at `/admin` (stale cookie / admin login)
>   was shown Payload's hard "no admin access" error. Now overridden via Payload's own
>   `admin.components.views.unauthorized` → a server component `redirect('/')` to The App home.
>   Verified on the Rock (Teacher→`/`, Editor→Dashboard). `importMap.js` regenerated canonically via
>   `generate:importmap` (Rock, Node 22). See DECISIONS (2026-06-22).
> - **On origin `c7b0589`; Rock mirrors origin, app rebuilt + up.** Types/migration/importMap were
>   generated on the Rock (Node 22) then pulled to origin so **origin is the single source of truth**.
>   Corpus = 13 published bundles (ids 63–75), all carrying populated UNIT. `verify-rbac` 36/36;
>   `roundtrip-regression` 3/3; hard gate proven to reject chem_1_4 live.
> - **Rock staging dirs:** `out/ares-demo` (refreshed fidelity oracle — keep, used by
>   `roundtrip-regression`), `out/ares-data` (the 13 staged corpus files — keep for re-ingest).
>   Pre-existing untracked strays `11.17.0` (empty file) + `ingest-data/` (old bio_1_4) left as-is.
> - **➡ Still open / next:** (a) **manual browser smoke-test of the §5 editor refinements** (Teacher
>   POST `/:id/preview`→404, Editor unsaved-preview shows edits / structural→422, array row labels,
>   teacher format toggle) — needs role logins in a browser, not yet clicked; (b) optionally refresh
>   the **Desktop** oracle to the populated-UNIT bio_1_4 so local DB-less gates exercise the overview
>   (the Rock oracle is already refreshed; local gates still pass against the old self-consistent set);
>   (c) **chem_1_4 → 14th bundle** when Mark coerces its `number` to integer (re-pull `upstream`, stage
>   into `out/ares-data`, ingest — the gate will admit it); (d) **PDF export (§9)** is the next major
>   phase (constraints locked: offline/free/faithful → local office engine via `docxToPdf(buffer)`).
>
> **2026-06-18 (ARES contract — essentially converged):**
> - **Outcome: 13/14 ARES files now conform to our contract** (`upstream/main` @ `f36d47c`). Over a
>   same-day back-and-forth Mark conformed the whole pipeline to `ares-contract v1.0.0` AND made the
>   generator **schema-validate its own tool-use output + retry on off-schema** (the P1 validate-on-emit
>   ask, built in). Drift trend 55→43→18→**8**. All earlier issues resolved upstream (bio_1_4 parse
>   regression, `safetyNotes` corruption, stray `UNIT.keyInquiry`, missing `META`/`UNIT.content`,
>   bio_3_1 gap). **We adopted ARES's canonical `storylineThread`** to match their SCHEMA.md (commit
>   `8071078`; gate 10/10; live schema URL updated).
> - **Only remaining drift:** the new **chem_1_4** sub-strand emits `LESSONS[].number` as a string
>   (`"1"`) not an integer (all 8 lessons). Flagged to Mark; note drafted in session. Corpus is also
>   **growing past the original 13** (Chemistry now appearing) — expect dozens→hundreds.
> - **Drift snapshots committed:** `docs/drift.md` (latest = `c9a539f`, snapshot at `f36d47c`).
> - **➡ Next on this track:** once chem_1_4's `number` is an integer → **14/14**, then **promote the
>   ingest drift check from warn-only to a HARD gate** (`src/ingest/contract.ts` is wired non-blocking
>   in `ingestItems` pre-flight today). Re-pull `upstream` + re-run `scripts/contract-drift.ts` to verify.
>   The interim Lesson3-side UNIT *model* fix (capture the now-populated UNIT in our schema + re-ingest)
>   is the other half — we detect the data but don't yet store it. See the 2026-06-17 entry below.
>
> **SHIPPED 2026-06-17 (ARES data-contract):**
> - **Contract drafted, shared with ARES, and validated on every ingest.** ARES agreed to
>   canonicalise output. `app/src/ingest/ares-contract.schema.json` is the single source of truth
>   (co-located so the validator imports it AND it's the artifact shared with ARES). New
>   `src/ingest/contract.ts` — a dependency-free subset validator (no ajv) emitting alias/typo-aware
>   drift messages; wired NON-BLOCKING into ingest pre-flight (warn, not gate — current ARES data
>   doesn't conform; promote to hard gate once it does). `scripts/contract-drift.ts` prints the full
>   per-file report (pre-ingest preview + the ARES deliverable); `scripts/contract-check.ts` is the
>   DB-less gate (9/9). Report findings (sent upstream): widespread `safety*otes` corruption,
>   missing `META.titleDoc`/`substrand_id`, `duration`/`storylineThread` aliases, bio_1_4 empty UNIT,
>   missing `schemaVersion`. tsc 0 / eslint 0. See DECISIONS (2026-06-17) + `docs/ARES-DATA-REQUEST.md`.
>   **STILL DEFERRED:** the interim Lesson3-side UNIT model fix (model the UNIT fields + re-ingest)
>   — we now *detect* the dropped-UNIT drift, but don't yet *capture* it. Pick up when ready.
>
> **SHIPPED 2026-06-17:**
> - **§5 editor refinements — all three code-complete (priority #2), pending Rock functional
>   verify (admin-component/endpoint/field-config → `up -d --build`, not script-only).** No new
>   stored fields / no migration / no payload-types regen. tsc 0 / eslint 0.
>   1. **Live-unsaved preview:** Preview now renders the editor's CURRENT (unsaved) form state,
>      not just the saved snapshot. New `POST /:id/preview`: **EDIT-gated** (`isEditorFor` —
>      Teachers→404; hardened after Codex review, GET stays read-gated) and runs the posted data
>      through the real save hook (`enforceBundleStructure`) so an Editor previews only what they
>      could save (admin/structural change→422); 4 MB payload cap (413). `PreviewBundle` posts
>      `reduceFieldsToValues(useAllFormFields())` via a hidden `<form target=_blank>`. GET/POST
>      share one `renderPreviewResponse`. `endpoints/previewBundle.ts` + `components/PreviewBundle`.
>   2. **Teacher format toggle:** `(frontend)/lessons/[id]` got a Standard/Compact `?format=`
>      toggle (server-rendered searchParam); default stays Compact (2026-06-16 decision).
>   3. **Array row labels:** all five nested arrays show "<noun> N — <field>" via ONE shared
>      `components/RowLabel` (clientProps `{field,noun}`); single importMap.js entry (keys on the
>      component path). **Verify on the Rock (rebuild):** as a Teacher, POST `/:id/preview` → 404;
>      as an Editor, prose edit unsaved → Preview shows it, structural change → 422; collapsed
>      lesson/phase rows show meaningful labels; teacher view toggle switches Standard/Compact.
>      Re-run `verify-rbac.ts` (covers the reused `enforceBundleStructure`). See DECISIONS
>      (two 2026-06-17 entries: refinements + Codex security triage).
> - **Repeatable round-trip regression — DONE, 3/3 on the Rock (priority #1 closed).** New gate
>   `app/scripts/roundtrip-regression.ts`: one self-cleaning command that proves the *stored* path
>   (seed-if-missing taxonomy → ingest `bio_1_4_data.js` → publish → `generateForBundle` → diff vs
>   the approved DOCX, Resource column excluded). Fully in-process on the Rock — no Mac round-trip.
>   Tracks + tears down everything it creates in a `finally` (bundle → SubjectGrade → Subject),
>   non-destructive to the live corpus. Committed `890632e`, run green on the Rock. Two Rock
>   gotchas hit + logged: (1) commit+push before the Rock `git pull` can see a script; (2) stage
>   the approved DOCX + data file on the Rock (`ARES_DEMO_PATH`, e.g. `/srv/lesson3/out/ares-demo`).
>   See DECISIONS (2026-06-17). **Next chosen focus: §5 editor refinements.**
>
> **SHIPPED 2026-06-16:**
> - **§5 content preview — DONE, DEPLOYED + verified on the Rock.**
>   Teacher view (`app/(frontend)/lessons/[id]`) renders all three documents (FE/ST omitted when
>   absent). New **admin draft-capable preview**: `generator/previewBundle.ts` (HTML-only render
>   core + shared `docxToSections`, **no published gate** — the deliberate difference from
>   `generateForBundle`), `endpoints/previewBundle.ts` (`GET /:id/preview?format=…`, access-gated
>   via `findReadableBundle(draft:true)`, script-free CSP-locked HTML page, **422 via
>   `validateGeneratable`** for incomplete drafts / logged-500 for real failures), a `PreviewBundle`
>   edit-view button, `endpoints/parseFormat.ts` (shared `?format=` parser). **Verified:** unauth
>   →401 over HTTP; the **authenticated admin Preview render confirmed by the user** in-browser; the
>   render core proven on a real DRAFT (ingested id 60 → 3 sections → deleted).
>   - **On-screen preview defaults to COMPACT** (admin Preview keeps a Standard/Compact toggle; the
>     teacher inline view is Compact-only, both export formats still offered). Reason: the Resource
>     column is deferred/blank, so Standard's on-screen view shows an empty column. **Decided
>     AGAINST injecting fixed column widths into the HTML preview** — cosmetic on the content tier,
>     doesn't generalize (Standard would reserve width for the empty Resource column), and faithful
>     layout/colour belongs to the future **PDF** (the *converted* DOCX). The HTML preview is the
>     fast content check; the DOCX export already carries correct widths + colour. See DECISIONS.
>   - Build gotcha fixed: the #1 secret guard fired during `next build` (NODE_ENV=production, no
>     runtime secret) → gated on `NEXT_PHASE` (`4e0c297`). Commits `05f1fe7`/`c6886c0`/`a1970af`/
>     `277a59d`(docs)/`4e0c297`/`15698a7`(compact default). Rock on **`15698a7`**.
> - **Corpus published + deduped → 13 canonical published bundles** (was 27 with duplicate upload
>   waves; the web upload dedups *within* a request, not across). One published bundle per
>   sub-strand (10 Biology + 3 Math); duplicates 34–47 deleted. **6/13 produce empty FE/ST**
>   (upstream gap — trust the generator's null buffers, not stored-field truthiness).
> - **Codex review triaged.** Fixed: #5 (preview blanket-catch), #8 (`publish-drafts` exit code),
>   #1 (`PAYLOAD_SECRET` prod fail-fast), #10 (scaffold route removed). Deferred (pre-existing):
>   #2 rate-limit/Jobs-Queue, #3 deps, #6 FE/ST hard gate, #7 official-version model, #9 CSRF.
>   #4 XSS = open hardening item (sanitize `docxToSections` when Resource links land).
> - **Caveat:** "Rock deploy" is a **non-production verification** environment, **not**
>   production-ready (secret/rate-limit/headers/deps/backups all still open).
>
> **SHIPPED 2026-06-14:**
> - **Site-Admin web upload + `.json` ingest.** Ingest reads `.js` AND `.json` (deep-equal per
>   sub-strand; `extractAresJson` = safe JSON.parse + `__proto__`/required-group guards). New
>   Site-Admin-only browser upload `POST /api/lesson-bundles/upload` (JSON-only, server-side
>   `isSiteAdmin` gate, self-hiding `beforeListTable` panel) — a DEVIATION from SPEC §7's "no
>   HTTP/upload surface", security-reviewed (no HIGH/MED). Shared ingest core refactored to
>   `ingestItems(payload, items)`. **12 bundles uploaded as drafts (ids #36–47)** — corpus largely
>   loaded; publish each to make it exportable. (Live on the Rock; the upload was used in anger.)
> - **Admin branding** "Lesson Plan Repository 3" (titleSuffix + custom Logo/Icon); upload form
>   resets after success; **local Node pinned to 22.17.0** (`.nvmrc` + volta) to match the Rock and
>   work around the tsx/Node-25 `generate:*` breakage.
> - **Reliable idle-logout** (`IdleLogout` provider, `admin.components.providers`). Server-side
>   15-min expiry was already sound (cookie + JWT die together; expired tokens can't refresh); added
>   a wall-clock backstop (30 s interval + focus/visibility) so idle/backgrounded tabs terminate
>   promptly instead of "eventually." See DECISIONS (2026-06-14).
> - **On `main` at `b036699`.** `.json` ingest + the web upload are deployed/live; **branding +
>   idle-logout (`0cee69a`, `b036699`) are pushed but need a Rock `git pull && docker compose up -d
>   --build` to deploy.** Custom admin components are hand-registered in `importMap.js` (the
>   `generate:importmap` CLI is blocked on local Node 25; bindings match Payload's `default_<md5>`).
>
> **SHIPPED 2026-06-13 (deployed + verified on the Rock):**
> - **§9 export — first slice DONE and LIVE.** Per-export DOCX download as a `.zip` from the
>   admin edit view, via a READ-access-gated Payload collection endpoint
>   `GET /api/lesson-bundles/:id/export?format=standard|compact` + a `beforeDocumentControls`
>   button. Proven end-to-end on the Rock: unauth → 401, bad format → 400, published → 200 +
>   `application/zip` (3 docx). Synchronous for now (Jobs Queue deferred until batch/large needs it).
> - **Second LessonSequence format (`compact`).** Drops Section C's Resource column and re-balances
>   widths (Phase 1.57″=2261; the other four ~1.98″=2854/2857, summing to 13680). Lesson3-owned
>   `app/src/generator/buildSowCompact.cjs` reusing vendored primitives; the vendored `standard`
>   path stays byte-pristine (fidelity 3/3). Verified on the Rock: compact grid = 5 cols, 0 Resource
>   refs; standard still carries the 2556 Resource column.
> - **Payload 3.85.0 → 3.85.1** (deliberate patch). Rock rebuilt; `next build` clean on Node 22.
> - New gate `app/scripts/format2-check.ts` (7/7). Rock now on **`0fb1cc3`**. See `docs/DECISIONS.md`
>   (three 2026-06-13 entries). **Dev caveat:** `payload generate:*` CLIs break on local Node 25
>   (bundled tsx 4.22.4); fine on the Rock's Node 22.
>
> **Status:** Phases 0–**4 are DONE**. **Phase 4 (end-to-end DB round-trip) is PROVEN on the
> Rock: 3/3 content-identical** — seed taxonomy → ingest `bio_1_4` → 1.0.0 draft (id 33) →
> publish → generate → diff vs approved (LessonSequence 381 blocks, FinalExplanation 52,
> SummaryTable 37; Resource column excluded). The architecture is validated end to end. Rock is
> on **`afd6f80`+** (the `drop_subject_slug` migration is applied; SG compound-index + media-drop
> already live). Gates green: **ingest 18/18, fidelity 3/3, adapter 5/5, lint 0 / tsc 0**. See
> `docs/DECISIONS.md` (2026-06-09 Phase-4 entry) for the bugs fixed + mechanics.
>
> **Versioning note (NOT a bug — corrected):** the 1.0.0 → 1.0.2 was TWO publishes (admin UI +
> scripted), one bump per publish — expected. Minor optional refinement: skip the semver bump on
> a *no-op* publish (only `_status` changes). Next up: §5 editor/preview, §9 export, bulk-ingest
> the corpus, and a repeatable round-trip regression. See DECISIONS (Phase-4 entry).

## What got done this session (Phase 3 — safe ingest, SPEC §7)

Safe static extraction of ARES `.js` data modules → stored bundles created as **1.0.0
drafts** via the Local API. Dev-only CLI; never teacher-facing; the `.js` is **parsed, never
executed**. New code under `app/src/ingest/` + one collection hook + a shared phase vocab.

- **`app/src/ingest/extract.ts` — the security-critical core.** `acorn` AST parse +
  `literalToJson` that evaluates ONLY pure data literals (string/number/bool/null/array/
  object, unary ± on numbers, zero-expression template literals) and **rejects** everything
  executable/dynamic via a `default`-throw (calls, identifier refs in data, member access,
  templates-with-`${}`, spread, getters, `__proto__` keys — at BOTH the object and the
  `module.exports` layer). No `require`/`vm`/`eval`/`Function`. `acorn@8.16.0` promoted to an
  exact direct dep (`npm install --package-lock-only` — one-line lock diff).
- **`app/src/ingest/toBundle.ts`** — inverse of the Phase-2 adapter (UPPERCASE groups →
  camelCase `meta/unit/lessons/finalExplanation/summaryTable`); derives `title` from
  `META.titleDoc`. Inner keys already match verbatim.
- **`app/src/ingest/validateGeneratable.ts` — the completeness gate (task 3).** Pure,
  single-source-of-truth. HARD checks (grounded in the generator's unguarded dereferences in
  `vendor/lib/sections.js`): META present; each lesson has `slo` + `summaryTablePrompt` + ≥1
  framework phase; every `phase` ∈ vocab. Plus **`deliverableWarnings()`** — FE ≥1 section /
  ST ≥1 lesson row — as **WARN-ONLY** (see the FE/ST decision below).
- **`app/src/hooks/generatable.ts` (`enforceGeneratable`, `beforeValidate`)** — native
  Payload publish-time gate: throws a `ValidationError` (surfaces in the admin UI) when a
  write would be **published** but isn't generatable. Drafts may be incomplete WIP.
- **`app/src/ingest/index.ts`** — orchestration: read-only **pre-flight** (extract + validate
  + resolve taxonomy for ALL files, report every problem before any write), then writes in
  **one all-or-nothing transaction**. SubjectGrade resolved by **exact `(Subject.name,
  grade)` match**, **require-existing, fail loud** (no auto-create / no `--seed`).
- **`app/scripts/ingest.ts`** — CLI (`payload run scripts/ingest.ts -- <file|dir> …`), prints
  per-file results + non-blocking deliverable warnings.
- **`LessonBundles.ts`** — wired `enforceGeneratable` (beforeValidate); `minRows: 1` on
  `lessons` + `framework` (native ≥1, skipped on drafts); extracted phase vocab to
  `app/src/fields/phases.ts` (shared by the select + the validator).
- **GATE `app/scripts/ingest-extract-check.ts` (DB-less, 16/16).** Parity (extract ==
  `require`, execution used ONLY as the test oracle), a non-execution canary, nine adversarial
  rejects, completeness + deliverable-warning assertions. All three DB-less gates now honor an
  **`ARES_DEMO_PATH`** env override (defaults to `~/Desktop/ares-docx-fidelity-demo`) for CI
  portability.

## Decisions locked this session (see `docs/DECISIONS.md` 2026-06-09)

- **Ingest = dev-only CLI, never teacher-facing, parse-never-execute.** SPEC §9 upload
  endpoint stays deferred.
- **SubjectGrade: exact-match, require-existing, fail-loud (no `--seed`).** Keeps the curated
  junction-entity list clean. Seed taxonomy (Subject + SubjectGrade) before ingesting.
- **Ingested 1.0.0 is a DRAFT.** An administrator reviews & publishes to make it official /
  exportable. Teachers never upload and never publish.
- **FE/ST deliverable contract = WARN-ONLY for now.** SPEC §3 says "three documents per
  bundle," but the adapter/generator skip empty FE/ST. Rather than hard-gate (which might
  reject legitimately FE/ST-less sub-strands) or silently allow, FE/ST presence is a
  **non-blocking ingest warning** until the full corpus is confirmed to always carry all
  three — **then promote `deliverableWarnings` into the hard gate.** SPEC §3 stays the target.
- **`security-review` clean; Codex/CodeRabbit findings triaged + fixed** (export-layer
  `__proto__` guard, `ARES_DEMO_PATH` portability, type-hygiene cast, stale-doc note).

## Phase 4 — DONE (bio_1_4 DB round-trip, 3/3 on the Rock)

Proven this session: seeded Biology G10 + Mathematics G10 → `ingest.ts` bio_1_4 → 1.0.0 draft
(id 33) → `publish-bundle.ts` → `generate-bundle.ts` into a bind-mounted `/srv/lesson3/out` →
pulled the DOCX to the Mac → `compareDoc` vs approved = **3/3 content-identical**. Bugs found +
fixed (the `payload run` silent no-op) are in DECISIONS. Bundle 33 is published on the Rock.

## Next priorities

1. ~~**Repeatable round-trip regression.**~~ **DONE 2026-06-17** — `scripts/roundtrip-regression.ts`,
   3/3 on the Rock, self-cleaning. See the SHIPPED note above + DECISIONS.
2. **§5 editor refinements** — **code-complete 2026-06-17** (live-unsaved preview + teacher
   Standard/Compact toggle + array row labels; see the SHIPPED note above). **Pending Rock
   functional verify** (`up -d --build`). Still open after that lands: deeper edit-screen
   ergonomics (tabs/collapsible grouping of the big nested structure) if wanted; the unverified
   edge case (non-readable draft → 404 for a Teacher — proven by the access rule, not yet clicked).
3. **PDF export** (§9) — constraints locked (offline/free/faithful → local office engine via a
   swappable `docxToPdf(buffer)` seam, Jobs Queue, golden-file fidelity test to pick the engine).
   This is also the **faithful on-screen layout/colour view** (the HTML preview is content-only by
   design — see the column-width decision in DECISIONS 2026-06-16). See DECISIONS 2026-06-14.
4. **Cross-user App features** (§10): email-a-doc, internal messaging + notifications, translation
   (Swahili), AI. The unified App now has browse → view → preview → export.
5. **(Minor, optional) Skip the semver bump on a no-op publish** — currently any `update` bumps
   semver. Not a bug; do only if "mark official without editing shouldn't bump" is wanted.

**Production-readiness backlog (Codex 2026-06-16/-17, NOT done — the Rock is non-production):**
rate-limit / Jobs-Queue for generation incl. the preview POST (#2); FE/ST hard gate once corpus
complete (#6); official-version model vs SPEC §6 (#7); dep advisories — vitest/postcss/esbuild (#3);
global security headers + CSRF posture, incl. a **CSP on the teacher frontend route** (#9/#10);
**XSS: sanitize `docxToSections` output when Resource links land (#4)**; **optimistic concurrency —
check `lockVersion` on user updates, not just increment it (#4-conc)**; **add HTTP int tests for the
preview POST** (Teacher→404, Editor structural→422, oversize→413; needs an auth+role fixture harness
the current `tests/int/api.int.spec.ts` lacks).

**Phase 2+ — "The App" (decided 2026-06-14, see SPEC §2/§10 + DECISIONS):** a unified role-aware
frontend (`app/src/app/(frontend)`) that ALL roles log into, over the same Payload backend, home to
the cross-user features (browse/view/export, email-a-doc, messaging+notifications, translation, AI).
`/admin` stays the editing/admin back-office. Teachers live only in The App (no `/admin`) — so a
Teacher login has no surface until it's built. Recommended first slice: teacher browse → view →
export. Sample logins: `app/scripts/seed-users.ts` (Teacher/Editor/Subject-Admin).

**Watch-outs:**
- **Running scripts on the Rock:** deps image + bind-mount means a *script-only* change is
  `git pull` + re-run (no rebuild). Generated DOCX MUST go to a bind-mounted host dir
  (`-v /srv/lesson3/out:/out`) or they vanish with `--rm`. Any `payload run` script must
  **top-level-await** its work (see the Phase-4 bug in DECISIONS).
- **Math META differs** (`col3Label`/`col5Label` = "Teacher Actions"/"Assessment Strategy";
  single-quoted/identifier-key JS syntax) — the acorn extractor handles it; carried through
  verbatim. Math SubjectGrade (Mathematics G10) is already seeded.

## Open items / pending

- **Resource column — sourcing from ARES (decided 2026-06-09).** The blank Resource column is a
  fidelity issue; the resolved per-lesson resources (video + reading: `title/source/direct_url?/
  search_url`) live only in the Python recommender's output, not our data. Plan: get that data
  FROM ARES (embedded in the `.js` or a side JSON), carry via `framework[].resources`, render via
  the shim. **Blocked on ARES providing it.** Our-side prep when it arrives: add `source` to the
  resource schema (migration), rewire `vendor/aresResources.js` to render stored resources. See
  the DECISIONS entry for the full contract. (Bundle the resource ask with the message below.)
- **ARES confirmation message** — awaiting Mark's reply on which data/DOCX are canonical, AND the
  resource-data request above. Not blocking core work (we have `bio_1_4`).
- Fork's `origin` is stale at `212da91`; we read newer commits from `upstream`. Pin is by SHA
  + mirror tag, so this doesn't affect us.
- **FE/ST hard-gate promotion** (see above) — gated on the corpus check.
- `test:int` + `next build` need a DB (Rock only); not run locally.

## Assets (verified — read these, don't trust memory)

- **Stakeholder-approved matched set** on `~/Desktop/ares-docx-fidelity-demo/`: `bio_1_4_data.js`
  + the three approved DOCX (`Biology_Chemicals_of_Life_*`). The trusted Phase-1 oracle. (Set
  `ARES_DEMO_PATH` to point the DB-less gates elsewhere on CI / the Rock.)
- **The generator repo corpus** at SHA `529be40` (`~/Documents/GitHub/cbe-generation-system`,
  on `upstream`):
  - `generators/data/` — 13 data files: 10 Biology sub-strands + Math 2.2/2.3/2.4.
  - `data/outputs/docx/` — all-three DOCX for every Biology sub-strand (1.1–3.3) + Math
    2.2/2.3/2.4 (likely generator self-output → determinism/regression breadth, not necessarily
    independent oracles — pending Mark's confirmation).
  - `cbe-migration-bundle/generated-content/` — a curated hand-off set (Bio 1.1/1.3/1.4/2.1 +
    Math 2.2/2.3/2.4).
  - `data/raw/CBE LESSON TEMPLATES/` — original human-authored Scheme-of-Work templates.
  - **No `*_data.js` for Chemistry/Physics yet** (only raw templates + some reformatted output).
- Generator entry: `generators/lib/build_docs.js` exports `buildSoW`/`buildFinalExplanation`/
  `buildSummaryTable` (each returns a `docx` `Document`) + `run(dataModule)` (disk-writer, unused).

## Rock deploy / schema-change workflow (LEARNED — read before touching the schema)

Phase 4 adds DATA, not schema — so the simple path is `git pull` + `docker compose up -d
--build`. The full migration workflow (for the next *schema* change) — the migration generator
has real gotchas; these are the working commands (see DECISIONS):
1. `git pull` on the Rock (`/srv/lesson3`, login `david@rock5b`).
2. **Regenerate types FIRST** after any field/collection change, or `next build` fails the
   type-check. Run via the deps image with the source bind-mounted (image's node_modules
   preserved by an anon volume):
   ```
   docker build --target deps -t lesson3-deps ./app
   docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app --env-file .env \
     lesson3-deps npx payload generate:types
   ```
   Commit the regenerated `app/src/payload-types.ts`.
3. **Generate the migration with a bind mount + the compose network** (a plain
   `docker compose run --rm migrate migrate:create` writes the file INSIDE the ephemeral
   container and loses it; it also needs DB access for the schema diff):
   ```
   docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
     -w /app --env-file .env lesson3-deps npx payload migrate:create <name>
   ```
   Review the generated SQL (make `up` idempotent — `IF EXISTS`/`IF NOT EXISTS`; see the
   2026-06-09 migration-gen-quirk lesson), commit `app/src/migrations/*`.
4. **Deploy:** `docker compose up -d --build` — the one-shot `migrate` service applies pending
   migrations before `app` starts.
5. **Verify:** run `verify-rbac.ts` (or the Phase-4 round-trip script) via the same deps-image
   + bind-mount + `--network` line (so it uses the latest source without an app rebuild).
