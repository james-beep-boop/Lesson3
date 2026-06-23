# Engineering Conventions

Human-facing engineering conventions for Lesson3. Canonical spec: `SPEC.md`. AI-assistant
operating rules: `CLAUDE.md` (it points here for conventions rather than duplicating them).
Decisions + reasoning: `docs/DECISIONS.md`. Where to start / current state: `docs/NEXT-SESSION.md`.

## Stack conventions

- **Language:** TypeScript on Node.js (pinned to **22.17.0** via `.nvmrc` + volta, matching the
  Rock). One runtime end to end — do not add a second language on the core path.
- **Framework:** Payload CMS 3 (Postgres adapter) on Next.js. Define content as **native nested
  fields**, not JSON blobs. Use Payload **access control** for authz (collection-, operation-, and
  field-level) and **hooks** (`beforeChange`/`afterChange`) for versioning side-effects and generator
  invocation. Payload 3 is a Next.js-native rewrite — treat pre-2026 API recollection as suspect;
  trust installed source.
- **DOCX/PDF:** reuse ARES's `cbe-generation-system` generator (the `docx` npm package), vendored
  under `app/src/generator/vendor` and called in-process. **Never reimplement the formatting**; the
  vendored path is byte-pristine (fidelity-gated). PDF = the generated DOCX converted by a local
  office engine (Gotenberg sidecar) via the `docxToPdf(buffer)` seam — never a parallel renderer.
- **Versioning:** Payload native versions/drafts + custom semver and official-version fields.

## Project layout (`app/`)

- `src/collections` — Payload collections (Users, Subject, SubjectGrade, LessonBundles).
- `src/access` — reusable access functions (the authz source of truth).
- `src/fields`, `src/hooks` — shared field configs + collection hooks (e.g. `bundleIntegrity`).
- `src/generator` — the DOCX/PDF generator boundary (`generateForBundle`, `docxToPdf`, `previewBundle`,
  the `compact` format) + `vendor/` (the pristine ARES generator).
- `src/ingest` — safe `.js`/`.json` extraction (parse-never-execute), the contract validator/schema.
- `src/endpoints` — custom Payload endpoints (export, preview, upload, shared param parsers).
- `src/app/(frontend)` — "The App" (role-aware UI all roles log into); `src/app/(payload)` — admin.
- `src/lib`, `src/components`, `src/migrations`, `src/payload-types.ts` (generated).
- `scripts/` — dev/gate CLIs run via `npx tsx …` or `payload run …` (top-level-await required).

## Commands (run from `app/`)

- **Lint:** `npm run lint` (ESLint 9). **Types:** `npx tsc --noEmit -p tsconfig.json`.
- **Tests:** `npm test` = `test:int` (Vitest, **needs a DB → Rock only**) + `test:e2e` (Playwright).
- **Build:** `npm run build` (`next build`, **needs a DB → Rock only**).
- **Codegen (run on the Rock, Node 22):** `npm run generate:types`, `npm run generate:importmap` —
  commit the output. The local CLIs can break on newer Node.

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
