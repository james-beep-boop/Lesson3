# Start-here for the next session — Phase 3: safe `.js → JSON` ingest (SPEC §7)

> **Status:** Phase 0 (vendor generator) + Phase 1 (fidelity proof, 3/3) are **MERGED to
> `main`** (merge `3751412`). **Phase 2 (generator integration) is DONE on
> `feat/generator-ingest`, GATE 5/5** (not yet committed/pushed at handoff — see "Phase 2 done"
> below). **The Rock still runs the previous `main`** — everything since is code-only (no schema
> change yet), so a deploy remains optional/deferred.

## What got done this session (Phase 2 — generator integration, SPEC §4)

- **Adapter** `app/src/generator/adapter.ts`: `bundleToAresData(bundle)` — renames the 5
  top-level groups, deep-strips Payload row `id`, `null`→`''`, drops empty
  `resources`/`FINAL_EXPLANATION`/`SUMMARY_TABLE`. Inner keys pass through verbatim. (Generator
  never reads `framework[].resources` — Resource column comes from the absent Python module.)
- **Validity-gated core** `app/src/generator/generateForBundle.ts`: `generateForBundle(payload,
  id)` loads the published snapshot + `assertExportable` (refuses non-`published` →
  `NotExportableError`) + adapter + `generateBundleDocx`. Gate lives in the **shared core** so
  every path enforces it; the future §9 endpoint just adds READ access. CLI script
  `app/scripts/generate-bundle.ts` (`payload run`) for now.
- **Phase-2 GATE** `app/scripts/adapter-fidelity.ts` (**5/5**, DB-less): simulates a stored
  Payload bundle from `bio_1_4_data.js` → real adapter + generator → diff vs approved (proves
  bundle→DOCX by transitivity). Diff helpers extracted to `app/scripts/lib/docxDiff.ts`;
  Phase-1 gate refactored to import them, still **3/3**. `tsc` clean (bar the pre-existing
  `@types/jsdom` script-tooling note); `eslint` clean.
- **Decisions recorded** in `docs/DECISIONS.md` (2026-06-08 Phase 2 entry).

## What got done last session (Phase 0 + Phase 1)

- **Vendored the ARES generator, pristine.** `build_docs.js`, `sections.js`, `docx_kit.js`
  copied **byte-verbatim** into `app/src/generator/vendor/lib/` at pinned SHA
  **`529be40`** (`markknit/cbe-generation-system`, branch `claude/setup-cbe-generation-ZKiIi`;
  mirror tag `lesson3-vendor-529be40` on the `james-beep-boop` fork). `vendor/package.json`
  marks the dir CommonJS (app is ESM); `vendor/PROVENANCE.md` + `docs/EXTERNAL-DEPENDENCIES.md`
  hold provenance; `scripts/vendor-generator.sh` does one-command re-sync. Pinned `docx@9.6.1`
  exact + `mammoth@1.12.0` (devDep).
- **Upstream `aresResources.js` (Python) NOT vendored.** Phase 0 relied on `sections.js`'s
  `(ARES resources unavailable)` fallback; **Phase 2 replaced that** with a Lesson3-authored
  pure-Node shim at `vendor/aresResources.js` so the Resource column renders **blank** (not the
  placeholder), structure preserved, zero live Python. See DECISIONS 2026-06-08 + PROVENANCE.md.
- **In-process generate wrapper** `app/src/generator/index.ts`: imports the three builders via
  `createRequire`, returns `{ lessonSequence, finalExplanation, summaryTable }` Buffers. No
  disk, no Python, no edits to vendored code. (`run()` is NOT used — the builders return
  `docx` Documents; we `Packer.toBuffer()` them.)
- **Fidelity harness + GATE** `app/scripts/fidelity-spike.ts`: regenerates the three `bio_1_4`
  DOCX and diffs vs the approved set (mammoth→HTML→jsdom, block-level), excluding the Section-C
  Resource column → **3/3 content-identical**. Negative control proves the harness is sensitive
  (exactly 30 resource-only diffs when unstripped). This is the seed of the regression suite.

## Decisions locked last session (see `docs/DECISIONS.md` 2026-06-08)

- **Resources DEFERRED; recommender out of scope** (not live, not at ingest). Within SPEC
  (already optional). The optional `framework[].resources` field is **retained** as the future
  seam (links to be sourced from ARES-produced documents later, not the live recommender).
  SPEC §3/§4 nudged UNDETERMINED→DEFERRED.
- **Generation gated to published/official versions only** (drafts relax required-field
  validation → an invalid draft snapshot must never be exported). Recorded; **build it in
  Phase 2.**
- **Offline-priority reframing FLAGGED, not yet done.** User's audience analysis (A: ~10–60
  schools w/ ARES server; B: hundreds online; C: thousands offline = the largest) suggests the
  *exported documents* standing alone offline is the majority case. SPEC line 25 still calls
  offline "secondary." Revisit in a deliberate SPEC pass once audience numbers firm up.

## Open items / pending

- **Commit Phase 2** on `feat/generator-ingest` (adapter + generateForBundle + scripts + docs),
  then push & merge `feat/generator-ingest` when ready (nothing pushed yet).
- **ARES confirmation message drafted** (in an earlier transcript) — awaiting Mark's reply on
  which data/DOCX are canonical. Not blocking (we have `bio_1_4`).
- Fork's `origin` is stale at `212da91`; we read newer commits from `upstream`. Pin is by SHA
  + mirror tag, so this doesn't affect us.
