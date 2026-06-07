# Start-here for the next session (the coding kickoff)

Open a fresh session **in this repo** (`~/Documents/GitHub/Lesson3`) so the correct
`CLAUDE.md` + `SPEC.md` auto-load. Suggested opening message:

> Read `SPEC.md` and `CLAUDE.md`. We're starting the build: scaffold the Payload app
> (blank template, PostgreSQL, TypeScript), wire `DATABASE_URI` to the
> `docker-compose.yml` Postgres service, then do the `bio_1_4` fidelity proof.
> The ARES generator lives at `markknit/cbe-generation-system`
> (see `docs/EXTERNAL-DEPENDENCIES.md`).

## Orientation (read these first)
- `SPEC.md` — canonical spec (architecture, content model, editing, versioning, ingest, resources).
- `CLAUDE.md` — non-negotiable design rules.
- `docs/EXTERNAL-DEPENDENCIES.md` — the ARES generator + the resource subsystem.
- `docs/ROCK5B-SETUP.md` — Docker co-tenancy runbook for the Rock 5B (runs beside nanoclaw).

## Immediate task list
1. **Scaffold Payload** — blank template, PostgreSQL, TypeScript, npm.
   - ⚠️ `create-payload-app` needs a **real interactive terminal**. An automated/PTY attempt
     in the prior session did **not** complete. Run it in a normal terminal:
     `npx create-payload-app@latest . -t blank --db postgres --use-npm`
     (verify current flags at payloadcms.com/docs first). Scaffold into the repo root,
     or into `./app` and set `build: ./app` in `docker-compose.yml`.
   - Keep the generated **Dockerfile**; discard the generated `docker-compose.yml`/`.env.example`
     in favor of the committed, co-tenancy-tuned ones.
2. **Wire env** — `cp .env.example .env`, set `PAYLOAD_SECRET` (`openssl rand -hex 32`) and
   `POSTGRES_PASSWORD`; `DATABASE_URI` host is the compose service name `postgres`.
3. **Boot it** — `docker compose up -d --build`, confirm `localhost:3001/admin` (or
   `rock5b.tail49b05.ts.net:3001/admin`) loads and you can create the first admin user.
4. **Fidelity proof** — refactor the ARES generator's `generateOne()` to accept a data object,
   run it on `bio_1_4`, and diff against the approved `Chemicals_of_Life` DOCX.
   **Diff everything-except-resources first** (resources need the Python recommender + `ares_content.db`).

## Open decisions to confirm during the build
- **Editor placement:** start with Payload's admin edit screen; custom React editor only if inadequate.
- **Resource column:** OPTIONAL / undetermined — code must work with or without `framework[].resources`.
- **Scope:** decide whether favorites / messaging / deletion-requests carry over from Lesson2.
- **Host:** Rock 5B for testing/offline-prototype; a public host (VPS/Railway/Render) for production later.

## Reference assets
- Verified matched pair for the fidelity proof: `~/Desktop/ares-docx-fidelity-demo/`
  (`bio_1_4_data.js` ↔ `Biology_Chemicals_of_Life_CBE_LessonSequence.docx`, plus the
  FinalExplanation and SummaryTable docs).
