# Design — Stage 1: adopt upstream's 2026-10-04 generator (student/teacher split, attribution, tables, null wording)

**Status: IMPLEMENTED 2026-10-07** (branch `feat/generator-upgrade-teacher-key`). This document is the plan as
approved; the record of what happened, including three review findings and two production-only failures found
along the way, is `docs/DECISIONS.md` 2026-10-07 ("Generator re-pinned to upstream `6591146`"). Where the build
differed from the plan:
- The bridge selects upstream's stored-links path (`DB_PATH` that cannot exist) as planned, but the attribution
  config path is **not** left to the vendored default: bundled `__dirname` is a build-time `/ROOT/…` placeholder
  that does not exist in the production image, so `generator/index.ts` sets `ATTRIBUTION_YAML` from `process.cwd()`.
- The vendored code is **bundled** into the server chunks, so the Dockerfile check only proves the config file
  shipped; the behavioural proof is `tests/http/teacherKey.http.spec.ts` against the running image.
- The on-page and compare "Final Explanation" section is built from the **teacher** document (the compare grouping
  classifies by table shape), and a field holding a table is not linkified (the table wins over a link).
- `js-yaml` became a direct pinned dependency; `ATTRIBUTION_YAML` is classified as vendored-internal in the env
  parity test.
- Not done: the optional same-engine render-version 6-vs-7 PDF page-count comparison. Per `CLAUDE.md` this is the plan to
approve before editing. Companion decisions are recorded at the end; stage 2 (summary-table editing)
is a separate PR and is out of scope here.

## 1. Why, and what is true today

Lesson3 vendors three files from `markknit/cbe-generation-system` pinned at `a546ee3` (2026-09-19).
Upstream is 41 commits ahead. Verified by reading upstream and diffing against our vendored files:

- `docx_kit.js` is byte-identical. `build_docs.js` (4 commits) and `sections.js` (1 commit) changed.
- The JSON contract is **unchanged** (upstream `PARTNER_CONTRACT_NOTES.md`). Lesson prose keeps being
  regenerated upstream; that arrives through normal re-ingest as new major versions (SPEC §7).
- **The live defect this fixes:** our single "Final Explanation" document is titled *Student Assessment
  Document* but prints the **exemplar answers** beside each prompt. Upstream now emits a student
  document (blank answer space) and a separate teacher key.
- It is **not a drop-in re-vendor.** New `build_docs.js` requires a fourth file (`lib/attribution.js`,
  which reads `config/attribution.yaml` with `js-yaml`) and imports `takeDiagnostics` from the resources
  module; new `sections.js` imports `DB_PATH` from it. Our bridge (`vendor/aresResources.js`, Lesson3-owned)
  exports neither, so a naive re-vendor throws in `buildSoW`.

## 2. Decisions already made (do not reopen)

| Decision | Source |
|---|---|
| Lesson-plan rights are CC BY-NC 4.0, as upstream states; adopt Mark's attribution wording **and placement**; the SPEC's "every page" line is deliberately superseded. | Operator, 2026-10-06 |
| Teacher key is visible to **everyone who can already read and export the plan**. | Operator, 2026-10-06 |
| Email-a-doc keeps sending the **whole zip, key included**. | Operator, 2026-10-06 |
| **One PR.** The key and the student split must ship together — shipping the student-only document first would take the exemplar answers away from teachers. | Operator, 2026-10-06 |
| Summary-table preservation policy = **keep existing versions as stored; derive only in new imports.** (Stage 2.) | Operator, 2026-10-06 |
| **Copyright year fixed at `2026`** for this generator release (see §4.3 for how it is described). | Operator, 2026-10-07 |
| **Pin = latest upstream at implementation start**, reviewed before the exact SHA is frozen. | Operator, 2026-10-07 |
| **Fresh separate clone** for vendoring and the oracle; the existing checkout stays untouched. | Operator, 2026-10-07 |

## 3. Scope

**In:** re-vendor pinned commit (4 files); bridge fix; attribution config + `js-yaml`; fourth deliverable
"Teacher key" through generator, export, preview, cache, zip, email, UI; Final Explanation table
rendering; upstream's null-slot wording; `GENERATOR_RENDER_VERSION` 6 → 7; fidelity oracle refresh; SPEC /
DECISIONS / CHANGELOG / PROVENANCE / guide updates; tests.

**Out (separate decisions):** derived summary table and its editing UI (stage 2); partial-match link
labels (need judge diagnostics outside the JSON); surfacing `needs_review`; quiz files; any public-library
work.

## 4. Design

### 4.1 Re-vendor
- Pin a **specific upstream SHA, reviewed before it is frozen.** Upstream HEAD on 2026-10-07 is
  `6591146` (2026-10-06, a teacher-review-handout builder); it changed nothing under `generators/` or
  `config/attribution.yaml` since `9f2f25b`, and the lib files have not changed since `69f3583`, so the
  bytes analysed here are the bytes that would be vendored. **Re-diff at the start** — upstream moves
  daily. The **same pin** is used for the four lib files, `attribution.yaml` and the reference DOCX.
  Record it; do not track `main`.
