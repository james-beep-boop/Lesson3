# Engineering Conventions

Human-facing engineering conventions for Lesson3. Canonical spec: `SPEC.md`. AI-assistant
operating rules: `CLAUDE.md` (it points here for conventions rather than duplicating them).
Decisions + reasoning: `docs/DECISIONS.md`. Where to start / current state: `docs/NEXT-SESSION.md`.

## Stack conventions

- **Language:** TypeScript on Node.js (pinned to **22.23.2** via `.nvmrc` + volta, matching the
  Rock). One runtime end to end — do not add a second language on the core path.
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
- **Tests:** `npm test` = `test:int` (Vitest, **needs a DB → Rock only**) + `test:e2e` (Playwright).
  **`npm run test:unit`** (own `vitest.unit.config.mts`) runs pure DB-free unit specs in `tests/unit/`
  **locally** (no Rock) — use it for pure logic like `src/lib/substrand.ts`; it's separate from
  `test`/`test:int`.
- **Build:** `npm run build` (`next build`, **needs a DB → Rock only**).
- **Codegen (run on the Rock, Node 22):** `npm run generate:types`, `npm run generate:importmap` —
  commit the output. The local CLIs can break on newer Node.

## Local stack (browser-verify UI **before** it ships)

UI defects are invisible to `tsc`, ESLint and the unit suite — three in the button-system batch
reached the deployed site because there was no local stack (DECISIONS 2026-07-30). There is one now.

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres   # from the repo root
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm migrate # first run only
cd app && npx payload run scripts/seed-local-dev.ts                               # logins + one lesson plan
```

Then start the dev server (`.claude/launch.json` → `lesson3-dev`, plain `npx next dev` on the host
node — it had been pinned to a node@22 path that no longer exists, so it could not start) and sign in at
`http://localhost:3000/login` as `editor@local.test` / `local1234` (also `siteadmin`, `subjectadmin`,
`teacher` at the same domain and password).

- `docker-compose.local.yml` publishes Postgres on **127.0.0.1:55432** and is **opt-in via `-f`**. It
  is deliberately NOT named `docker-compose.override.yml`, which Compose auto-loads on every
  invocation *including* `scripts/deploy.sh` — that would silently publish the database on the Rock.
- `app/.env` (gitignored, host-only) must point at that port. Containers are unaffected: they read
  the root `.env` and reach `postgres:5432` over the compose network.
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
