# Start-here for the next session

> **Status after the 2026-06-08 product-model session:** Phases A–C are implemented and
> verified locally (`generate:types`, config sanitize, `tsc`, `eslint` all clean) — scaffold
> hygiene done; `subjects`, `subject-grades`, role-bearing `users`, and `lesson-bundles`
> collections + server-side access functions + the auto-demote and structural-integrity hooks
> are in `app/src`. **Remaining:** generate the migration on the Rock (`migrate:create` against
> the live DB), deploy, and run the end-to-end RBAC checks + `security-review` (the
> "On the Rock" section of the approved plan). **Then** the next build step is **versioning**
> (SPEC §6: Payload versions/drafts + semver + official pointer) — its own session and migration.
> See `docs/DECISIONS.md` (2026-06-08 product-model entry) for the decisions made.

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