- `scripts/vendor-generator.sh` currently copies three files; add `attribution.js`. All four stay
  **byte-pristine** (SHA-256 table in `PROVENANCE.md`).
- Obtain upstream in a **fresh separate clone** at the pin. The existing clone at
  `~/Documents/GitHub/cbe-generation-system` is a stale fork checkout (65 behind `upstream/main`, one
  local commit, an uncommitted deletion) and must not be modified.

### 4.2 Resource bridge (Lesson3-owned `vendor/aresResources.js`)
- Export a `DB_PATH` that **cannot exist**, so the new `sectionC` takes its stored-links branch
  (`lesson.resourceLinks`) instead of calling `getAllPhaseResources`.
- Export a no-op `takeDiagnostics()` returning `[]`.
- The positional one-call-per-lesson queue and its count guards become dead. Replace them with a
  guard that proves the property that actually matters: **every lesson's stored links reach the
  rendered output** (an unavailable/empty path must fail loudly, never blank the Resource column).
- `buildResourceParagraphs`: adopt upstream's exact null wording —
  `No closely matching ${kind} in the ARES library for this activity.` (italic) plus
  `🔍 Search ARES for ${kind}s`. Keep our safe-URL filtering.
- **Accept upstream's per-lesson `console.warn`** on this branch (about one line per lesson on a cold
  render; cached exports do not re-render). Do **not** suppress it by temporarily replacing the global
  `console.warn`: concurrent exports would interfere with each other's logging. Revisit only if it can be
  silenced without touching global state.
- **Why the stored-links branch and not the old positional queue:** it is upstream's own supported path
  for rendering without a resource database, and it removes our order-dependence (the queue could only
  prove call *count*, never call *order*).

