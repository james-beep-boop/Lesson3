# Start-here for the next session — Phase 4: end-to-end DB round-trip + Rock verification

> **Status:** Phases 0–3 are **DONE**. **Phase 3 (safe `.js → JSON` ingest, SPEC §7) is
> built and committed on `main`** (gates green: **ingest 18/18, fidelity 3/3, adapter 5/5,
> lint 0 / tsc 0**; Codex + CodeRabbit reviewed and triaged; `security-review` clean; the
> extractor folds `+` string concatenation so all 13 corpus files parse). The Rock is at
> `0096f7a` (SG compound-index + media-drop migration applied). **One pending migration** rides
> the next deploy: `20260609_170000_drop_subject_slug` (drops the unused `subjects.slug`
> scaffold column — safe, disposable data). Rock pickup = `git pull` + `docker compose up -d
> --build` (the one-shot `migrate` service applies it). **Phase 4 (DB round-trip) is next.**

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

## This session: Phase 4 — end-to-end DB round-trip + Rock verification

> Opening message: Read `SPEC.md`, `CLAUDE.md`, `docs/DECISIONS.md`, and this file. Phases
> 0–3 are done on `main`. Build Phase 4: prove the full pipeline against a real DB and verify
> on the Rock. Use the `payload` skill; trust installed source over memory.

**Phase 4 tasks (DB round-trip):**
1. **Seed taxonomy + ingest for real.** Create the needed Subjects + SubjectGrades (Biology
   G10 at minimum), then `payload run scripts/ingest.ts -- <bio_1_4_data.js>` → a stored 1.0.0
   draft. Confirm the draft is NOT exportable (export is published-only).
2. **Publish → export → diff.** Publish the bundle (admin or Local API `_status: 'published'`
   — fires `enforceGeneratable`), then `generateForBundle` → diff vs the approved DOCX reusing
   `app/scripts/lib/docxDiff.ts` (everything-except-resources). This closes the DB-less gap:
   the Phase-2/3 gates simulate/parse; Phase 4 proves stored → published → DOCX through Postgres.
3. **Wire it as a repeatable regression check** (a script that seeds → ingests → publishes →
   generates → diffs, self-cleaning), and **run it on the Rock** (deploy workflow below).
4. **Bulk-ingest the corpus** (optional, once #1–3 pass): the 10 Biology + 3 Math `*_data.js`
   at SHA `529be40` on `upstream` — exercises the pre-flight + transaction + warn-only FE/ST
   path at scale, and surfaces any phase-vocab / META-label variance (esp. Mathematics).

**Watch-outs:**
- **Phase 3 needs no migration**, but Phase 4 *does* touch the DB (ingest writes). No schema
  change though — just data. The Rock pickup is `git pull` + `docker compose up -d --build`.
- **Math META differs** (`subject` label, `col3Label`/`col5Label` "Teacher Actions"/"Assessment
  Strategy") — carried through verbatim; Math shares the 5 phases but different labels. Confirm
  a Math SubjectGrade exists before ingesting Math.
- **Promote FE/ST to a hard gate** once the corpus bulk-ingest (#4) confirms every bundle
  carries FE + ST (move `deliverableWarnings` checks into `validateGeneratable`, drop warn-only).

## Open items / pending

- **ARES confirmation message** — awaiting Mark's reply on which data/DOCX are canonical. Not
  blocking (we have `bio_1_4`).
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
