# Start-here for the next session — bio_1_4 end-to-end fidelity proof: generator integration (SPEC §4/§9) + ingest (§7)

> **Status (merged & DEPLOYED):** scaffold + authorization entities + sub-strand bundle +
> **bundle versioning (SPEC §6)** are all on `main` and running on the Rock at the current
> `main` HEAD. The versioning migration (`20260608_224715_bundle_versioning`) is applied;
> `app/scripts/verify-rbac.ts` passes **36/36** against the live DB (incl. semver bumps,
> lockVersion, the publish/official gate, and the Teacher read boundary).
>
> **Read boundary (Codex review, deployed):** Teachers read only **published/official**
> bundles; Editors/Subject Admins also read drafts **within their subject-grades**; Site
> Admins all — on both `read` and `readVersions` (drafts can't leak via `?draft=true` or the
> versions endpoint). The Editor whitelist is now **secure-by-default at the top level** too
> (restore-all-except-known). See `docs/DECISIONS.md`.
>
> **Versioning shipped (SPEC §6):** `versions: { drafts: true, maxPerDoc: 100 }` on
> `lesson-bundles`; `semver` / `bumpType` / `lockVersion` sidebar fields; bump + publish-gate
> logic in `enforceBundleStructure`. First save = `1.0.0`; default bump = patch; Editors may
> request minor/major via `bumpType`; **only Subject Admins (or trusted system calls) can
> publish** (= mark official), and an Editor's edit can't accidentally unpublish. See the top
> entry in `docs/DECISIONS.md` for the Payload publish-mechanics lessons.
>
> **Auth/session hardening:** admin login is solid across browsers. `serverURL` intentionally
> **empty** on the Rock; email reset links use `ADMIN_URL`. Session = 15-min inactivity window.
>
> **Open / not-yet:** the separate **public-production host** hasn't deployed; `beforeDelete`
> guards on Subject/SubjectGrade are required before any taxonomy delete UI is built.

## This session: bio_1_4 end-to-end fidelity proof — generator integration (§4/§9) + ingest (§7)

Suggested session name: **`Lesson3: Generator round-trip + ingest`** · branch `feat/generator-ingest`.

Opening message:

> Read `SPEC.md` (§0, §4, §7, §9, and §3/§5 for the schema), `CLAUDE.md`, and
> `docs/DECISIONS.md`. Scaffold, auth, the sub-strand bundle, and versioning are done and
> deployed on the Rock (current `main`). Execute the phased plan in `docs/NEXT-SESSION.md`:
> prove Lesson3's core end-to-end on `bio_1_4` — wire ARES's Node generator in-process, and
> prove a Lesson3-stored `bio_1_4` regenerates the three approved DOCX (content-identical
> **except the Resource column**), plus safe ingest (§7). Use the `payload` skill; trust
> installed source over memory; `security-review` the `.js` extraction; verify on the Rock.

**Goal.** Prove SPEC §0 ("edit the data → regenerate the document") *inside Lesson3* — so far
only the standalone generator was proven (the fidelity demo). One complete matched set is enough
for this; the larger corpus (arriving in a few days) only adds regression breadth, so don't wait.