### 4.3 Attribution
- Vendor upstream's `config/attribution.yaml`; read by the pristine `attribution.js` via `js-yaml`.
- **`js-yaml` becomes a direct, pinned dependency** (today it is only a transitive dependency of
  Payload's `json-schema-to-typescript`).
- **Do not trust Next's file tracing** to ship the yaml or `js-yaml` into the standalone image: set
  `ATTRIBUTION_YAML` to an absolute path from `generator/index.ts` and add an
  `outputFileTracingIncludes` entry. Proof is in the Docker image (§6), not in dev.
- **Copyright year (resolved).** Upstream's `year: auto` stamps the *render-time* year, so the
  same immutable snapshot re-rendered in 2027 would produce different bytes — contradicting the
  byte-stability contract (`renderVersion.ts`). **Decided:** a Lesson3-owned copy of the yaml with a
  **fixed** `year: 2026`, text otherwise verbatim, the deviation recorded in `PROVENANCE.md`. Described
  everywhere as **the configured copyright year for this generator release** — not as the date any
  particular lesson was first published, and not a claim about future lessons. Changing it later is a
  deliberate act that **accompanies a `GENERATOR_RENDER_VERSION` bump**.

### 4.4 Teacher key as a fourth deliverable
- `DELIVERABLE_TAGS` gains a fourth tag; filename stem `…_FinalExplanation_TeacherKey` (upstream's name);
  student document keeps `…_FinalExplanation` (its **content changes**: no exemplars).
- `generateFinalExplanationDocx(data, mode)`; `generateBundleDocx` returns both; `generateDeliverableDocx`
  and `previewBundle` dispatch on the new tag. A bundle with no final explanation produces **neither**
  FE document (already guarded upstream and in our generator).
- Export zip, per-document download, readiness manifest, PDF conversion (Gotenberg) and email all
  enumerate deliverables from one list, so the key flows through by construction; verify rather than assume.
- Labels: "Final explanation" (student) and **"Teacher key — not for students"**. The document itself
  already carries "do not give to students".
- `GENERATOR_RENDER_VERSION` 6 → 7 invalidates every cached zip, PDF and preview.

### 4.5 Final Explanation tables
- Pipe tables inside FE strings render as real nested tables (upstream `richCell`). Editing stays
  **plain strings**; SPEC §4's "no inline markup" is amended to name exactly this syntax (pipe rows,
  separator row ignored). No new editing UI.

## 5. File inventory (approx.)

Vendor/bridge: `scripts/vendor-generator.sh`, `vendor/lib/{build_docs,sections,attribution}.js`,
`vendor/config/attribution.yaml`, `vendor/aresResources.js`, `vendor/PROVENANCE.md`.
Generator: `generator/{index,adapter,exportArtifacts,deliverables,previewBundle,renderVersion}.ts`.
Endpoints: `endpoints/{parseFormat,exportVersion,previewVersion}.ts`.
UI: `lessons/[id]/{ShareMenu,page}.tsx`, `components/{DocButtons,DocStrip}.tsx`,
`components/LessonControls/index.tsx`, `lib/substrand.ts`.
Config/deps: `next.config.ts`, `package.json` + lockfile.
Tests/scripts: `scripts/fidelity-spike.ts`, `scripts/adapter-fidelity.ts`, plus those under §6.
Docs: `SPEC.md` (§4 attribution + table grammar, deliverables list), `docs/DECISIONS.md`,
`docs/CHANGELOG.md`, `USER_GUIDE.md` and `/guide` (they list the documents; parity tests apply).

## 6. Verification — "done" means all of these

1. **Unit:** student FE contains no exemplar text and keeps the name/date lines; teacher key contains
   exemplars and none of the name lines; attribution block present in **all four** deliverables (lesson sequence, student final explanation,
   teacher key, summary table) and the short footer after **every** lesson; null slot prints upstream's wording; a pipe table in an exemplar
   renders as a nested `w:tbl`; updated `generatorGrade`, `deliverables` and bridge specs; a new test
   that `PROVENANCE.md`'s hash table matches the vendored bytes.
2. **DOCX fidelity (authoritative; not in CI — needs the oracle):** refresh `fidelity-spike.ts` and
   `adapter-fidelity.ts` against **upstream's own committed DOCX at the pinned SHA** and add the key to the
   approved set. The comparison keeps checking **resource text and URLs**. "No differences except the year"
   would be too strong, so the exceptions are enumerated and each carries a reason in the script:
   (a) the configured copyright year; (b) **"Related topic" partial-link label paragraphs** — upstream
   attaches judge diagnostics that live outside the JSON, so they appear in its DOCX and cannot be
   reproduced from an import; choose an oracle sub-strand free of them, or exclude exactly those paragraphs
   by an explicit list. Any other difference fails the gate until it is explained and added.
3. **Integration/HTTP:** zip lists exactly the four expected names for DOCX and PDF; per-document download
   of the key honours the existing 401/403/404 rules (**wire-level tests are required** by `CLAUDE.md`);
   the emailed zip contains the key; a single-document sub-strand has no key; cached v6 artifacts are
   not served after the bump.
4. **Standalone image:** CI's Stack-up + `test:http` export a real DOCX from the production image; add an
   assertion that the exported DOCX contains the attribution text, so a missing yaml or `js-yaml` fails
   there, not on the Rock.
5. **Gates:** unit, lint, format, type-check, `test:int`, `test:http`, Playwright, `audit:prod` — all green
   in CI; re-run the audit immediately before merge (it moves).
6. **PDF: visual inspection, because the automated PDF gate is retired.** `pdf-fidelity-check.ts` was
   deleted on 2026-07-20 (DECISIONS 2026-07-20: cross-engine pixel comparison is not valid and its parser
   was broken); **DOCX is the authoritative layout deliverable and is gated.** There is therefore no
   pagination gate to find. Before merge, convert and **open** representative PDFs and check: student final
   explanation (answer-space height, ruled area, table layout), teacher key (nested table layout, long
   exemplars), lesson sequence (attribution block after the overview, footer after every lesson, no orphaned
   footer on a page by itself), summary table (attribution at the end). Record what was inspected and the
   result in DECISIONS. Optional and cheap: a **same-engine** comparison — our own Gotenberg output for the
   same stored snapshot at render version 6 vs 7 — to see page-count shifts. **Also fix the stale SPEC line**
   (§4, "reruns the DOCX/PDF fidelity and pagination gates") in this PR so it stops instructing anyone to
   run a deleted gate.

## 7. Risks

- **Cold cache after deploy.** Every version regenerates on first request (PDFs go through Gotenberg).
  Pre-warm exists only at ingest. Consider a one-off warm-up for the Official versions, or accept the
  first-view latency.
- **Page counts change** (attribution blocks; the student document reserves answer space), so teachers'
  printed layouts will differ. Expected, but call it out in the changelog.
- **Standalone tracing** of the yaml/`js-yaml` is the likeliest dev-vs-production surprise — §4.3, §6.4.
- **Wider access than it sounds.** "Everyone who can read" includes the emailed zip: a teacher can send the
  key to any address. Accepted by the operator; the labelling is the mitigation.

## 8. Rollout and rollback

Merge → `scripts/deploy.sh` on the Rock → check: upload still works, export a DOCX **and** a PDF and open
the student document and the key, confirm attribution text, send one real email. Rollback = revert the
merge and redeploy; cache keys include the render version, so pre-upgrade artifacts remain valid if not
purged. No database migration is involved.

## 9. Operator answers (2026-10-07)

1. **Copyright year:** fixed `2026`, described as the configured year for this release. **Yes.**
2. **Pin:** latest upstream at the start, reviewed before freezing the SHA. **Yes.**
3. **Oracle clone:** separate fresh clone; the existing checkout is left alone. **Yes.**

Nothing remains open before implementation, except the one-line go-ahead to start.