- **Phase 4 will need a DB round-trip** (the Phase-2 gate is DB-less by design). Reuse
  `app/scripts/lib/docxDiff.ts` + `generateForBundle`: ingest → stored 1.0.0 → published →
  `generateForBundle` → diff vs approved; verify on the Rock.

## This session: Phase 3 — safe `.js → JSON` ingest (SPEC §7)

Suggested branch: continue on `feat/generator-ingest`.

> Opening message: Read `SPEC.md` (§3/§7), `CLAUDE.md`, `docs/DECISIONS.md`, and this file.
> Phases 0–2 are done on `feat/generator-ingest` (generator vendored at `529be40`; Phase-1 gate
> 3/3; Phase-2 adapter + validity-gated generate core, gate 5/5). Build Phase 3: safe static
> extraction of ARES `.js` data modules → bundle created as 1.0.0 via the Local API. Use the
> `payload` skill; trust installed source over memory.

**Phase 3 tasks (ingest, §7):**
1. **Safe `.js → JSON` extraction that NEVER `require()`s/executes the module** (RCE). Static
   parse only (e.g. an AST/`acorn` walk of the `module.exports = { … }` object literal). ARES's
   `extract_generator_data.py` is the conceptual model. The shape it must emit maps 1:1 onto the
   stored bundle (camelCase top-level groups; inner keys already match — see the Phase-2 adapter
   for the exact field set).
2. **Create the bundle as `1.0.0` via the Payload Local API in a transaction** (trusted system
   call — `enforceBundleStructure` already treats `!req.user` as system/overrideAccess). Bulk
   ingest supported. Validate against the schema on ingest (same rules as §5).
3. **Generator-completeness validation (the export-correctness gate Codex flagged).** Schema-
   required fields (`title`/`subjectGrade`/`framework[].phase`) + publish status are NOT enough:
   the generator dereferences groups the schema leaves optional — a lesson without `slo` crashes
   with `Cannot read properties of undefined (reading 'purpose')`. The Phase-2 adapter guarantees
   *type*-safety (array slots stay arrays) but deliberately does NOT fabricate missing groups —
   that is invalid content to **reject at ingest/publish**, not silently render. Add a
   `validateGeneratable(bundle)` (groups present: `slo`/`summaryTablePrompt`/`meta`; each lesson
   has ≥1 framework phase; phase ∈ vocab) and run it on ingest + before publish. Export then
   trusts validated-in data.
4. **`security-review` the extraction** — this is the highest-risk surface (untrusted input).

**Watch-outs:**
- **Never execute uploaded `.js`** — the whole point. No `require`, no `vm`, no `eval`.
- `framework[].phase` is a controlled vocabulary — `bio_1_4`'s 5 phases match `docx_kit.js`'s
  colour-map keys (verified). Mathematics shares the same 5 phases but different META labels
  (`col3Label`/`col5Label` "Teacher Actions"/"Assessment Strategy") — carry META through.
- Resources are DEFERRED: ingest carries `framework[].resources` through if ever present, else
  omits it (the Phase-2 adapter already tolerates either).

**Then Phase 4 (end-to-end + Rock verification)** — ingest → stored 1.0.0 → publish →
`generateForBundle` → diff vs approved (DB round-trip); wire as a repeatable regression check;
verify on the Rock (see the deploy workflow below).

## Assets (verified — read these, don't trust memory)

- **Stakeholder-approved matched set** on `~/Desktop/ares-docx-fidelity-demo/`: `bio_1_4_data.js`
  + the three approved DOCX (`Biology_Chemicals_of_Life_*`). This is the trusted Phase-1 oracle.
- **The generator repo itself now contains a large corpus** at SHA `529be40`
  (`~/Documents/GitHub/cbe-generation-system`, on `upstream`):
  - `generators/data/` — 13 data files: 10 Biology sub-strands + Math 2.2/2.3/2.4.
  - `data/outputs/docx/` — all-three DOCX for every Biology sub-strand (1.1–3.3) + Math
    2.2/2.3/2.4 (likely generator self-output → determinism/regression breadth, not necessarily
    independent oracles — pending Mark's confirmation).
  - `cbe-migration-bundle/generated-content/` — a curated set that looks purpose-built as a
    hand-off (Bio 1.1/1.3/1.4/2.1 + Math 2.2/2.3/2.4).
  - `data/raw/CBE LESSON TEMPLATES/` — the original human-authored Scheme-of-Work templates
    (Biology, Chemistry, Math, Physics).
  - **No `*_data.js` for Chemistry/Physics yet** (only raw templates + some reformatted output).
- Generator entry: `generators/lib/build_docs.js` exports `buildSoW`/`buildFinalExplanation`/
  `buildSummaryTable` (each returns a `docx` `Document`) + `run(dataModule)` (disk-writer, unused).

## Rock deploy / schema-change workflow (LEARNED — read before touching the schema)

The migration generation has real gotchas; these are the working commands (see DECISIONS):
1. `git pull` on the Rock (`/srv/lesson3`, login `david@rock5b`).
2. **Regenerate types FIRST** after any field/collection change, or `next build` fails the
   type-check (the generated `LessonBundle` type won't know the new fields). Run via the
   deps image with the source bind-mounted (image's node_modules preserved by an anon volume):
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
   Review the generated SQL, commit `app/src/migrations/*`.
4. **Deploy:** `docker compose up -d --build` — the one-shot `migrate` service applies pending
   migrations before `app` starts.
5. **Verify:** run `verify-rbac.ts` via the same deps-image + bind-mount + `--network` line
   (so it uses the latest source without an app rebuild).
