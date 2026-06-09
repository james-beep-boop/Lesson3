# Start-here for the next session — Phase 2: generator integration into Lesson3 (SPEC §4)

> **Status (MERGED to `main`, NOT yet deployed to the Rock):** Phase 0 (vendor the ARES
> generator) and Phase 1 (standalone fidelity proof) are **DONE, GATE passed 3/3**, and merged
> to `main` (merge commit `3751412`; also on branch `feat/generator-ingest`). **The Rock still
> runs the previous `main`** (scaffold + auth + sub-strand bundle + versioning) — Phase 0/1 is
> code-only (no schema change, generator not yet wired into the running app), so a deploy is
> optional and was intentionally deferred.

## What got done last session (Phase 0 + Phase 1)

- **Vendored the ARES generator, pristine.** `build_docs.js`, `sections.js`, `docx_kit.js`
  copied **byte-verbatim** into `app/src/generator/vendor/lib/` at pinned SHA
  **`529be40`** (`markknit/cbe-generation-system`, branch `claude/setup-cbe-generation-ZKiIi`;
  mirror tag `lesson3-vendor-529be40` on the `james-beep-boop` fork). `vendor/package.json`
  marks the dir CommonJS (app is ESM); `vendor/PROVENANCE.md` + `docs/EXTERNAL-DEPENDENCIES.md`
  hold provenance; `scripts/vendor-generator.sh` does one-command re-sync. Pinned `docx@9.6.1`
  exact + `mammoth@1.12.0` (devDep).
- **`aresResources.js` intentionally NOT vendored** → `sections.js` falls back to a no-op
  Resource column → guaranteed zero live Python (single-runtime). See DECISIONS 2026-06-08.
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

- **Push & merge `feat/generator-ingest`** when ready (nothing pushed yet).
- **ARES confirmation message drafted** (in last session's transcript) — awaiting Mark's reply
  on which data/DOCX are canonical. Not blocking Phase 2 (we have `bio_1_4`).
- Fork's `origin` is stale at `212da91`; we read newer commits from `upstream`. Pin is by SHA
  + mirror tag, so this doesn't affect us.

## This session: Phase 2 — generator integration into Lesson3 (SPEC §4)

Suggested branch: continue on `feat/generator-ingest`.

> Opening message: Read `SPEC.md` (§3/§4/§5), `CLAUDE.md`, `docs/DECISIONS.md`, and this file.
> Phase 0/1 are done on `feat/generator-ingest` (generator vendored at `529be40`, fidelity gate
> 3/3). Build Phase 2: the bundle→ARES adapter and an in-process generate path, gated to
> published/official versions. Use the `payload` skill; trust installed source over memory.

**Phase 2 tasks:**
1. **Adapter** `lesson-bundle doc → ARES data object`: `meta→META, unit→UNIT, lessons→LESSONS,
   finalExplanation→FINAL_EXPLANATION, summaryTable→SUMMARY_TABLE`. Strip Lesson3-only fields
   (`semver/bumpType/lockVersion/_status/id/createdAt/updatedAt`); keep `lessons[].number`;
   `framework[].resources` optional/empty. Inner keys already match ARES verbatim. (Confirm by
   round-tripping: stored `bio_1_4` bundle → adapter → generator → diff vs approved.)
2. **Expose generation** via a Payload custom endpoint (or a script for now — full export/
   sharing UI is §9, later). Reuse `app/src/generator/index.ts`.
3. **Validity gate:** restrict generation to **published/official** versions (decided). Validate
   the exact version before generating; refuse drafts. Decide where the check lives (endpoint
   access vs explicit validate call).

**Watch-outs:**
- `framework[].phase` is a controlled vocabulary — `bio_1_4`'s 5 phases match `docx_kit.js`'s
  colour-map keys (verified). Mathematics shares the same 5 phases but uses different
  `META.col3Label`/`col5Label` ("Teacher Actions"/"Assessment Strategy") — the adapter must
  pass META labels through.
- Aim for **content-identical** (the existing harness), not byte/zip identity.
- Single runtime: Node generator only; Python recommender never called live.

**Then Phase 3 (ingest, §7)** — safe `.js → JSON` static extraction that NEVER executes the
module (RCE); create the bundle as 1.0.0 via the Local API in a transaction (trusted system
call); `security-review` the extraction. **Phase 4 (end-to-end + Rock verification)** — ingest
→ stored 1.0.0 → adapter → generator → diff vs approved; wire as a repeatable regression check;
verify on the Rock.

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