**Assets (verified this session — read these, don't trust memory):**
- Matched set on `~/Desktop/ares-docx-fidelity-demo/`: `bio_1_4_data.js` + the three approved DOCX
  (`Biology_Chemicals_of_Life_{CBE_LessonSequence,FinalExplanation,SummaryTable}.docx`).
  (`bio_1_4_checkpoint.json` is just the `LESSONS` array — an intermediate, not needed.)
- Node generator: branch **`origin/claude/setup-cbe-generation-ZKiIi`** of `markknit/cbe-generation-system`.
  Entry = `generators/lib/build_docs.js` → **`async run(dataModule)`** — already takes the ARES data
  object `{META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE}`, builds 3 `docx` Documents
  (`buildSoW`/`buildFinalExplanation`/`buildSummaryTable`), and **writes them to disk** under
  `data/outputs/docx/<META.outputDir>`. Deps: `docx@^9.6.1`, `mammoth` (devDep — use for DOCX→text diffing).
  Also ships a `generators/data/` corpus (~16 sub-strands) + `data/SCHEMA.md` — useful for ingest
  variety later, but only `bio_1_4` has approved DOCX.
- **Resources are gracefully optional:** `generators/lib/sections.js` try-requires the Python
  `aresResources` (which `execSync`s `python3` + a SQLite DB) and **falls back to `() => ({})`**
  when absent. So the generator runs WITHOUT Python, emitting DOCX missing only the Resource column.
  **Never invoke the Python recommender live** (single-runtime rule); the fidelity diff therefore
  **excludes resources** (as the original proof did).

**Phased plan (de-risk the generator first; each phase gated):**

**Phase 0 — Vendor + pin the generator.** Pull branch `…setup-cbe-generation-ZKiIi`; **pin its commit
SHA** (record in `docs/DECISIONS.md` + `docs/EXTERNAL-DEPENDENCIES.md`). Recommended embedding: vendor
the minimal Node set (`lib/build_docs.js`, `lib/sections.js`, `lib/docx_kit.js`, `aresResources.js`
with its fallback intact) into `app/src/generator/`, and pin `docx@9.6.1` exact in `app/package.json`.
Read those lib files to confirm the input shape + the resources fallback before wiring. Single runtime
= Node generator only.

**Phase 1 — Generator fidelity spike (GATE; standalone, no Lesson3 yet).** Run `run(bio_1_4 data)`
with resources disabled → 3 DOCX. Build the **diff harness**: extract content from generated vs
approved (via `mammoth`→text and/or unzip+normalize `word/document.xml`) and compare, **excluding the
Section-C resource cells**. **GATE: must match (except resources) before continuing** — this
re-establishes the prior proof in our pinned toolchain and validates the diff method. Decide the exact
diff mechanism + how resources are excluded.

**Phase 2 — Generator integration into Lesson3 (§4).**
- **Adapter** `lesson-bundle doc → ARES data object`: `meta→META, unit→UNIT, lessons→LESSONS,
  finalExplanation→FINAL_EXPLANATION, summaryTable→SUMMARY_TABLE`; strip Lesson3-only fields
  (`semver/bumpType/lockVersion/_status/id/createdAt/updatedAt`); keep `lessons[].number`;
  `framework[].resources` optional/empty. (Inner keys already match ARES verbatim.)
- **In-process generate fn:** refactor `run()` to **return Buffers** (not only write to disk) so
  Lesson3 can stream/download; keep a thin disk-writing wrapper for parity. Expose via a Payload
  **custom endpoint** (or a script for now — full export/sharing UI is §9, later).
- **Validity gate (flagged in the Codex review):** drafts relax `NOT NULL`/required validation, so an
  invalid draft snapshot can exist. **Validate the exact version before generating**, and/or restrict
  generation to published/official (validated) versions. Decide + implement.

**Phase 3 — Ingest (§7).** Safe `.js → JSON` extraction that **NEVER executes the module** (RCE):
statically parse the object literals (`@babel/parser` or `acorn` → extract `META/UNIT/LESSONS/
FINAL_EXPLANATION/SUMMARY_TABLE`), modeled on ARES `extract_generator_data.py`. Create the bundle as
**1.0.0** via the Local API **in a transaction** (trusted system call — no `req.user`, which
`enforceBundleStructure` treats as trusted; pass `_status: 'published'` to mark official if desired).
Validate against the schema (§5). Run **`security-review`** on the extraction path. Ingest `bio_1_4`.

**Phase 4 — End-to-end proof + regression seed.** Ingest `bio_1_4` → stored 1.0.0 bundle → adapter →
generator → 3 DOCX → diff vs approved (except resources). Wire it as a **repeatable fidelity check**
(the seed of a regression suite for when the corpus lands). Verify on the Rock.

This subsumes the earlier "vertical slice" idea (ingest → edit → export → publish → Teacher read):
Phase 4 is that slice's spine; layer the Editor-edit/publish steps on once the round-trip holds.

**Decisions to surface at plan-time:** vendor-vs-dependency + pinned SHA; the DOCX diff mechanism +
precise resource-exclusion; the `run()`→Buffers refactor; the draft-vs-export validity policy; where
generation lives (endpoint vs script) for now.

**Watch-outs:**
- `framework[].phase` is a controlled vocabulary — confirm `bio_1_4`'s phase strings match
  `docx_kit.js`'s expected colour-map keys (an unknown phase silently degrades output).
- Aim for **content-identical** (normalized `document.xml` / mammoth text) except resources; true
  byte-identical zips can differ on metadata — don't chase zip-level identity.
- Read shapes from `bio_1_4_data.js` + the generator's `data/SCHEMA.md`, not memory.
- Single runtime: Node generator only; the Python recommender is never called live.

**Out of scope (later):** full export/sharing UI + PDF (§9), live "Preview as Word/PDF" (§5),
`beforeDelete` taxonomy guards, public-production deploy, operations/observability (§11).

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

---

## Original notes — product modeling (now implemented; kept for reference)

Open a fresh session **in this repo** (`~/Documents/GitHub/Lesson3`) so `CLAUDE.md`,
`SPEC.md`, and `docs/DECISIONS.md` auto-load. Suggested opening message:

> Read `SPEC.md`, `CLAUDE.md`, and `docs/DECISIONS.md`. The scaffold is done and
> deployed. Let's model the authorization entities and the sub-strand bundle as
> native Payload nested fields (SPEC §3, §5, §8). Use the `payload` skill.

## Where things stand (scaffold + deploy: DONE)
- Payload **3.85** + Postgres in Docker (blank template, TypeScript) in `./app`.
- Running on the **Rock 5B** at `/srv/lesson3`, co-tenant with nanoclaw, `/admin` live,
  first admin user created. URL: `http://rock5b.tail49b05.ts.net:3001/admin`.
- Initial migration committed (`app/src/migrations/`); **migrate-on-deploy wired**
  (one-shot `migrate` service + Postgres healthcheck in `docker-compose.yml`).
- Fidelity proof passed earlier (`bio_1_4`). `payload` skill installed at
  `.claude/skills/payload/`.

## Step 0 — verify the migrate-on-deploy gate (if not already done)
On the Rock: `cd /srv/lesson3 && git pull && docker compose up -d --build`, then
`docker compose logs migrate` (should apply nothing — initial already applied — and exit 0)
and `docker ps` (app + postgres up). Proves the new gate before feature work.

## Pre-flight — scaffold-hygiene fixes (from a Codex audit; do before feature work)

Small, no-migration fixes that restore a currently-broken dev/test loop. Bank these first
so "verify, never assume" actually holds (each verified against the scaffold):

- [x] **Package-manager drift:** `app/package.json` `test` script calls `pnpm`, but the
  project uses npm (`package-lock.json`, Docker `npm ci`). Switch the `test` script to npm
  and drop the `pnpm` `engines`/config block. (`npm test` currently fails: `pnpm: not found`.)
- [x] **Int-test DB host:** `vitest.setup.ts` loads `.env`, whose `DATABASE_URI` host is the
  Docker service name `postgres` (unresolvable on the host). Add `app/test.env` (or a test
  override) pointing at `localhost`/a test DB so `npm run test:int` connects.
- [x] **ESLint flat-config fails** under ESLint 9 + Next 16 `FlatCompat`. Make `npm run lint`
  actually run (pin/adjust the config).
- [x] **Finish dependency pinning** (our policy): `cross-env`, `graphql`, `eslint`, `prettier`
  still carry `^` ranges — pin exact like the Payload/Next/React deps already are.
- [x] **Media default-private:** `app/src/collections/Media.ts` has `read: () => true`
  (blank-template default). Gate it (authenticated/role-based) until there's an explicit
  public-asset policy.

> Not a defect: Codex also flagged "no product model yet" — that is the intended scaffold
> state described by this doc, not a problem.

## Immediate task — model in this order
1. **Authorization entities FIRST** (so access functions exist to attach to):
   - `Subject` (discipline only) and `SubjectGrade` (subject + **integer** grade; display
     "Grade N"). `class` is reserved — the entity is always `SubjectGrade`.
   - Roles: **Site Admin** (global), **Subject Admin** (≤1 per subject-grade; promoting
     auto-demotes the prior holder to Editor in **one transaction**), **Editor**
     (per subject-grade), **Teacher** (default; view/export). Enforce in Payload access
     functions, **server-side**. Non–Site-Admins never see others' emails.
   - **Fix the scaffold-default Users collection as part of this** (insecure defaults; no
     live exploit yet — only the admin user exists): add `access.admin` so only Site Admins
     (not Teachers/Editors) can enter the Payload admin panel — without it *any* user in the
     collection can; add a `username`/display field, move `admin.useAsTitle` off `email`, and
     add **field-level read access on `email`** so non-Site-Admins never see it (SPEC §8).
2. **The sub-strand bundle** as **native nested fields** (NOT a JSON blob):
   `META, UNIT, LESSONS[]{ slo, overview, framework[]{ phase (dropdown), learnerExperience,
   teacherMoves, sensemakingStrategy, formativeAssessment, resources? }, teacherReflection,
   summaryTablePrompt }, FINAL_EXPLANATION, SUMMARY_TABLE`.
   - Editor grammar = **subset** of the generator's: plain strings, `\n` = paragraph,
     leading `- ` = bullet, **no inline markup**; `framework[].phase` is a controlled dropdown.
   - Resource column is **system-only and OPTIONAL** — every path must work with it absent.
   - Field-level access per SPEC §5 (Editor = prose values; Subject Admin = `META`/
     `aresKeywords`/`phase`/structure/answer-keys; system-only = resource column +
     `LESSONS[].number`).

## Schema-change workflow (important — you WILL hit this)
Adding collections/fields is a schema change → generate a **new migration before deploy**:
build the `builder`/tools image and run `npx payload migrate:create <name>` against the DB,
commit `app/src/migrations/*`. The `migrate` service applies it automatically on
`docker compose up`. (Only the *apply* is automated; *create* is still a manual step.)

## Housekeeping & investigate (opportunistic / non-blocking)
- **Sync stale root docs:** `README.md` still says "scaffolding not generated"; `AGENTS.md`
  still says test framework "TBD" (it's Vitest + Playwright now).
- **Remove blank-template artifacts:** `app/src/app/(frontend)/page.tsx` + `layout.tsx`,
  `tests/e2e/frontend.e2e.spec.ts`, `app/.env.example`, `app/README.md` still describe the
  Payload/Mongo blank template.
- **Investigate, don't assume a bug:** local `npm run build` hung at "Creating an optimized
  production build". The Docker build works (`/admin` is live on the Rock), so this is most
  likely a local-env quirk — reproduce in Docker before changing anything.
- **Node 22/25 lock drift** (already logged in DECISIONS 2026-06-08): regenerate lockfiles
  under Node 22, or align local dev to Node 22.

## Use these
- **`payload` skill** (`.claude/skills/payload/`) — collections, fields, access control, hooks,
  versioning/drafts, transactions. Trust it over memory for Payload 3 APIs.
- **`security-review` skill** — run on the access functions (the auto-demote transaction and
  field-level boundaries are the highest-risk correctness surfaces), and later on ingest
  (the never-`require()`-an-uploaded-`.js` RCE surface).

## Reference assets
- Fidelity matched pair: `~/Desktop/ares-docx-fidelity-demo/` (`bio_1_4`).
- ARES generator: `markknit/cbe-generation-system` (branch in `docs/EXTERNAL-DEPENDENCIES.md`);
  `run(dataModule)` already takes a data object — see memory `ares-generator-integration`.
