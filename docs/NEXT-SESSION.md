# Start-here for the next session — Bundle versioning (SPEC §6)

> **Status (merged & deployed):** scaffold + authorization entities + the sub-strand bundle
> are done, merged to `main`, and running on the Rock at **`3fb833d`** (Docker `restart:
> unless-stopped`, data in volume `lesson3_lesson3_pgdata` — survives reboot). Field-level
> Editor/admin protection on `lesson-bundles` is enforced by a **whitelist hook**
> (`enforceBundleStructure`), not field access; `app/scripts/verify-rbac.ts` passes **19/19**
> against the deployed image. Email (password resets) works via the nodemailer adapter +
> `SERVER_URL`. Two external audits (Codex + CodeRabbit) are triaged and resolved — see the
> top entries in `docs/DECISIONS.md`.
>
> **Open / not-yet:** the separate **public-production host** hasn't deployed; `beforeDelete`
> guards on Subject/SubjectGrade are required **before** any taxonomy delete UI is built.

## This session: versioning (SPEC §6) — its own migration

Suggested session name: **`Lesson3: Bundle versioning (SPEC §6)`** · branch `feat/bundle-versioning`.

Opening message:

> Read `SPEC.md` (§6), `CLAUDE.md`, and `docs/DECISIONS.md`. Scaffold, auth, and the
> sub-strand bundle are done and deployed on the Rock (`main` @ `3fb833d`). Implement
> **versioning** per SPEC §6: enable Payload versions/drafts on `lesson-bundles`; add
> **semver** (`x.y.z`) + an **official-version pointer** as custom fields + a save hook
> (first ingested = **1.0.0**, default edit bump = **patch**, user may choose
> patch/minor/major, **≤1 official version per bundle**); add **optimistic concurrency**.
> Use the `payload` skill (trust installed source over memory). Generate the migration on
> the Rock as before (builder image, `migrate:create`, against the live DB); extend
> `verify-rbac.ts` (or add a versioning test) and verify 0-fail on the Rock.

Watch-outs for this work:
- Versioning interacts with the **whitelist hook** — version restore/publish must respect the
  same Editor/admin split (a restore is effectively a write; route it through, or re-assert,
  `enforceBundleStructure`'s rules so an Editor can't restore admin-only changes).
- Drafts add `_versions` tables and semver/official add columns → **new migration** (only
  *apply* is automated on deploy; *create* is manual via the builder image — see the
  schema-change workflow below).
- Adding new bundle fields? They're **admin-only by default** under the whitelist — add to the
  prose constant in `hooks/bundleIntegrity.ts` only if Editor-editable (see the LessonBundles
  docstring).

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
