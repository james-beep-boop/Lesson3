# Start here — plan the next phase

You are picking up the **ARES Lesson Library (Lesson3)**: a versioned lesson-plan repository that
ingests ARES CBE lesson plans, lets teachers/editors view + edit them under field-level RBAC, and
exports high-fidelity DOCX/PDF by reusing ARES's own generator. Node/TypeScript + Payload CMS
(Postgres) end to end.

**Read first, in order:** `CLAUDE.md` (working rules — auto-loaded each session anyway) → `SPEC.md`
(canonical architecture/domain) → `AGENTS.md` (stack, layout, commands) → `docs/DECISIONS.md`
(build-time decisions + reasoning; newest on top). **`DECISIONS.md` is large (~1600 lines) — skim
the most recent entries and grep it for the area you're touching; don't read it end to end.** This
file is the launch prompt; the build history lives in `docs/CHANGELOG.md` (consult only for provenance).

Then propose a plan for ONE next phase (see "Choose the next phase" below) before editing anything.

---

## Where things stand (as of 2026-06-22, origin/main `8caa6a2`)

**Phases 0–4 are done and the architecture is validated end-to-end.** What's live and proven on the
Rock (the deploy/verification box — see "Rock" below):

- **Ingest** — safe static extraction of ARES `.js`/`.json` (parse-never-execute), one all-or-nothing
  transaction, **contract drift is a HARD gate**. Dev CLI + a Site-Admin-only web upload.
- **Data model + versioning** — the sub-strand bundle as native Payload nested fields (META, UNIT,
  LESSONS[], FINAL_EXPLANATION, SUMMARY_TABLE); whole-bundle immutable snapshots, semver, one
  official version. UNIT/Sub-Strand Overview renders end-to-end.
- **RBAC** — Site Admin / Subject Admin / Editor / Teacher, field-level; `verify-rbac` 36/36.
- **"The App"** (`app/src/app/(frontend)`) — the role-aware frontend ALL roles log into. Teachers
  live here only (excluded from `/admin`, redirected home). Has browse → view → preview → export.
- **§5 editing/preview** — admin editor with array row labels, draft-capable HTML preview, **live
  unsaved-edit preview** (`POST /:id/preview`, edit-gated), teacher Standard/Compact toggle. **Browser
  smoke-test ALL PASS** (2026-06-22).
- **§9 export** — DOCX **and PDF** (`GET /api/lesson-bundles/:id/export?format=standard|compact&as=docx|pdf`),
  READ-access-gated, published-only. PDF = the generated DOCX converted by a **Gotenberg sidecar**
  via the `docxToPdf(buffer)` seam. **Live + verified.**
- **Corpus** = 13 published bundles (10 Biology + 3 Math, Grade 10, ids 63–75), all carrying populated UNIT.

**The Rock is an explicit NON-PRODUCTION verification environment** — not production-ready (see the
readiness backlog). It is the only place with a DB; `test:int` and `next build` only run there.

---

## Choose the next phase (propose a plan for one)

1. **Cross-user "The App" features (§10)** — the natural next major phase. Email-a-doc, internal
   messaging + notifications, favorites, translation (Swahili), AI (summaries). All ordinary Payload
   collections/endpoints/hooks + a Jobs Queue; none touches the generator/versioning core. SPEC §10.
   *Recommended if you want forward product progress.*
2. **Finish PDF (§9)** — the two deferred halves of the slice: (a) the **Jobs Queue async wrapper**
   for heavy generation, (b) the **formal PDF fidelity gate**. See in-flight follow-ups below.
3. **Production hardening** — required before real users / sensitive data. Work the readiness
   backlog below. *Recommended if the goal is shifting from "validated" to "deployable for real."*

Recommend one to the user with a one-line rationale, then plan it. (Smaller wins in the next section
can ride along or be done standalone.)

## In-flight follow-ups (small, already scoped)

