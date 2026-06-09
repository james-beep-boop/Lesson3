# Start-here for the next session — Ingest (SPEC §7)

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

## This session: Ingest (SPEC §7)

Suggested session name: **`Lesson3: Ingest (SPEC §7)`** · branch `feat/ingest`.

Opening message:

> Read `SPEC.md` (§7, and §3/§5 for the schema), `CLAUDE.md`, and `docs/DECISIONS.md`.
> Scaffold, auth, the sub-strand bundle, and versioning are done and deployed on the Rock
> (current `main`, verify-rbac 30/30). Implement **ingest** per SPEC §7: accept ARES output
> and create the first version as **1.0.0** via the Local API in a transaction; bulk ingest
> supported; validate against the schema (same rules as §5). **CRITICAL: extract the `.js`
> data module to canonical JSON — NEVER `require()`/execute an uploaded `.js`** (RCE;
> ARES's `extract_generator_data.py` is the model for safe extraction). Resource resolution
> is optional (skip if the column is disabled). Use the `payload` skill; run `security-review`
> on the extraction path. Generate the migration (if any) on the Rock and verify on the Rock.

Watch-outs for ingest:
- The bundle's field names are camelCase top-level groups mapping to ARES `META/UNIT/...`;
  inner keys match ARES verbatim. Read shapes from the fidelity demo
  (`~/Desktop/ares-docx-fidelity-demo/bio_1_4_data.js`), not memory.
- Ingest creates as a **trusted system call** (no `req.user`) — `enforceBundleStructure`
  now treats `!req.user` as trusted (bypasses the Editor whitelist), so a system ingest can
  set all fields and publish if desired. Pass `_status: 'published'` in data to mark official.
- `framework[].phase` is a controlled vocabulary; an unknown phase silently degrades output.
  Reconcile against the Node generator's colour-map keys when generator integration lands.
- **Draft validity vs bulletproof export (SPEC §6/§9, deferred from the Codex review):** drafts
  relax `NOT NULL` and skip required validation, so an invalid draft snapshot can exist.
  Generation/export must **validate the exact version before generating**, and/or restrict
  export to official/validated versions — handle this when the generator integration lands.

## Consider a vertical slice (Codex suggestion)

Rather than building all four roles in isolation, the highest-signal next move is a thin
end-to-end slice that proves the product's core ("edit data → regenerate document", SPEC §0,
still unproven in Lesson3 — only the standalone generator was proven in the fidelity demo):
**ingest one real bundle → Editor edits prose → export that exact version → Subject Admin
publishes → verify Teacher read/export against the official boundary.** Ingest (§7) is the
first step of that slice, so this doesn't conflict with the plan above — it just sequences the
following phases (editing UX, generator integration/export) behind a single real bundle.

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
