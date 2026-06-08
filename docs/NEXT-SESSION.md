# Start-here for the next session — product modeling begins

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

## Immediate task — model in this order
1. **Authorization entities FIRST** (so access functions exist to attach to):
   - `Subject` (discipline only) and `SubjectGrade` (subject + **integer** grade; display
     "Grade N"). `class` is reserved — the entity is always `SubjectGrade`.
   - Roles: **Site Admin** (global), **Subject Admin** (≤1 per subject-grade; promoting
     auto-demotes the prior holder to Editor in **one transaction**), **Editor**
     (per subject-grade), **Teacher** (default; view/export). Enforce in Payload access
     functions, **server-side**. Non–Site-Admins never see others' emails.
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