- **PDF Jobs Queue async wrapper** — synchronous convert is live; the async path (Payload `jobs.tasks`
  generatePdf + in-process runner + enqueue/poll) is the immediate follow-up. *Closes readiness #1.*
- **Formal PDF fidelity gate** (`app/scripts/pdf-fidelity-check.ts`) — conversion is proven; the
  layout-vs-Word measurement hasn't run. Needs, on the Rock: **ImageMagick** installed (poppler is
  present); **3 Word oracle PDFs** staged as `<name>.oracle.pdf` in `/srv/lesson3/out/ares-demo` (open
  each approved DOCX in Word → Save as PDF); and a path to reach the **port-less** `gotenberg` (expose
  it temporarily, or run the script in a tooling image on the `lesson3_default` network).
- **Row-label doubling** (cosmetic) — lesson rows read "Lesson 1 — Lesson 1 — …" because `RowLabel`
  prepends `Lesson N —` while the stored `title` already begins with its own. Fix in
  `components/RowLabel` (strip a leading `Lesson N —` for the lessons array, or drop its prefix).
- **chem_1_4 → 14th bundle** — blocked on Mark coercing its `LESSONS[].number` from string to integer
  upstream. When fixed: re-pull `upstream`, stage into `out/ares-data`, ingest (the hard gate admits it).
- **(Optional) Skip the semver bump on a no-op publish** — any `update` currently bumps semver; only
  do this if "mark official without editing shouldn't bump" is wanted.

## Production-readiness backlog (the Rock is NOT production)

**Do not soften this:** Codex (2026-06-22) found **no current Critical/High *exploitable application
bug***, but that is NOT "production-ready." The system must not serve real users / sensitive data at
scale until ALL of these land:

