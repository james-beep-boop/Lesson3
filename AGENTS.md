# Engineering Conventions

Human-facing engineering conventions for Lesson3. Canonical spec: `SPEC.md`. AI-assistant
operating rules: `CLAUDE.md` (it points here for conventions rather than duplicating them).
Decisions + reasoning: `docs/DECISIONS.md`. Where to start / current state: `docs/NEXT-SESSION.md`.

## Stack conventions

- **Language:** TypeScript on Node.js (Docker and `.nvmrc` pin **24.19.0**; `devEngines` accepts
  supported 24.x patches and rejects other majors). One runtime end to end — do not add a second
  language on the core path.
- **Framework:** Payload CMS 3 (Postgres adapter) on Next.js. Define content as **native nested
  fields**, not JSON blobs. Use Payload **access control** for authz (collection-, operation-, and
  field-level) and **hooks** (`beforeChange`/`afterChange`) for versioning side-effects and generator
  invocation. Payload 3 is a Next.js-native rewrite — treat pre-2026 API recollection as suspect;
  trust installed source.
  - **Scope of the native-fields rule (narrowed 2026-08-05):** it governs the **content of record** —
    anything the generator consumes, versioning snapshots, or field-level RBAC applies to. That is
    where a JSON blob would be disqualifying (§0/§3 of `SPEC.md`). It does **not** extend to a
    transient, non-exported, owner-only *overlay* of content of record. The one sanctioned exception
    today is `edit-recovery` (SPEC §5): a sparse map of prose leaves keyed by row id, which native
    fields cannot express — every field would be optional, sparseness would be lost, and a capture
    written against an older field shape could not be stored at all, defeating its own schema-drift
    rule. Any further exception needs the same written justification in `SPEC.md`, not a judgement
    call at edit time.
- **DOCX/PDF:** reuse ARES's `cbe-generation-system` generator (the `docx` npm package), vendored
  under `app/src/generator/vendor` and called in-process. **Never reimplement the formatting**; the
  vendored path is byte-pristine (fidelity-gated). PDF = the generated DOCX converted by a local
  office engine (Gotenberg sidecar) via the `docxToPdf(buffer)` seam — never a parallel renderer.
- **Versioning:** immutable `lesson-bundle-versions` snapshots (semver) + a per-plan official-version
  pointer; editing forks a Not-Official working copy (no Payload drafts).

## Project layout (`app/`)

- `src/collections` — Payload collections (Users, Subject, SubjectGrade, LessonPlans, LessonBundleVersions).
- `src/access` — reusable access functions (the authz source of truth).
- `src/fields`, `src/hooks` — shared field configs (`lessonContent`, `bundleFields`) + collection hooks
  (`bundleVersion`, the shared `fieldSplit`).
- `src/generator` — the DOCX/PDF generator boundary (`generateForVersion`, `docxToPdf`, `previewBundle`,
  the `compact` format) + `vendor/` (the pristine ARES generator).
- `src/ingest` — safe `.js`/`.json` extraction (parse-never-execute), the contract validator/schema.
- `src/endpoints` — custom Payload endpoints (export, preview, upload, shared param parsers).
- `src/app/(frontend)` — "The App" (role-aware UI all roles log into); `src/app/(payload)` — admin.
- `src/lib`, `src/components`, `src/migrations`, `src/payload-types.ts` (generated).
- `scripts/` — dev/gate CLIs run via `npx tsx …` or `payload run …` (top-level-await required).

## Commands (run from `app/`)

- **Lint:** `npm run lint` (ESLint 9). **Types:** `npx tsc --noEmit -p tsconfig.json`.
- **Tests:** `npm test` = `test:int` (Vitest, **needs a DB** — the Rock, or the disposable probe below) + `test:e2e` (Playwright).
  **`npm run test:unit`** (own `vitest.unit.config.mts`) runs pure DB-free unit specs in `tests/unit/`
  **locally** (no Rock) — use it for pure logic like `src/lib/substrand.ts`; it's separate from
  `test`/`test:int`.

  ⚑ **"Locally" means a Node 24 host.** The `devEngines` gate rejects every npm invocation on any
  other major, so on a Node 25/23 machine this runs in the deps container like everything else — and
  there it needs the ROOT env template mounted, or `envTemplateParity.spec.ts` fails six cases that
  have nothing to do with your change:

  ```bash
  ROOT=$(git rev-parse --show-toplevel) && docker run --rm -v "$ROOT/app:/app" -v /app/node_modules \
    -v "$ROOT/.env.example:/repo/.env.example:ro" -e LESSON3_REPO_ROOT=/repo \
    -w /app lesson3-deps npm run test:unit
  ```

  Mount **that one file, never the workspace** — a workspace mount puts `.git`, and the token a
  checkout persists in it, inside the container. The spec's own header is the authority.
