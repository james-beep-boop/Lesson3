# Start-here for the next session — Phase 5: editor/preview (§5), resources, round-trip regression

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

## Next priorities (Phase 5)

1. **Repeatable round-trip regression.** Wire the manual round-trip into one self-cleaning
   command — ideally fully on the Rock (place the approved DOCX on the Rock, generate + diff
   there) so it doesn't need the Mac round-trip. Reuse `scripts/lib/docxDiff.ts`.
2. **Bulk-ingest the corpus — LARGELY DONE (2026-06-14).** 12 of the 13 sub-strands were
   uploaded as drafts via the new Site-Admin web upload (ids #36–47; bio_1_4 was already id 33).
   **6/13 carry null FE/ST** (upstream content gap) → these ingested with the expected
   warn-only deliverable warnings (LessonSequence-only). Remaining: **publish** the drafts to make
   them exportable; and promote FE/ST to a hard gate only if/when the corpus is completed upstream.
3. **§5 editor + preview** (Payload admin edit screens + the "Preview as Word/PDF" derived from
   the generator — DOCX→mammoth HTML), per the Payload-first rule. **§9 export endpoint is DONE**
   (shipped 2026-06-13, see top) — the preview can reuse the same `generateForBundle` core; promote
   the export to the Jobs Queue only when batch/large-bundle async is actually needed.
4. **(Minor, optional) Skip the semver bump on a no-op publish** — currently any `update`
   (incl. a publish with no content change) bumps semver. Not considered a bug; do only if
   "mark official without editing shouldn't bump" is wanted.

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