1. **Heavy generation is synchronous + unthrottled (live #1 risk).** Any authenticated user can
   trigger DOCX+PDF conversion and tie up an app worker + Gotenberg for up to 120s/request. The 120s
   `docxToPdf` timeout is only a floor-level guard. Real fix: **Jobs Queue + per-user rate-limit +
   artifact cache** (covers generation incl. the preview POST).
2. **Dependency advisories** — `npm audit` shows criticals/highs incl. `nodemailer`/`undici` via
   Payload's own deps. Resolve by a deliberate Payload/transport upgrade (not a blind bump).
3. **CSP + HTML-sanitization posture** — generated Mammoth HTML is rendered with
   `dangerouslySetInnerHTML` on the teacher route (low risk today: plain-string inputs, Mammoth
   escapes — becomes real **when Resource links land**). Sanitize `docxToSections` output; add the
   preview endpoint's CSP to the teacher frontend route; global security headers + CSRF posture.
4. **Optimistic concurrency** — updates increment `lockVersion` but don't reject a stale client
   version. Add the check, but **EXEMPT system/ingest paths** (`overrideAccess` republish, migrations)
   or it breaks ingest.
5. **FE/ST deliverable model** — *reframed from "bug" to a spec/product modeling gap.* Today's
   warn-only conflates "this sub-strand legitimately has no FE/ST" (6/13 upstream) with "the data is
   incomplete." Resolve via either (a) SPEC §3 allowing single-doc bundles for some sub-strands, or
   (b) a typed `notApplicable`/intentionally-omitted state — THEN a hard gate can fire only on
   genuinely-missing data.
6. **Tests** — `tests/e2e/frontend.e2e.spec.ts` still asserts the blank Payload template (stale
   scaffold); replace/remove it AND add real **preview/export/PDF/authz** endpoint coverage (needs an
   auth+role fixture harness `tests/int/api.int.spec.ts` lacks). PDF fidelity gate in CI (see above).
7. **Disable/gate unused GraphQL + GraphQL Playground** (`payload.config.ts`) — scaffold-mounted,
   recon surface (access controls still apply). Verify the exact Payload `graphQL.disable` option
   against installed source before applying.
8. **Lesson browse hard-limits at `limit: 200`** with no pagination (`(frontend)/page.tsx`) — content
   becomes undiscoverable once the corpus grows to hundreds (expected). Add page/search.
9. **Ops** — error tracking (Sentry), off-site encrypted Postgres backups + pre-migration snapshots,
   CI/CD so deploy isn't bound to one machine. SPEC §11.

---

## Must-know operational knowledge

**Rock** = the deploy/verification box. Login `david@rock5b` (passwordless SSH over Tailscale);
app at `http://rock5b.tail49b05.ts.net:3001` (`/admin` + The App at `/`); repo at `/srv/lesson3`;
Docker compose (`app` on host :3001, `postgres` + `gotenberg` internal-only, one-shot `migrate`).
**origin/main is the single source of truth** — push first, then `git pull` on the Rock.

**Deploy:**
- *Code/data only (no schema change):* `git pull` → `docker compose up -d --build`. (Script-only
  changes that don't rebuild the app: `git pull` + re-run via the deps image, see below.)
- *Schema change:* regenerate types + migration ON THE ROCK (Node 22) and commit them, because the
  local `payload generate:*` CLIs break on newer Node:
  ```
  docker build --target deps -t lesson3-deps ./app
  docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app --env-file .env \
    lesson3-deps npx payload generate:types            # commit app/src/payload-types.ts
  docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
    -w /app --env-file .env lesson3-deps npx payload migrate:create <name>   # make up/down idempotent; commit
  docker compose up -d --build                          # one-shot `migrate` applies pending, then `app` starts
  ```
  Verify with `verify-rbac.ts` / `roundtrip-regression.ts` via the same deps-image + `--network` line.

**Env** (`.env` on the Rock; `app/.env.example` documents all): `DATABASE_URI`, `PAYLOAD_SECRET`,
`ADMIN_URL`, optional `SERVER_URL` (leave EMPTY on internal/plain-HTTP — strict CSRF bounces some
browsers), SMTP_*, `GOTENBERG_URL=http://gotenberg:3000`, `GOTENBERG_TIMEOUT_MS=120000`.

**Logins** — `app/scripts/seed-users.ts` seeds a Teacher / Editor / Subject-Admin (scoped to Biology
G10 by default; passwords from `*_PASSWORD` env or printed once). The Rock already has Teacher +
Editor seeded (ask the user for the passwords — they are NOT in the repo).

**Watch-outs:**
- Any `payload run` script must **top-level-await** its work, or it silently no-ops.
- Generated files MUST land in a bind-mounted host dir (`/srv/lesson3/out`) or they vanish with `--rm`.
- Math META differs (`col3Label`/`col5Label`, single-quoted/identifier-key JS) — the acorn extractor
  handles it; carried verbatim. Mathematics G10 is seeded.
- The vendored generator path is **byte-pristine** (fidelity 3/3) — don't refactor it in passing.

**Assets** (verified — don't trust memory):
- Stakeholder-approved oracle: `~/Desktop/ares-docx-fidelity-demo/` (`bio_1_4_data.js` + 3 approved
  DOCX). Override the DB-less gates' location with `ARES_DEMO_PATH` (Rock: `/srv/lesson3/out/ares-demo`).
- Generator repo: `~/Documents/GitHub/cbe-generation-system` (on `upstream`). Entry
  `generators/lib/build_docs.js` exports `buildSoW`/`buildFinalExplanation`/`buildSummaryTable`.

## Open / blocked

- **Resource column from ARES (blocked on Mark).** The blank Resource column is a fidelity gap; the
  resolved per-lesson resources (video + reading) live only in the Python recommender's output.
  Plan when it arrives: add `source` to the resource schema (migration), carry via
  `framework[].resources`, render via `vendor/aresResources.js`. See DECISIONS (2026-06-09).
- **ARES confirmation** — awaiting Mark on which data/DOCX are canonical + the resource-data request.
  Not blocking core work.
- Corpus is expected to grow from 13 to dozens→hundreds (Chemistry/Physics incoming) — informs the
  pagination item and any browse/search work.