- **`test:int` on a disposable local stack** (added 2026-08-05, so the Rock is no longer the only
  option). Its own `lesson3-ci-probe_*` volumes; the seeded `lesson3_*` ones are never touched.
  **Always pass `-p`** — a bare `docker compose down -v` targets the preserved project and destroys the
  seeded dev database. Run from the repo root:

  ```bash
  # 0. ⚑ RESOLVE THE REPO ROOT FIRST. Every path below is derived from it, so the recipe is
  #    cwd-independent. This is not tidiness — see the trap note under step 4.
  ROOT=$(git rev-parse --show-toplevel) && cd "$ROOT"

  # 1. stand up the isolated stack (own volumes, own network)
  docker compose -p lesson3-ci-probe up -d --build

  # 2. create the test DB inside THAT project's postgres
  docker compose -p lesson3-ci-probe exec -T postgres psql -U lesson3 -d postgres \
    -c "CREATE DATABASE lesson3_test;"

  # 3. point the TRACKED app/test.env at it (restore afterwards — step 5)
  PW=$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | cut -d= -f2-)
  sed -i '' -E "s#^DATABASE_URI=.*#DATABASE_URI=postgres://lesson3:${PW}@postgres:5432/lesson3_test#" "$ROOT/app/test.env"

  # 4. run — note `-e NODE_ENV=test` is on `docker run`, NOT on `docker compose up`
  docker run --rm --network lesson3-ci-probe_default \
    -v "$ROOT/app:/app" -v /app/node_modules -w /app \
    --env-file "$ROOT/.env" -e NODE_ENV=test lesson3-deps npm run test:int

  # 5. restore the tracked file and PROVE it
  git -C "$ROOT" checkout -- app/test.env && git -C "$ROOT" diff --exit-code -- app/test.env
  ```

  ⚑ **Step 0 exists because `$PWD/app` in step 4 destroyed a working day.** Run from inside `app/`,
  `-v "$PWD/app:/app"` resolves to `<root>/app/app` — and Docker **CREATES a missing host bind
  source**, so it silently mints `<root>/app/app/node_modules`. Next.js prefers a root-level `./app`
  over `./src/app`, so `next build` then emits a build with **zero application routes** and exits 0;
  the served app 500s every request with a `ChunkLoadError` that points at the bundler. Git cannot
  track an empty directory, so `git status` stays clean and the Rock and CI never see it. `$ROOT` is
  the fix, and `npm run check:approuter` (below) is the net under it.

  The container joins the probe's network and reaches postgres by service name; the probe's postgres
  publishes **no host port**, so a host-side `psql`/`DATABASE_URI=localhost` will not reach it.
  - ⚑ `-e NODE_ENV=test` is required on the `docker run` in step 4. The repo-root `.env` is the
    Compose stack's and carries `NODE_ENV=production`, under which Payload runs migrate-mode and
    `push` is OFF — so an empty test DB gets no schema and the run dies on `relation "lesson_plans"
    does not exist`. CI never hits this because its synthetic `.env` omits `NODE_ENV` entirely. **This
    is an environment mismatch in how the run is invoked, NOT a schema defect and NOT an argument for
    enabling push in production**, where it would let the running app mutate the live schema.
  - Teardown when finished: `docker compose -p lesson3-ci-probe down -v --remove-orphans` (safe — the
    `-p` scopes `-v` to the probe's own volumes).
  - A long session eventually exhausts the shared daily rate-limit budgets in the test DB and unrelated
    specs start failing (`forgotPasswordGlobal:all`). Reset with
    `docker compose -p lesson3-ci-probe exec -T postgres psql -U lesson3 -d lesson3_test -c "DELETE FROM rate_limit_counters WHERE bucket_key LIKE '%Global:all';"`

- **Build:** `npm run build` (`next build`, **needs a DB → Rock only**).
- **Codegen (run in the pinned Node 24 deps image):** `npm run generate:types`, `npm run generate:importmap` —
  commit the output. The local CLIs can break on newer Node.

## Local stack (browser-verify UI **before** it ships)

UI defects are invisible to `tsc`, ESLint and the unit suite — three in the button-system batch
reached the deployed site because there was no local stack (DECISIONS 2026-07-30). There is one now.

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm migrate  # first run only
scripts/dev-seed.sh                                                                # logins + one lesson plan
scripts/dev-server.sh                                                              # then browse localhost:3000
```

Sign in at `http://localhost:3000/login` as `editor@local.test` / `local1234` (also `siteadmin`,
`subjectadmin`, `teacher` at the same domain and password). `.claude/launch.json` → `lesson3-dev`
runs the same dev-server script. Both scripts start Postgres themselves, so there is no separate
`up -d postgres` step.

- ⚑ **Both scripts run in the `lesson3-deps` CONTAINER, not on the host node**, and that is not a
  preference: the `devEngines` gate in the stack conventions above rejects every npm invocation on a
  host whose Node major isn't 24, which is why `cd app && npx payload run …` — what the seed step
  used to say — could not work either. `scripts/dev-server.sh`'s header carries the full failure
  trace and ties it to #214; DECISIONS 2026-08-12 has the decision.
- To exercise the **public library** locally, pass both switches — it refuses to boot with only the
  first, by design (`src/lib/publicLibrary.ts`). ⚑ `SERVER_URL` also turns on strict CSRF and Secure
  cookies, which do not suit plain-HTTP localhost, so expect to work on the public pages while
  signed out (`app/.env.example` explains the trade):

  ```bash
  PUBLIC_LIBRARY_ENABLED=1 SERVER_URL=http://localhost:3000 scripts/dev-server.sh
  ```

- `docker-compose.local.yml` publishes Postgres on **127.0.0.1:55432** and is **opt-in via `-f`**. It
  is deliberately NOT named `docker-compose.override.yml`, which Compose auto-loads on every
  invocation *including* `scripts/deploy.sh` — that would silently publish the database on the Rock.
- `app/.env` (gitignored, host-only) must point at that port — it serves the host-side tools
  (`psql`, `test.env` juggling), not the dev server, which reads the root `.env` and reaches
  `postgres:5432` over the compose network like every other container.
- `scripts/seed-local-dev.ts` **refuses to run unless `DATABASE_URI` is localhost** — it creates
  accounts with a known password, so it must be impossible to aim at a shared database.
- ⚠ A stale `app/.next` can serve **empty bodies with a 200** after a big change
  (`Invariant: missing bootstrap script`). That reads as working. `rm -rf app/.next` and restart.

## Practices

- **Verify before coding** against Payload / `docx` / Next.js: read installed source or official docs;
  trust installed source over memory. **Pin dependency versions** and upgrade deliberately.
- **Surgical edits / minimal churn.** Byte-stability of generator output is the product — prove each
  change (golden-file DOCX diff, type-check, or boot). "Done" requires evidence.
- **Security:** ingest **extracts** ARES `.js`/`.json` to data; never execute uploaded code. Enforce
  all rules server-side, not only in the UI. The export/preview endpoints are the authz boundary.
- **Tests:** colocate (`app/tests/int`, `app/tests/e2e`) and run before declaring work done. Note the
  DB-dependent gap: int/e2e/build only run on the Rock.
- **Formatting/linting:** ESLint 9 + Prettier 3 (`npm run lint`; tsc clean).
- **Deployment runbook:** `docs/ROCK5B-SETUP.md` (first stand-up) + the schema-change workflow in
  `docs/NEXT-SESSION.md`. origin/main is the single source of truth — push first, then pull on the Rock.
- **Never commit or push without an explicit request.**
