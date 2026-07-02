# Decisions & Lessons

Durable, team-visible record of decisions made during the build and lessons learned
from corrections. Committed to git (unlike the assistant's private cross-session memory).

- **SPEC.md** remains canonical for *architecture and domain rules*. This file is for
  build-time decisions and corrections that don't rise to the level of spec changes.
- **Newest entries on top.** Each entry: date, one-line title, then the decision/lesson
  and the reasoning. When a correction teaches a general rule, capture the rule, not just
  the incident.

---

## 2026-07-02 — Codex round-2: guards must be server-MANDATORY; narrow endpoints beat full-state PATCH

Second Codex pass after the redesign completed. Theme it surfaced (and we adopted as a rule):
**when the UI sends full resource state over a broad API, server-side concurrency guarantees must be
explicit — and a safety guard that the client may omit is not a guarantee.** Outcomes:

- **#1 make-official consent token now REQUIRED** (was optional-when-present, added in the first
  round): `deletePrevious=true` without `expectedPreviousOfficialId` → 400; mismatch → 409. The UI
  always sent it; now a scripted/direct API caller gets the same protection. http pins both paths.
- **#2 Editors-widget lost-update fixed (deferral reversed** — first round deferred it; Codex
  re-escalated to production-blocker and the user agreed): the widget's full-`assignments` PATCH is
  replaced by narrow endpoints `POST /users/:id/assign-editor` / `unassign-editor` with a REQUIRED
  `expectedUpdatedAt` (400 absent / 409 stale, checked in-transaction). The server rebuilds the row
  from FRESH state and applies a ONE-ROW delta — a stale page can no longer restore an old snapshot
  of someone's roles. Authorization unchanged (the update runs as the caller: collection/field access
  + `enforceAssignmentScope` + auto-demote all still apply). http covers assign→stale-409→unassign +
  the non-admin 4xx.
- **#3 lesson page could false-404 past 100 versions** — the version selector's `limit: 100` also fed
  Official/`?version=` resolution. Now `pagination: false`: a plan's version set is naturally bounded
  (dozens), completeness over truncation (same call as browse #8).
- **Kept deferred:** Manage whole-corpus fetches (scale-gated), the moderate esbuild dev advisories
  (upstream-gated). **CSS-internals brittleness** (the `:has()` chrome strip depends on Payload class
  names): accepted — versions are pinned and upgrades deliberate (knowledge-currency rule); an editor-
  shell smoke assertion joins the pending Playwright backlog.

---

## 2026-07-01 (post-②) — Codex audit of the redesign work: 8 findings, 8.0/10, no Critical/High

External Codex audit of `main` after IA-redesign PRs ①–② (+ the /simplify pass). Outcomes:

**Fixed immediately:**
- **#1 migration rollback ownership** — the author migration's `down` dropped `rate_limit_counters`,
  a table OWNED by the 20260629 migration (whose own down drops it): a one-step rollback would have
  killed the live rate limiter. `down` now undoes only what the migration semantically owns.
  **Rule: a migration's `down` must not tear down objects another migration owns, even ones its `up`
  defensively creates for chain repair.**
- **#2 make-official `deletePrevious` stale consent** — the delete-previous confirmation the admin
  gave was about the version that was Official when THEIR page rendered; if another admin moved the
  pointer meanwhile, the endpoint deleted the wrong (newer) version. The client now sends
  `expectedPreviousOfficialId` and the server 409s on mismatch inside the same transaction (pin:
  http spec "STALE expectedPreviousOfficialId"). **Rule: consent to a destructive action must name
  its object; the server verifies the object hasn't changed.**
- **#4 user-directory privacy (decided: tighten)** — `usersCollectionRead` was `Boolean(user)` "for
  attribution", but nothing teacher-facing reads other users today. Now: Site/Subject Admins read the
  roster (the Editors widget needs it); everyone else reads only themself (Where-scoped, so lists
  return the caller rather than erroring). Emails stay field-hidden on top. If §10 features need
  attribution later, relax deliberately.
- **#5** stray untracked `apiBase 2.ts` duplicate removed.

**Tracked, deliberately not built now:**
- **#3 Editors-widget full-array PATCH race** (two admins editing one user concurrently can lose an
  edit) — real but marginal at ≤1 Subject Admin per subject-grade + a refresh after every change;
  revisit with an updatedAt precondition or a narrow assign/unassign endpoint if the admin population
  grows. **#6** Manage loads whole collections (`pagination: false`) — fine at today's corpus,
  paginate/search at thousands. **#7** Manage has no browser-level coverage — fold into the pending
  Playwright run (the adminCatalogue spec is also still authored-not-run). **#8** dev-only esbuild
  moderate advisories — known, upstream-gated.

---

## 2026-07-01 (late) — IA redesign decided: one library, lesson-page hub, role-scoped Manage

The user flagged the core UX failure: three near-identical lesson lists (public browse, the admin
Lesson Plans catalogue, the Lesson Bundle Versions list) that click through to three different destinations
— the data model was leaking into the UX. Redesign decided after a structured Q&A; **simplicity and
elegance are paramount: no redundant menu items, no multiple paths to the same outcome.**

**The design — three places, one purpose each. Data-model names never appear in the UI:**
1. **Library (`/`)** — THE only list of lessons anywhere, identical for every role (no role-aware
   badges). Search + strand-first grouping as today.
2. **Lesson page (`/lessons/[id]`)** — everything about one lesson: rendered view, version pills
   (ALL roles keep seeing all versions — decided against Official-only for teachers), Download,
   **Edit** (the SOLE gateway to editing; lands unlocked), **Make Official** (Subject/Site Admin —
   confirmed unchanged: author ≠ approver, per-subject-grade delegation stays).
3. **Manage (`/admin`)** — ONE scrollable page of role-scoped functions, strictly cumulative:
   Editor: *My saved versions* (authored drafts; click resumes editing, ✕ deletes) and NOTHING else.
   Subject Admin: + delete any candidate in scope, + a compact **Editors widget** (promote/demote
   Teachers↔Editors per subject-grade; NOT the native Users table). Site Admin: + Upload (moves here
   from the old catalogue), + Repair (pointerless plans), + Delete lesson plans (search→select→delete),
   + links to native Curriculum/People lists.
   **Deleted:** the admin catalogue (duplicate library), the versions nav/list, the plan-edit form as
   a destination. The version editor gets **stripped chrome** (no admin sidebar/breadcrumbs) + "← Back
   to lesson"; relabelled "Lesson plan version" ("bundle" never user-visible).
   **Mobile: reading-first** — library/lesson/Manage must work on a phone; the editor form stays
   desktop-oriented.

**Authorship (new):** versions get an `author` relationship stamped by save-as-new from the
authenticated caller (never from submitted content). Editor delete scope TIGHTENS from
"any non-Official candidate in my subject-grade" to "only candidates I authored"; Subject Admin keeps
scope-wide; Site Admin everything. Versions predating the field (`author` = null) are
**admin-only-deletable** (decided: strict, no scope fallback). The save-as-new `deleteSource` flow
enforces the same rule server-side (skips the delete, still saves) and the client only offers the
prompt when permitted.

**Build order (5 PRs):** ① authorship + delete scoping (foundation) → ② the Manage page → ③ remove
redundant surfaces (catalogue, versions list, labels, sidebar) → ④ strip editor chrome + Back-to-lesson
→ ⑤ mobile reading pass + Guide copy. Each: CI green → Rock deploy → user eyeball.
Checkpoints for ③: verify whether Payload `admin.hidden` blocks ROUTES (if so, nav-hide + redirect the
list views instead, keeping the editor reachable); verify the Editors widget's assignment writes pass
the existing user-update guards.

---

## 2026-07-01 — PDF fidelity is about fonts, not pixels; real Arial in Gotenberg; + Editor edit-UX

Two threads this session: the editing UX for Editors, and the long-deferred PDF fidelity gate
(item ③) — which taught the more important lesson.

**Editing UX (#6, #10).**
- The admin version editor loads read-only by default (`LessonControls` locks the form on mount;
  Stage-2 immutable-version model). An Editor who clicked "Edit" on a lesson page landed on that
  locked form and reasonably concluded they had no edit rights. Fix (#6): the lesson-page Edit button
  now carries `?edit=1`, and `LessonControls` starts unlocked when that intent is present (one effect
  `setDisabled(!editing)` as the single source of truth); a locked-state notice explains the
  read-only view for anyone who arrives without the intent.
- Follow-up (#10) — a subtler trap surfaced: after unlocking, only a couple of admin-only fields were
  greyed (phase, rubric via field access), but MANY more (`structureText`/`proseAdmin`: duration,
  ARES keywords, answer-key exemplars, FE/ST structure) rendered as normal editable inputs yet had
  their edits **silently discarded on save** by the field-split whitelist (`applyEditorFieldSplit`
  overlays only prose onto the original doc). Decision: **hide all admin-only fields from Editors**,
  generalizing the existing META/UNIT `structureCondition` treatment into one `adminOnly()` wrapper
  (`fields/lessonContent.ts`; META/UNIT now use it too). Presentation only — the hook stays the write
  authority; hidden fields keep their original values, so answer keys/structure are never wiped; array
  RowLabels still read the value from row `data`. **Rule:** when field-level access can't safely gate
  a field (Payload nulls optional admin-only subfields inside open arrays), don't leave it
  falsely-editable — hide it. A form must never show an input whose edits won't persist.

**PDF fidelity (#8, #9) — the gate was measuring the wrong thing.**
- The gate (`scripts/pdf-fidelity-check.ts`) had never actually run to completion. First bug (#8):
  `requireTool` probed each tool with `-version`, but poppler's `pdftoppm` has no such flag (treats
  it as a filename → exits 1), so an installed tool was reported "not found" and aborted the gate.
  Fixed to fail only on ENOENT. **Rule:** a tool-presence check must distinguish "binary absent
  (ENOENT)" from "binary ran but disliked the probe flag."
- Running, it scored 0/3 with per-page diffs of 50–400%. The >100% values were the tell: LibreOffice
  (Gotenberg) and Word **paginate and lay tables out differently**, so page N of the candidate does
  not correspond to page N of the oracle. **A per-page pixel comparison of LibreOffice output against
  a Word oracle at 1% tolerance is mathematically unreachable cross-engine** — faithful output still
  differs across most pixels (font substitution + row-height shifts cascade into offsets). Pixel-vs-
  Word was abandoned as the fidelity method.
- Visual inspection showed the export is actually faithful; the visible gap the user flagged (table
  row heights) traced to **fonts**: the DOCX calls for **Arial** everywhere, and stock Gotenberg's
  LibreOffice has no Arial → substitutes **Liberation Sans**, whose vertical metrics differ enough to
  shift row heights. Fix (#9): build Gotenberg from a local `gotenberg/Dockerfile` = upstream +
  `ttf-mscorefonts-installer` (real Arial, fetched under Microsoft's EULA at build time — fonts NOT
  vendored, which the EULA disallows; hence a `build:` not a pinned image). Verified on the Rock: a
  three-way Liberation/Arial/Word render shows the gap closes to a **minor residual** (LibreOffice's
  vs Word's table-layout algorithm — not a font issue; nothing short of a Word-native engine closes
  it). Deployed.
- **Architecture clarification that reframed the stakes:** the **DOCX opened in real Word is the
  faithful, primary deliverable and is already perfect** (byte-faithful + Arial is a standard Office
  font). The **PDF export is the only LibreOffice-rendered artifact** — a *convenience* export. The
  **on-screen preview is mammoth DOCX→HTML with styling/colour dropped** (`generator/previewBundle.ts`),
  NOT LibreOffice. So chasing pixel-parity-with-Word for the PDF is overkill; "very good" suffices,
  and Arial gets it there. **Rule:** before optimizing "fidelity," identify WHICH rendering path is
  authoritative — don't burn effort making a secondary/derived artifact match a reference that the
  primary artifact already satisfies.
- Considered and rejected: Microsoft **`markitdown`** — it extracts documents TO Markdown for LLM
  ingestion (opposite direction; Markdown is disqualified by SPEC §0; for DOCX it wraps the same
  mammoth the preview already uses). A **same-engine regression gate** (freeze the Arial LibreOffice
  output as golden, diff future output vs it) is the only workable automated PDF gate — **parked** as
  optional, since the DOCX-in-Word path is already faithful and the PDF is secondary.

**Also (item ②):** admin-catalogue e2e coverage (#7) is authored + type-checked + `playwright test
--list` 4/4, but **not yet executed** (Playwright is dev-only; needs a running app + seedable DB via
`E2E_BASE_URL`+`DATABASE_URI`). The 3 Word `.oracle.pdf` + DOCX are staged on the Rock at
`/srv/lesson3/out/ares-demo` for whenever the regression gate or the e2e run happens.

---

## 2026-06-30 (eve) — Post-hardening track order agreed: coverage before fidelity assets

After the admin-UX de-duplication batch (Lesson Plans catalogue + Lesson Bundle Versions title cell,
`cbec573`..`76d6bbc`) and GFS backup activation, discussed what's actually left before calling the
system "safe at scale" and agreed an explicit order (full detail + rationale in
`docs/NEXT-SESSION.md` "Next-session plan"):

1. Re-confirm the full gate (`test:unit`+`test:int`+`test:http`/CI) is green on current HEAD before
   building anything else on top of it — cheap, no human dependency, and a lot has landed since the
   last cited green run.
2. e2e coverage for the new custom admin views (Lesson Plans catalogue + version-list title cell) —
   these are custom replacements for Payload's stock list views with ZERO direct test coverage, the
   top item on the production-readiness risk list, and a regression here could silently break the
   admin repair surface while tests stay green. Bounded effort, no human dependency beyond the
   running dev+Postgres stack.
3. The formal PDF fidelity gate, then 4. fidelity probes in CI — deliberately AFTER the coverage win
   because both need the same staged oracle DOCX/PDF assets (human-dependency-gated: 3 oracle PDFs
   from the user, ARES oracle data possibly from Mark), so they're grouped and done once the assets
   land rather than blocking on them first.
5. Everything else (rollback fault-injection test, log archival, dev-only audit advisories) is
   low-value cleanup, picked off opportunistically, not gating.

**Rule of thumb worth keeping:** when ranking "what's left before production," sequence by (a) what's
cheapest to re-verify and unblocks trust in everything after it, (b) highest real risk that's
bounded/self-directed, then (c) higher-setup work gated on an external human dependency (assets,
another person) — group items that share the same dependency so the asset-gathering isn't repeated.

---

## 2026-06-30 — ARES v2 data re-review: DQB phase vocabulary resolved; 2 export gaps remain

Reviewed the updated ARES v2 corpus (`markknit/cbe-generation-system` commit `3b75018`, 42
sub-strands) against our own ingest checkers (`contractDrift` + `validateGeneratable`). Went from
**42/42 files blocked → 0/42 blocked**: `framework[].phase` is now 100 % canonical (1920/1920) and
the `safety<N>otes` key corruption is gone (0 remaining). Regenerated DOCX confirmed — Biology
SS1.1 renders 60/60 phase cells correctly coloured (was 45 grey).

**DQB phase vocabulary — DECIDED (don't reopen).** The earlier open question ("is *DQB Update* a
distinct phase needing a 6th vocabulary value?") is resolved in favour of the **existing five
values**. Per ARES (the originating teachers, NGSS storyline model): the Driving Question Board is
a persistent classroom artifact and *every* visit — Creation, Update, Closure, Completion, Revision
— is the **same pedagogical activity type**, so all variants collapse to the single canonical
`"Driving Question Board (DQB) Creation"`. **No change to our `phases` enum, the generator's
`PHASE_KEY`/`PHASE_COLOUR`, or `SCHEMA.md`.** Our controlled vocabulary stays the 5-value set.

**Lesson — verify against the artifact you actually consume.** ARES's remediation summary
(saved alongside as `ARES-v2-remediation-summary.docx`) marked all four findings fixed, but two were
verified against the wrong target and still fail on the **JSON exports** we ingest:
- `schemaVersion` was added to the `.js` *source* (`generators/data/*_data.js`) but the
  **JSON-export step drops it** — all 42 `data/outputs/v2/**/*.json` still lack a top-level
  `schemaVersion`. Non-blocking for us (ingest doesn't gate on it; `contractDrift` only warns).
- The missing field is `LESSONS[].summaryTablePrompt.explained` (per-lesson summary block), still
  absent on Physics SS3.4/L8 and SS4.2/L7 — *not* `SUMMARY_TABLE.lessons[].explained` (which is
  complete and is what ARES checked). Renders a blank "How does this explain…" cell; the docx
  Packer tolerates the `undefined`, so it degrades silently rather than crashing.

Both are minor/non-blocking; the corpus is ingestable today. Full write-up in
`docs/ARES-v2-followup.md`.

**Update (commit `fd476b4`, "Address partner re-review"):** both residual items resolved at the
right target — `schemaVersion: '1.0.0'` now in all 42 **JSON exports** (first top-level key), and
`LESSONS[].summaryTablePrompt.explained` authored for Physics SS3.4/L8 and SS4.2/L7 (affected DOCX
regenerated). Full re-run: **42/42 clean — 0 blockers, 0 contract drift, 0 missing fields.** All
four original findings + both follow-up corrections closed; the v2 corpus conforms fully to
`ares-contract.schema.json`. Generator/SCHEMA.md unchanged throughout.

## 2026-06-30 (eve) — Codex review of the #9 ops layer (8.1/10): 8 fixes applied, 2 deferred

Codex reviewed the ops layer (no Critical/High). Applied 8 findings (commits `df88935` + a docs commit);
CI green incl. the new probe; the 3 script behaviour changes Rock-verified.

**Applied:**
- **Restore identifier injection (Med).** `restore-db.sh` now validates `--into` as a plain Postgres
  identifier (`^[A-Za-z_][A-Za-z0-9_]{0,62}$`) before it's interpolated into `DROP/CREATE DATABASE`.
  Operator-only, but it runs with DB-owner rights during recovery. (Verified: a `"; DROP …` name is rejected.)
- **Heartbeat false-positive (Med).** `heartbeat.sh` now treats ONLY 2xx/3xx as healthy (`/`→307 is the
  normal redirect). A 5xx (Payload/Postgres broken) no longer pings → the dead-man's-switch fires instead
  of monitoring falsely reporting green. (Verified: closed port → status 000 → no ping; 307 → ping.)
- **Unbacked deploy (Med).** `deploy.sh` REFUSES when backups aren't configured (no snapshot, no migrate),
  overridable with `ALLOW_UNBACKED_DEPLOY=1`. The prior code only warned — the comment had claimed
  "no snapshot, no migrate," so this aligns behaviour with intent. (Verified: dies before `compose up`.)
- **CI fidelity coverage (Med, partial).** Added the DB-free `contract-check` probe (ingest contract-drift
  is a hard gate) to `ci.yml`. The other three probes (`ingest-extract-check`, `format2-check`,
  `adapter-fidelity`) need the stakeholder oracle DOCX (`ARES_DEMO_PATH`, not in the repo) → staging those
  in CI is a tracked follow-up (pairs with the PDF-fidelity-gate item).
- **Silent rate-limit misconfig (Low).** `rateLimit.ts` `positiveIntEnv()` replaces `Number(env) || default`
  (which swallowed `0`/`NaN`/garbage back to the default — an operator setting `…_MAX=0` thought they'd
  locked it down but got 20). Now throws at boot on a malformed override (fail-fast, like the
  PAYLOAD_SECRET guard).
- **Undeclared dep (Low).** `drizzle-orm@0.45.2` is now a DIRECT dependency (payload.config imports
  `drizzle-orm/pg-core` for the `rate_limit_counters` `beforeSchemaInit` table; it was only transitive).
- **Test cleanup masks failure (Low).** `rateLimit.int.spec` `afterAll` guards `if (!payload) return` so a
  failed boot doesn't throw a secondary TypeError over the real error.

**Deferred (with rationale, tracked in NEXT-SESSION):**
- **Forced-rollback test for the transactional version endpoints (Med).** Codex suggests a
  `process.env.TEST_FAIL_AFTER_*` seam. Still declining to bake a test-only branch into the PRODUCTION
  endpoints — it's the one fix that puts test scaffolding in shipped code. Remains the top tracked
  follow-up; would need a cleaner mockable seam or a Rock/CI fault-injection harness.
- **O(n) semver allocation (Low).** `nextSemverForPlan` reads all of a plan's versions to compute max+1.
  Fine for the current corpus; a counter-row/sequence is a scale optimization that trades away the
  deliberate max+1 + unique-index design (premature now). Tracked as a scale follow-up.

## 2026-06-30 — Backlog #9 OPS DONE: backups, structured logging, heartbeat, CI (+ a push-vs-migrate lesson)

The last big readiness gap. All four landed; **GitHub Actions CI is green** (the canonical gate now runs
off-box) and the Rock is synced (`f4d73ee`, healthy). Operator setup steps (keys, OAuth, cron, Healthchecks
URLs) are documented in the new **`docs/OPS.md`**, not done here (they need the user's accounts).

**Decisions (the "what" + "why"):**
- **Backups — Postgres dump → `age` → `rclone` to Google Drive, NOT a managed service.** `pg_dump -Fc`
  (in the postgres container) → `age` encrypt on the host (recipient public key on the box; the private
  identity is held OFF-box, so a Rock compromise can't decrypt past backups) → `rclone` to the user's
  Google Drive (their existing 2TB One/AI plan; Drive isn't S3 so `rclone` is the tool, with a one-time
  headless OAuth). Two streams: `daily/` (30d) + `premigrate/` (90d). `scripts/{backup,restore,deploy}.sh`.
  `deploy.sh` snapshots BEFORE `compose up` so a bad migration is recoverable. Verified end-to-end on the
  Rock (dump→encrypt→upload→prune→restore, lesson_plans=13) with a throwaway key + a local stand-in remote.
- **Structured logging, NOT Sentry (user chose "simpler").** Payload's logger is already pino (JSON);
  we added env-tunable `LOG_LEVEL`, logged export-job failures with context, and bounded+rotated the
  container log stream via Docker's json-file driver (`max-size 10m`, `max-file 5`). Accepted trade-offs
  (documented): no auto-alerting/grouping and **no client-side error capture** — post-mortems are by
  grepping JSON logs, liveness is the heartbeat. Nothing leaves the box; no new dep. Verified live (pino
  JSON with levels confirmed on the Rock).
- **Monitoring — push/dead-man's-switch heartbeat.** The Rock is Tailscale-only, so an external pull-pinger
  can't reach it: instead the Rock pings OUT (`backup-db.sh` → `HEALTHCHECK_BACKUP_URL` on success;
  `scripts/heartbeat.sh` cron → `HEALTHCHECK_APP_URL` only when the app answers). If pings stop, the
  provider (Healthchecks.io free) alerts. All three branches tested on the Rock.
- **CI — GitHub Actions mirroring the Rock procedure.** `.github/workflows/ci.yml` on push/PR to main:
  `docker compose up --build` (postgres + one-shot migrate + app + gotenberg — also runs `next build` +
  applies migrations) then `test:unit`+`lint`+`audit:prod`+`test:int`+`test:http` via the deps image.
  Synthetic inline secrets + fully ephemeral stack → no repo secrets. ~3.5 min green.

**The lesson (CI earned its keep on day one): push vs migrate divergence.** The new shared rate-limiter
table (`rate_limit_counters`, created by migration `20260629_213000`) was **invisible to Payload's dev/test
`push`** because it isn't a collection. Manual Rock testing had MASKED this (the Rock's `lesson3_test`
persisted and had the table hand-created); a clean CI run exposed three layered failures:
1. **Push drops unmanaged tables** → `relation "rate_limit_counters" does not exist`. Fix: register the raw
   table in the drizzle schema via a `postgresAdapter.beforeSchemaInit` hook (columns mirror the migration),
   so push creates+keeps it while migrate still creates it in prod. **Rule: any raw (non-collection)
   table created by a migration MUST also be registered via `beforeSchemaInit`, or push will drop it.**
2. **migrate + push on the same DB conflict** → push re-adds an existing FK (`constraint … already exists`).
   So `test:int` must build its DB ONE way, not both.
3. **Concurrent push race** → parallel vitest workers each push the schema to the shared DB and collide
   (`users_sessions already exists`). Fix: `fileParallelism: false` (int specs run sequentially; first push
   creates, rest no-op). **Rule for `test:int`: let push build an EMPTY `lesson3_test` (do NOT pre-migrate
   it) and run the spec files sequentially.** The OLD Rock procedure (pre-migrate `lesson3_test`) is
   superseded — recreate it empty and let push build it, matching CI.

**Left to the user (setup, not code):** generate the `age` key on the Mac + give the public recipient;
`rclone` Drive OAuth; create two Healthchecks.io checks → set the two URLs; add `BACKUP_*`/`HEALTHCHECK_*`
to `.env`; install the backup + heartbeat crons. **Deferred (small):** durable cross-deploy log archival;
periodic `payload-jobs` row cleanup; orphaned `rate_limit_counters` rows for deleted users; the
transactional-rollback failure-path test (Codex Medium); `actions/checkout` Node-20 deprecation warning.

## 2026-06-29 (late) — Shared Postgres-backed rate limiter (readiness #9); + a `payload migrate` hang gotcha

Closed the "shared rate limiter" backlog item. Gate green on the Rock: **test:unit 39/39, test:int 18/18
(+3, the new limiter spec), test:http 22/22, audit:prod GREEN**; migration applied to `lesson3` +
`lesson3_test`; app healthy. Commit `ed2fd6b`.

- **Why.** `lib/rateLimit.ts` was an in-memory sliding window keyed per `(bucket, user)` — correct only
  on the single-box Rock. Under horizontal scaling each replica keeps its OWN map, so the effective budget
  is `max × replicas` and a restart resets it. Move the state to a SHARED store so the limit holds across
  processes.
- **Store: Postgres, not Redis.** New `rate_limit_counters` table (migration `20260629_213000`), one row
  per `(bucket, user)` key, reused each request. Redis would be a new container + client + env for one
  small feature; Postgres is already the single datastore and keeps the system single-runtime (CLAUDE.md).
- **Algorithm: fixed-window counter, not a sliding log (deliberate trade-off).** `window_start =
  floor(now / windowMs) * windowMs`; a single atomic `INSERT … ON CONFLICT DO UPDATE` bumps the count
  within the current window or resets it, `RETURNING` the new count. A fixed window can admit up to ~2×
  the budget across ONE boundary — immaterial for an abuse guard with generous per-user budgets — and it
  keeps the shared path one statement instead of array-pruning a per-hit log (the sliding-log alternative
  needs a row per request + cleanup). The count is incremented even when over budget (harmless: bounded by
  in-window volume, resets next window), so `Retry-After` is derived from the window boundary, not the count.
- **Atomicity.** `INSERT … ON CONFLICT DO UPDATE` takes a row lock, so concurrent requests for the same key
  serialise — no lost increments. Not a Payload collection (limiter bookkeeping, not domain content, must
  not show in the admin UI) → created by raw SQL in a hand-written migration, no `payload-types` change.
  `enforceUserRateLimit` is now **async** (one roundtrip via `req.payload.db.drizzle.execute(sql\`…\`)`);
  the 3 export/preview call sites await it. Int spec `tests/int/rateLimit.int.spec.ts` drives it directly
  with a minimal `{ user, payload }` req: allows up to max → 429 + `Retry-After`, per-user isolation, 401
  unauth. Cleanup of orphaned rows (deleted users) is a noted non-blocking follow-up — bounded by distinct
  users, so harmless at this scale.
- **OPS GOTCHA (cost time, logged for #9 CI).** A schema change normally rides the compose one-shot
  `migrate` container, which targets `lesson3` only. For `lesson3_test` the procedure runs `npx payload
  migrate` in the deps image — and it **HUNG** (no migration output, container "Up" indefinitely; the pg
  pool keeps the event loop alive and the CLI never exits in this invocation). Rather than fight it, the
  table is just `CREATE TABLE` SQL — applied it (and a `payload_migrations` row) to `lesson3_test`
  directly via `docker compose exec postgres psql`. Lesson: for a standalone-table migration, applying the
  raw SQL to the test DB is faster and more reliable than the migrate CLI; a real CI migrate step (#9)
  should run the actual `migrate` against a fresh DB so this path is exercised properly. (`lesson3` itself
  migrated cleanly via the compose `migrate` container — only the manual `lesson3_test` path hung.)

## 2026-06-29 (late) — Semver retry-on-conflict (Codex #4) + deliberate vitest bump; both Rock-verified

Closed the two small remaining code items from the hardening backlog. Gate green on the Rock with
vitest 4.1.9: **test:unit 39/39, test:int 15/15, test:http 22/22, audit:prod GREEN (exit 0)**; app
healthy (`/`→307, graphql→404, migrate nothing pending).

- **Semver retry-on-conflict (`eaec3ed`).** Two concurrent `POST /:id/save-as-new` on the same plan can
  both compute the same next patch (`nextSemverForPlan` = max-semver+1) before either commits; the loser
  hit the unique `lessonPlan_semver_idx` index and surfaced as a 500. Integrity was always protected (the
  index rejects the dup) — this just turns the rare race into a transparent retry. **Key constraint:** the
  conflict aborts the Postgres transaction, so you CANNOT recompute-and-retry inside it (Postgres requires
  a rollback first). So each attempt is its OWN transaction — the whole `initTransaction → create →
  (optional delete) → commit` block is wrapped in a bounded `for` loop; on conflict it `killTransaction`s,
  loops, and `nextSemverForPlan` reads the now-committed competitor row to pick a higher patch. Bounded to
  `SEMVER_CONFLICT_RETRIES = 4`.
- **`isSemverConflict` is deliberately NARROW (Codex re-review, Medium).** First cut matched any SQLSTATE
  `23505` or generic "duplicate key value" — too broad: it would mask an UNRELATED uniqueness bug behind 4
  retries and slow diagnostics. Narrowed to match ONLY `lessonPlan_semver_idx`: the pg error's
  `.constraint` field, the drizzle-wrapped `.cause.constraint`, or the index name in the message (case-
  insensitive). A bare `23505` no longer retries. Rule: **a retry predicate must name the exact condition
  it masks; everything else must surface immediately.** Unit-pinned in `tests/unit/semverConflict.spec.ts`
  (a `users_email_unique` `23505` asserts `false`). `isSemverConflict` lives in `lib/semver.ts` (type-only
  payload import → DB-free, unit-testable without the endpoint/DB import chain).
- **DEFERRED (Codex, Medium): a transactional-rollback failure-path test.** The transactional
  save-as-new/make-official are covered on the happy path but not on a forced 2nd-step failure (the prior
  bug — `4614958` — was partial success after step 2). A real rollback test needs a fault-injection seam
  (a valid Payload `delete` won't fail on its own) and only runs on the Rock. Left as a follow-up rather
  than bolt a test-only hook into the production endpoint. Tracked in NEXT-SESSION.
- **vitest 4.0.18 → 4.1.9 (`2599bb2`).** Clears the dev-only critical advisory GHSA-5xrq-8626-4rwp
  (arbitrary file read/exec when the **Vitest UI server** is listening). Never exploitable here — we only
  ever run `vitest run`, never `--ui` — but bumped deliberately. The bump restructured vitest's dep tree
  (npm removed ~157 packages). Exact pin (repo's no-caret convention). `audit:prod` stays GREEN; the 5
  remaining moderate esbuild/drizzle-kit advisories are transitive (`fixAvailable:false`), below the
  `--omit=dev --audit-level=high` gate.
- **`/simplify` (4 agents) + `/code-review` (Codex-style) both run on the delta.** Simplify found it
  essentially clean (one applied micro-polish: early-return in `isSemverConflict` before the regex);
  skipped the "extract a shared `createVersionWithSemver` helper" altitude suggestion as premature
  abstraction — there is exactly ONE caller today that allocates a computed semver + creates a version
  (ingest is conflict-free at `1.0.0`). The review's narrowing finding (above) was the substantive catch.

## 2026-06-29 (eve) — Codex re-review: make the "atomic" ops truly transactional + mandatory stale guard

Codex re-reviewed `d45360b` (7.8/10, no Critical/High). Correctly flagged that the "atomic" delete-source
/ delete-previous were **single-handler, not transactional** — a failed second step left the first
persisted while the request errored. Fixed (`4614958`), gate green (test:http 22/22, test:int 15/15):

- **Transactions (#2/#3).** `save-as-new` (create + optional delete) and `make-official` (pointer move +
  optional delete) now run inside one Payload transaction via `initTransaction`/`commitTransaction`/
  `killTransaction` (the built-in op pattern). Either step failing rolls back the whole operation.
- **Stale guard mandatory (#1).** `save-as-new` now REQUIRES a parseable base `updatedAt` → 400 if
  missing/invalid (was silently skipped), 409 if it predates the source. The real client always posts it
  (full form content); this closes the omit-to-bypass hole at the write boundary.
- **#5.** `LessonControls` leaves Official-ness `null` (unknown) on a failed plan fetch → Save won't
  offer delete-source on a transient error (was defaulting to "deletable").
- **#6.** NEXT-SESSION's old "editing forks a working copy" description marked SUPERSEDED by Stage 2.

**Deferred (noted in the commit):** #4 — concurrent `save-as-new` on the same plan can still surface the
unique `(lessonPlan, semver)` index error as a 500 (the transaction doesn't serialize semver allocation;
integrity is protected, it's a UX/retry gap). Rare on the single-box Rock → retry-on-conflict is a
follow-up. #7 — dev-only `vitest` critical + `esbuild` moderates (below the prod gate); bump `vitest`
deliberately later.

## 2026-06-29 — Atomic version replace/promote + /simplify cleanup; Stage 2 editing model COMPLETE

Two follow-ups landed, plus the /simplify pass that preceded them. The Stage 2 editing model is now
complete end-to-end. Gate: **test:http 22/22, test:int 15/15**, app healthy.

- **Atomic delete-source on save-as-new (`a085...`→`7b4290f`).** `POST /:id/save-as-new?deleteSource=true`
  creates the new candidate AND deletes the version you edited from in ONE handler — replacing the old
  create-then-separate-client-DELETE (which could orphan on interrupt). The Official is never deleted
  (server re-check + `enforceOfficialNotDeletable`). `LessonControls` determines Official-ness up front
  (one cheap plan read) and prompts "…and delete the one you're editing?" only for a deletable candidate.
- **Make Official atomic delete-previous (Stage 2b, `a1bb268`).** `POST /:id/make-official?deletePrevious=true`
  captures the current Official, moves the pointer, then deletes the now-superseded version in the same
  handler (never the promoted one; no-op if none). `EditActions` prompts "…also delete the previously-
  Official version? (Cancel keeps it.)". This completes the delete-prompt model for the official-
  replacement case.
- **/simplify cleanup (`bf9bd53`).** Removed the now-unreachable `enforceVersionImmutable` +
  `enforceVersionConcurrency` beforeChange hooks (dead under `update:() => false`); `save-as-new` reuses
  the exported `isOfficialVersion`. The model lives in one place: the access gate (immutability) +
  save-as-new (field-split + stale-check) + make-official (pointer). `enforceVersionFieldSplit` stays
  (preview uses it directly). Kept: the `editing` mirror in LessonControls (useForm().disabled
  reactivity via use-context-selector isn't guaranteed); serial docx+pdf download (safer for two browser
  downloads).

**Editing model status — COMPLETE:** Edit (open admin editor, read-only) → Edit unlocks → Save = new
candidate (never publishes) with optional atomic delete-source → admin Make Official moves the pointer
with optional atomic delete-previous. Versions immutable to authenticated users; only system/overrideAccess
+ these endpoints write. test:http covers save-as-new (editor/teacher/structural/stale/deleteSource) and
make-official (deletePrevious/editor-denied).

## 2026-06-29 — Stage 2 editing model ENFORCED server-side (Codex review #1–#6 addressed)

Stage 2a shipped the control-row UI but left the model only CSS-deep (native Save hidden, versions still
mutable via the API). A Codex review flagged that gap (#1, High) + related items. All actionable findings
closed; commits `cc321b0` (core) + `faa06bc` (test fix). Gate green: **test:http 18/18, test:int 15/15**,
and a live `PATCH /lesson-bundle-versions/8` as Editor → **403** (title unchanged).

- **#1 (High) — versions are now immutable to ALL authenticated users.** `lessonBundleVersionUpdate
  → () => false` (`access/versioning.ts`). There is no in-place edit: authoring a change goes only
  through `POST /:id/save-as-new`, which writes with `overrideAccess` after the field-split. Trusted
  system paths (ingest/migrations) keep writing via `overrideAccess` (bypasses access). Delete opened to
  Editor+ for NON-Official candidates (the Official one stays protected by `enforceOfficialNotDeletable`)
  so the delete-source cleanup works. The beforeChange hooks (`enforceVersionImmutable/FieldSplit/
  Concurrency`) are now BACKSTOPS for the authenticated path (never reached under update:false); the live
  field-split + stale-check run inside `save-as-new`.
- **#2 — public Edit no longer forks on open.** `EditActions` links straight to the admin editor for the
  selected version; the `/fork` endpoint is retired. A DB row is created only on Save.
- **#3 — stale-source guard.** `save-as-new` rejects a submitted base `updatedAt` older than the source's
  current value → 409 ("reload before saving").
- **#4 — body guards.** `save-as-new` reuses `parsePreviewCandidate` (Content-Length pre-check, byte cap,
  JSON + object-shape).
- **#5 — delete-source prompt.** After Save, `LessonControls` offers to delete the version you edited
  from, but ONLY when it is not the live Official.
- **#6 — tests.** Reworked the int spec for the new model (in-place update rejected for any role;
  overrideAccess still works; removed the old update-path field-split/concurrency specs — those semantics
  moved to save-as-new). Added `test:http` save-as-new coverage: Editor candidate created + Official
  pointer unchanged + source untouched; Teacher 4xx; Editor structural change 4xx; stale base 409.
- **#7 (Low) — API-tab CSS kept.** Payload's `hideAPIURL` is all-roles, not role-aware, so a CSS rule
  (version-pinned comment) remains the only way to keep the API tab for Site Admins only.

**Still open (Stage 2b residue):** the "delete the previously-Official version" prompt after Make Official
isn't built yet (Make Official lives on the public `EditActions`); and the dormant beforeChange hooks
could be pruned in a later /simplify pass.

## 2026-06-28 (late) — Editing UX redesign: AGREED MODEL (Stage 2) + Stage 1 admin tweaks landed

**Agreed editing/versioning model (supersedes SPEC §5's persistent-working-copy model — to BUILD in Stage 2):**
- **Edit** (any version) makes the form editable per role (Editor = prose; Admin = +structure/META). **No DB row** is created on Edit.
- **Discard Edits** / leaving → in-progress edits thrown away; nothing persists.
- **Save** (any Editor+) writes a **new candidate version** (next patch). **Never moves the Official pointer.** If the source you edited is **not** the current Official, prompt *"Delete source vX? [Delete][Keep]"*.
- **Make Official** (Site Admin, or Subject-Grade Admin for THAT subject-grade — only) is the sole pointer mover; separate click; then prompt *"Delete the previously-Official version? [Delete][Keep]"*.
- **Concurrency:** Save warns if the source changed since opened. **Visibility:** teachers see only Official; Editors/Admins see candidates in the admin list. **Delete rights:** Editor+ may delete a non-Official candidate; Official is never deletable.
- Implementation shape: edit the existing version's form in place but never write back — a custom Save calls a `save-as-new` endpoint (create candidate, no pointer move); native Save replaced; retire the fork-on-open endpoint; keep the public "Edit" as a link into the admin edit (no fork). Hardest piece: the read-only↔edit toggle in the admin doc view (to research first). Sub-decisions locked: A keep public Edit (as link), B warn on stale save, C keep Make-Official for rollback.

**Stage 1 (standalone admin edit-view tweaks) — DONE 2026-06-28 (`e84ce78`), Rock-verified.**
- "Semver" field **label → "Version"** (data/name stay `semver`).
- **Hide META + UNIT** for users who can't edit them: `admin.condition` mirroring `canEditStructure`, evaluated client-side (dependency-free `canEditStructureClient` in `fields/lessonContent.ts`). Editors don't see them; Subject/Site Admins in scope do. Server access unchanged; the field-split hook still preserves META for Editors on write.
- **API document tab → Site Admins only:** `AdminHeaderMenu` renders a conditional `<style>` hiding `.doc-tab[href$="/api"]` for non-Site-Admins (the admin header is on every admin page incl. the doc view). The API endpoint stays access-controlled regardless.
- **Last Modified / Created → right sidebar** under "Version": new `VersionTimestamps` UI field (reads form state, no DB column; registered in importMap); native `.doc-controls__meta` hidden **scoped** via `.collection-edit--lesson-bundle-versions` so other collections keep theirs (the first selector `.collection-lesson-bundle-versions` was wrong — corrected `80c5d94`). Also moved the public lesson-view Edit button into the Download row (`80c5d94`).
- Verified: edit page 200 for Editor + Subject-Admin (field config + importMap valid), API-hide style present for both; test:http 14/14, test:int 17/17. Client-rendered specifics (META hidden, Version label, sidebar timestamps) + Site-Admin-sees-API need an eyeball.

## 2026-06-28 (late) — Unified top nav across both surfaces + avatar dropdown

**Outcome.** The frontend header and the admin header now render ONE shared `AppNav`
(`src/components/AppNav`), so the two surfaces are identical: **Lessons · [Manage] · Guide · avatar**.
`Manage` (→`/admin`) shows only for `canUseAdminPanel` users (Editor/Subject/Site Admin); Teachers get
`Lessons · Guide · avatar`. The two-letter avatar is now a dropdown (`src/components/UserMenu`, client):
line 1 = role type (`userTypeLabel`: Teacher/Editor/Subject Administrator/Site Administrator), line 2 =
login email, line 3 = **Log Out** — replacing the old standalone username text + visible logout button.
Retired the now-unused `Avatar` + `LogoutButton` components (absorbed by `UserMenu`). Commit `e135de5`.

**Consistency mechanism.** Both surfaces use the SAME class names (`.app-nav`, `.app-nav__link`,
`.user-menu*`) with identical sizing (font-size, avatar dimensions, dropdown), differing only in theme
color tokens — frontend `(frontend)/styles.css` (CSS vars) vs admin `(payload)/custom.scss` (Payload
`--theme-*`). Supersedes the 2026-06-24 "consistent user menu" entry, which still had each surface
showing a different cross-link (frontend "Manage" vs admin "Lessons") + a standalone logout.

**Verified on the Rock via real logins** (creds held in private assistant memory, NOT the repo — see
NEXT-SESSION "passwords are NOT in the repo"): GET `/` as Teacher → `Lessons,Guide` + avatar (no
Manage); as Editor → `Lessons,Manage,Guide` + avatar; GET `/admin` as Editor → same nav inside
`lp-admin-header`. Build clean, test:http 14/14, test:int 17/17. (Dropdown contents + visual clipping
are client-render/visual — eyeball on `/admin`.)

## 2026-06-28 (late) — Codex re-review reconciled: native doc-locking reframes #4; upload pre-guard + audit:all added

External re-review (8 findings, 7.5/10). Most re-confirm the tracked backlog; reconciliation:

- **#1 (claimed "Medium live risk" — DOWNGRADED to Low, reframed).** The new `enforceVersionConcurrency`
  guard skips when `data.updatedAt` is absent, so a raw REST partial PATCH could bypass it. BUT the
  PRIMARY guard for concurrent ADMIN-UI editing is **Payload's native document locking**
  (`lockDocuments`, default-on; we don't disable it — verified live: the `payload-locked-documents`
  collection exists on the Rock with an active lock). Native locking stops a second editor saving over an
  open doc in the admin UI — the real edit surface. Our hook is **data-layer defense-in-depth** for the
  REST/Local-API surface. Deliberately NOT made mandatory: forcing a base on every authenticated update
  would 409 any caller (incl. the native admin form, which we have not confirmed submits `updatedAt`)
  that omits it — and the admin surface is already locked, so the residual (a trusted Editor issuing a raw
  partial PATCH without a base) is a low, accepted gap, not a silent admin clobber. Clarified in the hook
  doc-comment. (Knowledge-currency win: reading installed Payload source surfaced the native-locking
  layer both the reviewer and the original #4 work had overlooked.)
- **#6 (Low) — DONE.** `uploadBundles` buffered the whole multipart body (`req.formData()`) before the
  per-file caps. Added a Content-Length pre-parse 413 guard (`MAX_BODY_BYTES`), matching the existing
  `previewParse` idiom. Site-Admin-only, so low, but cheap defense-in-depth.
- **#7 (Low) — partially addressed.** Added an `audit:all` script (`npm audit --audit-level=moderate`)
  for full-audit visibility alongside the gating `audit:prod`. It is expected-RED (dev-only `vitest`
  critical + `esbuild`/`drizzle-kit` moderates, all `fixAvailable:false`); not a gate.
- **Already tracked, no new action:** #2 export dedupe is check-then-queue (not atomic) — true-concurrent
  bursts can still double-queue; acceptable on the single-box Rock (autoRun limit 2 + artifact cache make
  completed repeats free); an advisory-lock/unique-key upgrade is a scale follow-up. #3 per-process
  rate-limiter = the explicitly-remaining shared-limiter residual. #4 subject-admin-per-grade uniqueness
  is hook-only = Bucket A **#10 deferred** (needs a relation-table representation change). #5 browse
  `pagination:false` = the documented #8 trade-off (fine for hundreds; revisit at thousands). #8 lint
  warnings (mostly `any` in tests + generated-migration unused args) = known hygiene, not addressed.

## 2026-06-28 (late) — Readiness #4 LANDED: optimistic concurrency on working-copy edits (Rock-verified)

**Outcome.** Two editors opening the same Not-Official version no longer silently clobber each other
(last-write-wins). New `enforceVersionConcurrency` beforeChange hook (before the field-split) rejects a
stale overwrite with 409. Commit `699bd9f`. **test:int 17/17** (+2), test:http 14/14, app live.

**Mechanism — reuse the resubmitted `updatedAt` as the base token (no migration).** The model has no
`lockVersion` anymore (versions are immutable; only working copies mutate), so the old "reject stale
lockVersion" is obsolete. The edit path **resubmits the version it loaded, including `updatedAt`** —
which is already whitelisted in `VERSION_EDITOR_KEYS` (that whitelist was the tell: the submitted data
carries `updatedAt`). The hook treats `data.updatedAt` as the client's base and compares to
`originalDoc.updatedAt`: if stored has advanced past the base, someone else saved → 409. The DB stamps a
fresh `updatedAt` at write, so the submitted value is read-only here. **Verified empirically (the int
test discriminates):** had `data.updatedAt` been stripped before `beforeChange`, the stale-overwrite
assertion would have failed; it passes, so the base threads through. A normal single-editor save is
unaffected (base == stored → allowed).

**Scope / honest caveat.** Authenticated UPDATEs only; system/`overrideAccess` paths (ingest,
migrations, fork, fixtures — no `req.user`) are exempt and carry no base. If a client does a partial
PATCH WITHOUT `updatedAt`, the check is skipped (can't compare) — it protects the resubmit-based edit
path (which is what the app/admin uses) without breaking partial-update API callers. Confirming the
native Payload admin form includes `updatedAt` in its PATCH (vs needing a hidden field to inject it) is
the one piece not headlessly verifiable here — but the whitelist + the live resubmit path indicate it
does. If a future check shows otherwise, add a hidden form field carrying the loaded `updatedAt`.

## 2026-06-28 (late) — Phase-5 residual: export-status readiness is VERSION-scoped (Codex #4 resolved; bind-first reverted)

**Outcome.** `exportVersionStatusEndpoint` (`…/:id/export/status?jobId=`) now documents its real
contract instead of pretending to be job-scoped. Readiness is **version/spec-scoped**: a cache hit
returns `{ready}` regardless of the supplied `jobId`, and the `jobId` binds the NOT-ready diagnostics to
the version (a stray jobId 404s only when there is no cached artifact). Commit `c044e4a`. **test:http
13/13.**

**The instructive part — bind-first is WRONG here.** Codex #4 offered two fixes: bind the jobId before
the `isExportReady` short-circuit, OR make the API explicit that readiness is version-scoped. I tried
bind-first (`37e51ea`) — and it **regressed the normal export poll**: completed `payload-jobs` rows are
PRUNED on completion, so the instant a fast job finishes its legit jobId is no longer findable →
`findByID` throws → 404. The export DOCX+PDF e2e went red ("Export job not found") on the happy path.
The old ready-first short-circuit existed precisely to mask the pruned-job window. So the correct
resolution is the SECOND option (document version-scoped readiness), not the first. Lesson: the
"obvious" stricter fix (bind before serving) assumed durable job rows; the queue prunes them, so
readiness MUST be answerable without the job. (NB: this contradicts an older residual note that said
completed jobs are "kept" — they are not in this config; the unbounded-retention cleanup item is moot.)

## 2026-06-28 (late) — Item ③ LANDED: preview CSP override fixed by scoping the baseline rule (curl + e2e verified)

**Outcome.** The preview endpoint now serves its intended strict standalone CSP (`default-src 'none';
style-src 'unsafe-inline'; frame-ancestors 'none'`) to the client — the global baseline CSP no longer
clobbers it. Commits `d45bdb9` (fix) + `5ad774f` (tightened test). Deployed + Rock-verified.

**Root cause (confirmed, not assumed).** A `next.config.ts` `headers()` CSP on `/:path*` **overrides**
(does not intersect) a route handler's own Response CSP — only one CSP header reaches the client. So the
preview's `default-src 'none'` Response header was being replaced by the baseline
`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`.

**Fix.** Split `headers()` into two rules: (1) the **non-CSP** baseline (nosniff, X-Frame-Options,
Referrer-Policy, DNS-prefetch) on `/:path*` — applies everywhere INCLUDING preview; (2) the baseline
**CSP** on a negative-lookahead source that excludes the preview path:
`'/((?!api/lesson-bundle-versions/[^/]+/preview).*)'`. With no next.config CSP on the preview path, the
endpoint's Response CSP is uncontested. Also added `frame-ancestors 'none'` to `PREVIEW_HEADERS`
(`default-src` does not cover `frame-ancestors`) so the preview is anti-clickjacking on the CSP layer
too (it already gets `X-Frame-Options: DENY` from rule 1).

**Verified by curl on the Rock (the step the original finding proved you cannot skip).** `next.config`
path-regex behaves as intended: `/login` (200) and the SIBLING `…/:id/export` (401) both carry the
baseline `object-src` CSP; `…/:id/preview` (401) carries **no** baseline CSP but still carries
`X-Frame-Options: DENY` — i.e. the lookahead excludes ONLY `…/preview`, not the whole
`lesson-bundle-versions` prefix, and not the non-CSP headers. Then `test:http` **13/13** with the
tightened assertion (preview 200 → `default-src 'none'` + `frame-ancestors 'none'` present,
`object-src` ABSENT). **Lesson reinforced:** Next path-to-regexp source matching (incl. the
negative-lookahead `((?!…).*)` form) works here under Next 16, but header *precedence* is config-version
sensitive — curl the live response, don't reason from the config. Backlog #3 CSP item now fully closed
except the deferred nonce-based `script-src` (needs Next hydration-nonce plumbing).

## 2026-06-28 (late) — Item ② LANDED: deps advisories cleared via npm `overrides`, NOT a version bump (Rock-verified)

**Outcome.** `audit:prod` is GREEN (exit 0; 0 high / 0 critical in prod deps). The two prod HIGHs
(undici, nodemailer) and the postcss MODERATE are gone. Commit `8e80e17`, deployed + verified on the Rock.

**The research flipped the approach (knowledge-currency rule paid off).** NEXT-SESSION framed this as
"find which Payload/Next release bumps the vulnerable transitives, then bump deliberately." Checking the
registry (not memory): **no such release exists.**
- **Payload 3.85.1 is already the latest stable** (only `3.86.0-internal.*` / `4.0.0-canary.*` exist) and
  it pins undici to an **exact `7.24.4`** — so no forward Payload stable carries an undici fix, and our
  pin can't move.
- **Next's latest (`16.2.9`) still ships `postcss@8.4.31`** (< the `>=8.5.10` fix) — bumping Next fixes
  nothing here.
So the deliberate, minimal-churn fix is **scoped npm `overrides`** in `app/package.json` (no framework
version change, no schema change, no migration):
```jsonc
"overrides": { "undici": "7.28.0", "postcss": "8.5.16", "nodemailer": "9.0.1" }
```
- **undici 7.24.4 → 7.28.0** clears 7 HIGH advisories (TLS-cert-validation bypass in SOCKS5, Set-Cookie
  header injection, WS DoS, SOCKS5 pool cross-origin routing, keep-alive response-queue poisoning,
  SameSite downgrade, shared-cache whitespace disclosure). Fix range is exactly `>=7.28.0`; stayed in the
  **7.x** line (NOT undici 8.5.0 — a major against Payload). Override also deduped the tree (was two
  undici copies: top-level 7.27.2 + payload's nested 7.24.4 → one 7.28.0; confirmed in the running
  container, nested copy gone).
- **nodemailer 8.0.10 → 9.0.1** clears the HIGH (`raw` message option bypasses
  `disableFileAccess`/`disableUrlAccess`). 9.0.1 IS the upstream fix. Assessed safe for us: the ONLY
  9.0.0 breaking change is strict TLS validation on *remote-content fetches* (attachment href/path URLs,
  OAuth2 token endpoints, proxy CONNECT) — none of which our vanilla SMTP path uses
  (`createTransport({host,port,secure,auth})` + `sendMail`, `skipVerify:true`). `@payloadcms/email-nodemailer`
  declares `nodemailer@^8` but the override is fine — the adapter only calls
  `createTransport`/`sendMail`/`verify`/`createTestAccount`, all stable across 8→9.
- **postcss 8.4.31 → 8.5.16** clears the MODERATE CSS-stringify XSS (fix `>=8.5.10`); same-major,
  build-time only.

**`npm audit fix --force` is still the wrong tool** (proposes destructive downgrades `next@9.3.3`,
`payload@3.79.1`) — overrides are the correct mechanism.

**Overrides are TEMPORARY — exit conditions (remove each when upstream catches up):**
- drop the **undici** override once a Payload release pins undici `>=7.28.0`;
- drop the **nodemailer** override once `@payloadcms/email-nodemailer` widens its range to allow `9.x`;
- drop the **postcss** override once Next ships `postcss >=8.5.10`.
Until then they pin three transitives, so re-check on every Payload/Next bump.

**What remains after the override (does NOT gate `audit:prod`, which is `--audit-level=high`):**
- **5 MODERATE** in the esbuild → @esbuild-kit → drizzle-kit → @payloadcms/db-postgres chain
  (`fixAvailable:false`; build/migration tooling, the esbuild dev-server-request advisory). Blocked on
  drizzle-kit dropping the abandoned `@esbuild-kit/*`; below the high gate.
- **1 CRITICAL but DEV-ONLY: vitest** (UI-server arbitrary-file-read/exec). We run `vitest run` with **no
  UI server**, and vitest isn't in the prod image — excluded by `--omit=dev`, so `audit:prod` stays
  green. Pre-existing, not introduced here. Bump vitest opportunistically if a fixed release lands.

**Verification (Rock, the canonical gate `test:unit`+`test:int`+`test:http`, all on the new image/deps):**
`docker compose up -d --build` (migrate found nothing pending; app `Up`, Restarts=0; `/`→307,
`POST /api/graphql`→404) · `audit:prod` **exit 0 (GREEN)** in the rebuilt `lesson3-deps` · **test:http
13/13** (incl. DOCX+PDF export end-to-end via Gotenberg, exercising the undici-backed fetch) · **test:int
15/15**. nodemailer-9 runtime: SMTP_HOST IS set on the Rock, so the app constructs the v9 transport at
boot and runs stably (no email/module errors); a `createTransport({jsonTransport})`+`sendMail` smoke in
the deps image returned a messageId under 9.0.1.

**Test-DB gotcha logged (cost a red herring).** The `test:int` Rock procedure's step-3 "rewrite
`test.env` DATABASE_URI" hides the credentials as "…". The committed `test.env` literal is
`lesson3:lesson3@localhost` — the **password is a placeholder, not the real one**. Swapping only the host
(`localhost`→`postgres`) yields `28P01 password authentication failed`, which *looks* like a deps
regression but isn't. Correct recipe: derive the URI from the real `.env` `DATABASE_URI` and swap only
the **db name** to `lesson3_test` (keep its real user:pass@host), then `git checkout -- app/test.env`.
This is exactly the kind of friction backlog-#6's one-command helper should remove.

## 2026-06-28 (eve) — Codex re-review (8/10) reconciled: 5 already-tracked, 2 net-new

External re-review after items ⓪/① landed. Confirmed the create-path Official-pointer fix (⓪) and the
new HTTP suite (①). Five of its seven findings are ALREADY tracked: deps (item ②), preview CSP override
(follow-up ③ + spawned chip), export in-flight dedupe (Phase-5 residual "Codex #5"), per-process
limiter + unthrottled status (Phase-5 residuals + backlog #1/#9), browse-200 (backlog #8). Two are
NET-NEW, both Low and now in NEXT-SESSION:

- **#4 (Low) — `/export/status` returns `{ready}` before binding `jobId`.** `isExportReady(spec)`
  short-circuits at the top of `exportVersionStatusEndpoint`, so once the artifact is cached ANY `jobId`
  (even a bogus one) gets `200 {ready}` without the version-binding check below ever running. NOT a data
  leak — the caller still needs READ access to the version (`authorizeVersionExportRequest`), and the
  status carries no job detail. It's a contract nit: the endpoint advertises job-specific status but is
  really *spec/version readiness*. (The HTTP suite already documents this: the stray-jobId 404 assert
  must use a COLD version.) Fix options: bind `jobId` before the ready short-circuit, OR make the API
  explicit that `jobId` is optional and status is version/spec readiness. Low priority.
- **#7 (Low) — default `npm test` omits `test:http`.** `test` is still the scaffold default
  `test:int && test:e2e` (Playwright, browser, dev-only). Adding `test:http` to that chain does NOT make
  a runnable gate — `test:http` needs the running container (`E2E_BASE_URL=http://app:3000`) while the
  Playwright `test:e2e` needs a dev server at `:3000`; they can't both pass in one environment. So the
  fix is DOCUMENTATION not a script merge: the canonical **Rock verification gate is `test:unit` +
  `test:int` + `test:http`** (Playwright `tests/e2e/` is dev-only, not in the gate). Recorded in
  NEXT-SESSION backlog #6. A proper CI runner that stands up the app + DB then runs all three is the
  real follow-up.

## 2026-06-28 — Item ② (dependency advisories) assessed + `audit:prod` script added; upgrade NOT done

**Decision: do not improvise the framework upgrade in this session — it is a deliberate, plan-first
task (CLAUDE.md: "pin versions; upgrade deliberately, not on the weekly release train").** Added the
`audit:prod` script (`npm audit --omit=dev --audit-level=high`, Codex's suggested CI gate) so the
upgrade is measurable; it is **expected-RED today** (see below) until the upgrade lands. No deps changed.

**Current state (pins: `payload@3.85.1`, `next@16.2.6`).** `npm audit --omit=dev` → **11 (7 moderate,
4 high)**, all FRAMEWORK-TRANSITIVE:
- **undici (HIGH ×7)** — TLS validation bypass, Set-Cookie header injection, WS DoS, cache poisoning,
  etc. Bundled under `node_modules/payload/node_modules/undici`. Fix = a Payload release whose undici
  dep is bumped past the vulnerable range — not an in-range patch of our pin.
- **nodemailer (HIGH, "no fix available")** via `@payloadcms/email-nodemailer` — message-level `raw`
  option bypasses `disableFileAccess/disableUrlAccess` (arbitrary file read + SSRF). We don't use the
  `raw` option (templated mail only), so not exploitable in our usage; still flagged until upstream.
- **postcss (MODERATE)** via `next` — XSS in CSS stringify output. Fix = a Next bump.

**CRITICAL: do NOT run `npm audit fix --force`.** Its "fixes" are destructive DOWNGRADES — it proposes
`next@9.3.3` (from 16) and `payload@3.79.1` (from 3.85). The right path is a deliberate, researched
Payload/Next version bump (read the release notes / installed source per the knowledge-currency rule),
then regenerate types/migrations ON THE ROCK if the schema shifts, `next build` + `test:int` +
`test:http` green, and finally `audit:prod` green. That is the whole of item ② and is the next task.

## 2026-06-28 — Item ① landed: real endpoint/authz e2e suite (`test:http`), Rock-verified

**Outcome.** Backlog #4/#6's "real preview/export/PDF/authz coverage + a `POST /api/graphql → 404`
regression assert" is delivered as a new HTTP e2e suite that drives the RUNNING app over the wire,
complementing the in-process Local-API `tests/int` suite. `tests/http/endpoints.http.spec.ts` +
`vitest.http.config.mts` + a `test:http` script; the stale starter scaffold
`tests/e2e/frontend.e2e.spec.ts` (asserted the blank Payload template) is removed. **13/13 green on the
Rock.** Commits `059b18d` (suite) + `847fdd7` (fixes).

**Coverage.** GraphQL gone (`POST /api/graphql` + `GET /api/graphql-playground` → 404); preview auth
(401), Teacher GET read-gated → 200 script-free HTML, Teacher POST → 404 (EDIT-gated), Editor POST
prose overlay → 200 (overlay visible in the rendered HTML), Editor POST structural change → 422; export
read-gated with NO Official/published gate — a Teacher exports DOCX and PDF **end-to-end** (cold GET 409
→ POST prepare → poll status → GET zip, PK magic), stray jobId → 404; Bucket-A invariants over HTTP
(⓪ create-with-pointer rejected + nothing persisted, #2 clear-pointer rejected + pointer intact).

**How it runs (a SECOND Rock test procedure, distinct from `test:int`).** Unlike `test:int` (Local API,
redirected to the disposable `lesson3_test` via `test.env`), the HTTP suite must hit the running app,
which serves the **live `lesson3`**. So it loads NO `vitest.setup.ts` (no `test.env` override), seeds the
shared role fixture via the Local API into `lesson3` (MARK-tagged + self-cleaning, exactly like the
verify-* scripts — verified zero residue after teardown), and talks to the app at `E2E_BASE_URL`
(`http://app:3000`, the compose service) authenticating with the login token via `Authorization: JWT …`
(token auth → no CSRF dance). Run:
```
docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
  -w /app --env-file .env -e E2E_BASE_URL=http://app:3000 lesson3-deps npm run test:http
```

**Two findings the e2e surfaced (first run was 11/13):**
- **Real (Low) — preview CSP override.** `next.config.ts`'s `/:path*` baseline CSP
  (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`) **overrides** (not
  intersects) the preview endpoint's own stricter `default-src 'none'` Response CSP — only the global
  one reaches the client (`Headers.get()` returned a single value, no `default-src`). The next.config
  comment claiming "combine by intersection" was wrong; corrected it. So the preview does NOT get its
  intended strict standalone CSP. Low risk (preview HTML is DOMPurify-sanitized + script-free), but a
  defense-in-depth gap → **follow-up:** scope the `/:path*` rule to exclude the preview path (and verify
  Next header precedence by curl). Test now asserts the directives actually deployed.
- **Test-only — warm-cache status probe.** The `/export/status` handler returns `{ready}` for ANY jobId
  once the artifact is cached (the `isExportReady` short-circuit precedes the job-binding check), so the
  stray-jobId 404 assert must query a COLD (uncached) throwaway version, not the warmed `fx.version`.

## 2026-06-28 — Bucket A ⓪ landed: create-path Official-pointer gap closed (deployed + Rock-verified)

**Outcome.** The CREATE-path sibling of Bucket A's #2 (the Codex re-review finding below) is closed,
deployed, and Rock-verified. `validateOfficialVersionPointer` now also rejects `officialVersion` being
set on an **authenticated create** (`operation === 'create' && req.user && data?.officialVersion →
throw`). System/`overrideAccess` paths (no `req.user`: ingest, migrations) stay exempt — and never set
the pointer on create anyway (the valid flow is two-phase: create plan → create version under it → set
pointer via update). Hook-only, **no migration**. Commits `68fc706` (hook + specs) + `ca826f1` (spec
cleanup-order fix).

**Tests.** Rebuilt the `#2` int spec two-phase (version created UNDER the throwaway plan, then the
pointer set via update) — replacing the old cross-plan shape that only passed via `overrideAccess` —
and added a guard spec asserting an authenticated `siteAdmin` create-with-pointer is rejected while the
system path creates pointer-less. `test:int` **15/15** on the Rock (`lesson3_test`); a **sanity-flip**
(neutralize the create guard → `if (false)`) fails **exactly** the new create-guard spec and nothing
else — the gate has teeth. App rebuilt on the Rock so the running container enforces it; migrate had
nothing pending; frontend healthy, `POST /api/graphql` still 404.

**Test gotcha recorded.** Because the rebuilt `#2` version now lives UNDER its plan
(`lesson_bundle_versions.lesson_plan_id` is NOT NULL), the cleanup must delete the child version
BEFORE the plan — deleting the plan first makes Payload null the version's `lesson_plan_id` and the
delete errors (`23502`). Mirror `purgeMarked`'s order (versions before plans).

## 2026-06-28 — Codex re-review: Bucket A's #2 missed the CREATE path (RESOLVED — landed; see entry above)

**Finding (verified, real High).** Bucket A's official-pointer guard (#2) covers only UPDATE. On a
`lesson-plans` **create**, `validateOfficialVersionPointer`'s ownership check keys off
`idFrom(originalDoc?.id)`, which is undefined on create, so the "version must belong to this plan"
check is skipped. The grade check still runs, but a same-grade version of ANOTHER plan passes it — so
an authenticated create can set a new plan's `officialVersion` to a version owned by a different plan
→ two plans sharing one Official version (violates the one-Official-per-plan model). The only valid
assignment is two-phase (create plan → create version under it → update pointer), which ingest + the
fixture already do; on create the plan doesn't exist yet, so any `officialVersion` value is
structurally invalid.

**Self-inflicted test smell.** Bucket A's new `#2` int spec demonstrates the illegal shape: it creates
a version under `fx.plan`, then a SEPARATE plan whose `officialVersion` points at that version. It only
"passes" because `overrideAccess` bypasses the guard. The fix must also rebuild that spec two-phase
(version under the new plan) and add a guard spec.

**Decision: fold into next session as item ⓪ (do first; hook-only, no migration).** Reject
`officialVersion` on an authenticated create
(`operation === 'create' && req.user && data?.officialVersion → throw`); exempt system/overrideAccess
(ingest never sets it on create). The rest of the Codex re-review (#2–#7: deps, export dedupe, limiter,
stale e2e, browse-200, subject-admin) is the already-tracked backlog — nothing new.

## 2026-06-28 — Bucket A landed: server-side invariant hardening (deployed + Rock-verified)

**Outcome.** The invariant cluster from the Codex triage is enforced server-side and live on the Rock.
Commits `0caf341` (hooks/helper + 4 int specs) and `fb72cec` (unique index + migration + regression
spec). `test:int` **14/14**; app rebuilt on the Rock so the running container matches the new index.

**Implementation choices worth recording:**
- **#2 (official pointer can't be cleared).** Added to `validateOfficialVersionPointer`: reject an
  update that nulls `officialVersion` **only when `req.user` is present**. The no-`req.user`
  overrideAccess path legitimately clears it — ingest (creates plan with a null pointer, sets it in a
  follow-up update), roundtrip cleanup, and the int-fixture `purgeMarked` teardown all do — so the
  system carve-out is required, same pattern as the field-split/immutability hooks. Confirmed by an
  int spec asserting BOTH: authenticated clear rejected, overrideAccess clear allowed.
- **#3a (version/plan grade consistency).** New `enforceVersionPlanConsistency` (beforeValidate, runs
  on create + update) fetches the parent plan (overrideAccess — integrity, not authz) and requires
  `version.subjectGrade === plan.subjectGrade`. Holds for ingest + fork (both carry the plan's grade).
- **#3b (semver immutable).** Chose **field `access: { update: () => false }`** over a hook: Payload
  silently preserves the original on any authenticated update (no error needed), and overrideAccess
  (ingest 1.0.0, fork's computed patch) bypasses it on create. `readOnly` only hid it in the admin UI.
- **#4 (no duplicate semver).** `nextSemverForPlan` computes the next patch from the **max existing
  semver across the plan's versions** (the old code blind-bumped the *source*, so two forks of 1.0.0
  both made 1.0.1). The **unique `(lessonPlan, semver)` index** is the concurrency backstop (declared
  `indexes: [{ fields:['lessonPlan','semver'], unique:true }]`). Migration hardened idempotent
  (`CREATE UNIQUE INDEX IF NOT EXISTS` / `DROP INDEX IF EXISTS`), per the Stage-3 lesson.
- **Pre-migration data cleanup (gotcha for any future unique constraint).** The live corpus already
  had a dup `(10, 1.0.1)` — two non-Official verifier-cruft working copies (versions 23, 26). A unique
  index build FAILS on existing dups, so they were deleted first (via a one-off `payload run` script
  using the Local API + overrideAccess, with a never-delete-Official guard). **Always pre-check
  `GROUP BY … HAVING count(*)>1` before adding a unique index to a live table.**
- **Test-DB hygiene.** A crashed earlier run left `ZZ_INT_` rows that wedged `purgeMarked` with a
  Postgres `25P02` (aborted-transaction) cascade. Fastest fix: drop + recreate + re-migrate the
  disposable `lesson3_test`. The fixture's leftover-tolerance is a known fragility (not fixed here).
- **#10 deferred** — DB-level subject-admin-per-grade uniqueness needs a representation change; the
  hook fan-out still enforces it. Out of scope for this batch.

## 2026-06-27 (evening) — Codex audit triage + the next batch: server-side invariant hardening

**Context.** Codex ran an external review of `main` (`da0a189`) and filed 11 findings + a 7/10 rating.
Triaged each against the source. The audit's central thesis is **correct and the useful takeaway**:
*invariants are enforced at the workflow/endpoint layer (fork, make-official, upload) but NOT as
collection hooks or DB constraints — so privileged direct API/admin writes can still violate them.*
Roughly half the findings rediscover the existing backlog (good corroboration); the new signal is a
cluster of server-side invariant gaps. **No code changed this session — this entry records the triage
and the plan; the batch starts next session.**

**Bucket A — NEW, act on it (the invariant cluster; verified against code):**
- **#2 plan can lose its Official version.** `officialVersion` is not `required`
  ([LessonPlans.ts:54]) and `validateOfficialVersionPointer` returns early on null
  ([hooks/lessonPlan.ts:27]); anyone with `canSetOfficialVersion` can clear it on update and nothing
  rejects it. (Codex's `ON DELETE SET NULL` orphan path is actually mitigated by
  `enforceOfficialNotDeletable`; the real gap is the direct update-to-null.)
- **#3 version/plan consistency unchecked at create + `semver` not server-immutable.** The
  plan/grade-match check in `validateOfficialVersionPointer` fires only at make-official, not at
  version **create**, so an admin can create a version under plan A carrying subjectGrade B (reads /
  authz key off the version's own `subjectGrade`). `semver` is `readOnly` in the **admin UI only**
  ([LessonBundleVersions.ts:106]) with no field `access.update` lock → mutable via API. (Rate Medium,
  not High — both require admin create access; admins are trusted. Defense-in-depth still warrants it.)
- **#4 duplicate semver from forks.** Every fork is `bumpSemver(source.semver,'patch')`
  ([endpoints/versionEdit.ts:71]); two forks of `1.0.0` both become `1.0.1`. No unique `(lessonPlan,
  semver)`.
- **#10 "≤1 Subject Admin" is hook-enforced, not atomic.** `autoDemotePriorSubjectAdmins` is an
  after-change fan-out with no DB constraint; concurrent promotions can transiently violate it. Known
  design choice; lowest priority in the batch.

**Bucket B — accurate but ALREADY on the backlog (Codex corroborated, not new work):** #1 deps =
backlog #1 (the `audit:prod` CI-gate idea is a good add); #6 per-process limiter + unthrottled
`/export/status` = the documented Phase-5 residual; #7 stale `frontend.e2e.spec.ts` = backlog #6 (and
is the planned #4-next); #8 browse `limit:200` = backlog #8; #9 minimal CSP / no nonce `script-src` =
backlog #3 (deferred with reasoning). #5 export-job dedupe/idempotency is real and not yet tracked →
folded into the Phase-5 residuals.

**Bucket C — context corrections:** Codex's "local test runner broken by an esbuild native mismatch"
is an **environment artifact** (platform/ownership of `node_modules`), not a code defect — `test:int`
9/9 and `test:unit` 33/33 are green on the Rock (this session). Its test-coverage commentary is
read-only inference that missed the now-green Local-API layer. #11 (upload buffers before per-file
size check) is genuine but **Site-Admin-only** (self-compromise) → Low; a `Content-Length` pre-guard
like the preview parser's is the cheap fix. CodeRabbit produced nothing (seat unassigned) — ignore.

**Plan for the Bucket A batch (next session) — hooks + constraints, EXEMPT system/ingest paths:**
1. **#2** — in `validateOfficialVersionPointer`, reject clearing `officialVersion` to null **on update
   when the plan already has ≥1 version**. GOTCHA: ingest creates the plan with a null pointer, then
   the version, then sets the pointer — so the guard must be update-only AND must not fire while the
   plan still has zero versions (or exempt the `overrideAccess`/no-`req.user` system path, like the
   field-split/immutability hooks already do). Hook-only, no migration.
2. **#3** — add `validateVersionPlanConsistency` (beforeValidate on `lesson-bundle-versions`):
   `data.subjectGrade` must equal the parent plan's `subjectGrade`. AND make `semver` immutable on
   update except trusted/system contexts (field `access.update` or a hook), but allow it on
   **create** (fork sets semver via `overrideAccess`). Hook-only, no migration.
3. **#4** — compute the next patch from the plan's existing versions (`nextSemverForPlan`) instead of
   blindly patch-bumping the source, AND add a **partial unique index on `(lessonPlan, semver)`**.
   Migration required → generate on the Rock (Node 22, deploy doc). PRE-CHECK the live corpus for any
   existing `(plan, semver)` duplicate before adding the constraint (the verifier runs left an extra
   working `1.0.1` — confirm it's not a dup under the same plan, or the migration's index build fails).
4. **#10 (optional, lowest)** — a partial unique constraint for subject-admin-per-subjectGrade; larger
   (representation/locking). Defer unless cheap. Migration if done.

**Sequencing decision:** do Bucket A **before** the endpoint/authz e2e (#4-next), because the e2e
suite should assert these invariants once they exist (and the new `tests/int` fixture is the harness
for both). Then #1 deps last, as already planned. Rated the codebase 7/10 — fair; closing Bucket A +
the test gate is what moves it toward "deployable for real."

## 2026-06-27 — `test:int` had never actually run; three fixes + the Rock test-DB procedure

**Context.** Pushed the 4-commit hardening batch (GraphQL off, preview sanitize + headers, int harness)
from the home Mac mini, pulled + rebuilt + redeployed on the Rock, and ran the verification gate. The
endpoint/header checks passed immediately (GraphQL `POST`/playground both 404; nosniff / X-Frame /
Referrer-Policy / non-script CSP all present; `next build` clean in the image; `test:unit` 33/33). But
the headline gate — `test:int` (the new hermetic role fixture + `access.int.spec.ts`) — **had never
been executed anywhere with a DB**, and first contact surfaced three real bugs.

**Finding 1 — wrong vitest environment.** `vitest.config.mts` (the `tests/int` config) set
`environment: 'jsdom'`. These are server-side Payload integration tests (`getPayload({ config })`);
under jsdom, vite externalizes node builtins and the whole `payload.config` import chain dies at load
with `ERR_UNKNOWN_BUILTIN_MODULE: node:` (empty specifier), 0 tests collected. A trivial no-import
smoke spec passed under the same config, proving it was the payload import chain, not the harness.
**Fix:** `environment: 'node'` — which is exactly what the already-green `vitest.unit.config.mts` uses.
*Rule: server-side Payload int tests run under the `node` environment, never `jsdom`.*

**Finding 2 — fixture used an invalid phase.** `tests/helpers/fixtures.ts` `minimalBundleContent()`
set `framework[].phase: 'Predict'`, which is **not** in the controlled vocabulary (`fields/phases.ts`:
the value is `'Predict Phase'`). So the fixture's own version-create tripped `validateGeneratable`
(`enforceBundleVersionGeneratable`), throwing in `beforeAll` and skipping all 8 specs. **Fix:**
`'Predict Phase'`.

**Finding 3 — Editor test submitted id-less rows (the subtle one).** The "Editor overlays prose but
admin/structure preserved" spec submitted a *fresh* `minimalBundleContent()` — rows with **no `id`s**.
Payload treats id-less array rows as NEW, and on a new row a non-admin's submission has the admin-only
`framework[].phase` stripped (it carries no field-level value for an Editor). `validateGeneratable`
runs in `beforeValidate` — BEFORE `enforceVersionFieldSplit` (a `beforeChange` hook) restores `phase`
from the original — so it saw `phase: undefined` and threw. This is a **test bug, not a product bug**:
the live edit path (and `verify-stage2b-edit`, 13/13) resubmits the *loaded* rows via `{ ...l }`,
preserving each row's `id` + `phase`, so `merged` stays valid and the field-split then ignores any
hack. **Fix:** the spec now maps the working copy's real rows (`wc.lessons.map(...)`) and overlays the
prose change, mirroring the live path. *Lesson: an Editor-edit test MUST resubmit rows with their ids
(and admin subfields), because id-less rows are "new" and lose admin fields before the generatable
gate — which validates pre-field-split for Editors.* (The ordering — generatable in `beforeValidate`,
field-split in `beforeChange` — is safe in practice because every real writer submits ids; noted, not
changed.)

**Result.** `test:int` 9/9 green. Evidence gate honoured with a **sanity-flip**: neutralizing
`enforceVersionImmutable`'s Official-version check flips ONLY "rejects updating the Official version"
to red, the other 8 stay green — the suite has teeth.

**Rock test-DB procedure (the ops wrinkle — belongs with backlog #6).** The committed `test.env`
points `DATABASE_URI` at `localhost:5432/lesson3_test` (a dev-host assumption) and `vitest.setup.ts`
loads it with `override: true`, so it clobbers any passed DATABASE_URI. On the Rock, postgres is
internal-only at `postgres:5432` and there is no `localhost` DB. To run `test:int` on the Rock:
1. `CREATE DATABASE lesson3_test;` (via `docker compose exec -T postgres psql -U lesson3 -d postgres`).
2. Apply migrations to it with the deps image + an env whose DATABASE_URI db is `lesson3_test`
   (`npx payload migrate`, `--network lesson3_default`).
3. Temporarily rewrite `app/test.env`'s `DATABASE_URI` to `postgres://…@postgres:5432/lesson3_test`,
   run `npm run test:int` in the deps image on `--network lesson3_default`, then
   `git checkout -- app/test.env`.
The `lesson3_test` DB is isolated from the real `lesson3` corpus and was left in place for future runs;
delete any throwaway env file (it holds the real `PAYLOAD_SECRET`). A committed helper that makes this
one command (or a Rock-host-aware `test.env`) is the proper backlog-#6 follow-up.

## 2026-06-26 — Hardening: sanitize preview HTML + baseline frontend security headers (backlog #3)

**Context.** Backlog #3 (and Codex) flagged that Mammoth-generated preview HTML is rendered with
`dangerouslySetInnerHTML` on the teacher route (`(frontend)/lessons/[id]/page.tsx`) and as a standalone
page from the preview endpoint, with no sanitization and no frontend CSP. Low risk today (inputs are
plain strings; Mammoth escapes text) but becomes real XSS the moment resource links or richer imported
content land — so close it now.

**Decisions.**
1. **Sanitize at the single seam.** Added `src/lib/sanitizeHtml.ts` (`sanitizePreviewHtml`) using
   **DOMPurify + the already-vendored jsdom** (pinned `dompurify@3.4.11`, exact — matches the repo's
   no-caret convention). Applied inside `docxToSections` (`generator/previewBundle.ts`), the one
   function BOTH render paths flow through — not per-render-site. Allowlist = the safe subset Mammoth
   emits (p/inline-emphasis/headings/lists/links/tables; attrs href/colspan/rowspan; no style/class/id,
   no `on*`). Chose DOMPurify over a hand-rolled allowlist (the altitude anti-pattern).
   **Gotcha recorded:** do NOT set a custom `ALLOWED_URI_REGEXP` — it over-applies to non-URI
   attributes and silently strips `colspan`/`rowspan`. DOMPurify's DEFAULT URI validation already
   blocks `javascript:`/`data:` while keeping http(s)/mailto/relative/anchors (verified empirically).
2. **Baseline frontend security headers** via `next.config.ts` `headers()` on every route:
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
   strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, and a CSP that hardens WITHOUT a
   script-src/default-src (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action
   'self'`). Deliberately no strict script-src: Next relies on inline hydration scripts, so a strict
   policy needs nonce plumbing — **deferred as a separate, larger task**. The preview endpoint keeps
   its own strict standalone CSP; multiple CSP headers combine by intersection (stricter), no conflict.

**Verify.** Unit `tests/unit/sanitizeHtml.spec.ts` (strips script/on*/javascript:/data:, keeps
tables/links/emphasis, drops style/class/id). On the Rock: `next build`; confirm the headers are present
on a frontend response and the teacher preview still renders tables/formatting.

## 2026-06-26 — Hardening: GraphQL + Playground disabled (config flag is NOT enough — delete the routes)

**Context.** Production-readiness backlog #7 (and an external Codex review) flagged the scaffold-mounted
GraphQL POST + Playground routes as unnecessary recon surface — this app's API is REST + custom
endpoints; GraphQL is unused. Access control still applies, so this is surface reduction, not a fix
for an exploitable hole.

**Finding (verify-installed-source rule paid off).** Setting `graphQL: { disable: true }` in
`payload.config.ts` is **not sufficient on its own**. The generated Next route handler
(`@payloadcms/next/dist/routes/graphql/handler.js`) `POST` export does NOT check `graphQL.disable` —
it unconditionally builds the schema (`configToSchema`) and serves. Only the *playground* GET handler
honours the flag. So the committed `app/(payload)/api/graphql/route.ts` would keep serving queries
regardless of the config flag.

**Decision.** Belt-and-suspenders: (1) set `graphQL.disable: true` (kills introspection, the playground,
and any internal schema build that DOES read the flag), AND (2) **delete** both generated route files
`app/(payload)/api/graphql/route.ts` and `…/graphql-playground/route.ts`. With the specific segments
gone, `POST /api/graphql` and `GET /api/graphql-playground` fall through to the REST catch-all
(`api/[...slug]/route.ts`), which treats "graphql" as an unknown collection slug and returns 404. No
other code references these routes (importMap clean, no src imports). The "DO NOT MODIFY — generated"
banner warns against *editing* the files (a re-scaffold could overwrite); deleting to remove an endpoint
is the supported way to drop a route in an app-router Payload project.

**Verify on the Rock.** `next build` succeeds; `POST /api/graphql` → 404, `GET /api/graphql-playground`
→ 404; admin + REST + custom endpoints unaffected (Payload 3 admin uses REST/server functions, not
GraphQL).

## 2026-06-26 — FE/ST modeling resolved: single-document sub-strands are legitimate (option a)

**Context.** The production-readiness backlog (NEXT-SESSION #5) flagged that ingest's warn-only
deliverable check conflates two cases: "this sub-strand legitimately has no FINAL_EXPLANATION /
SUMMARY_TABLE" (6/13 of the upstream corpus) vs. "the data is incomplete." It could not become a
hard gate until that ambiguity was resolved (SPEC §3 option (a) allow single-doc bundles, OR (b) a
typed `notApplicable` state).

**Decision (user-confirmed 2026-06-26).** Adopt **option (a)**: some sub-strands ship as a *single*
document (the LessonSequence only). A missing FE/ST is **valid content, not incomplete data**.
Therefore:
- The deliverable check stays **informational only** and must **never** be promoted to a hard gate.
  (The generator already guards empty FE/ST — `FE.sections || []`, `ST.lessons || []` — and simply
  skips those documents, so single-doc bundles already generate correctly end to end.)
- The always-present **LessonSequence remains hard-gated** by `validateGeneratable` (META, ≥1 lesson,
  SLO/summaryTablePrompt groups, ≥1 valid framework phase). That gate is unchanged.
- **Option (b) (a typed `notApplicable`/intentionally-omitted state) is DEFERRED** — not built. It
  would require a DB field + Rock migration for no functional gain today, since absence already
  generates the right output and is no longer treated as a defect. Revisit only if we later need to
  distinguish "intentionally omitted" from "not yet authored" in the editor UI.

**Changes.** SPEC §3 amended (single-document sub-strands called out as legitimate; "up to three
documents per bundle"). `deliverableWarnings` doc comment in `validateGeneratable.ts` reworded to
state the resolution (no behavior change — it already only warned). Backlog item #5 is now CLOSED.

## 2026-06-25 — Stage 3 DEPLOYED + Rock-verified; collection-drop migration gotchas

**Outcome.** The `lesson-bundles` retirement is live on the Rock. The drop migration
(`20260625_125532_drop_lesson_bundles`) applied cleanly (exit 0, 277 ms, batch 9); 0 `lesson_bundles*`
tables remain; `lesson_plans` (13) + `lesson_bundle_versions` (14) intact; app healthy on the new
schema (no `relation … does not exist`). All verifiers green: roundtrip-regression **3/3 byte-identical**
(seed→ingest→version→generate→diff vs the stakeholder oracle), `verify-rbac` 7/7, `verify-stage2b-edit`
13/13, `verify-stage2b-preview` 7/7, `verify-stage2-export` DOCX+PDF. Committed `1959daf` (Rock-generated
`payload-types.ts` + migration, pushed back to `main`). The Stage 3 entry below is now fully realised.

**Two gotchas to expect on ANY future Payload collection-drop migration (the auto-generated SQL is not
apply-safe as-is — review + harden the `up()` before `docker compose up -d --build`):**

1. **`DROP CONSTRAINT` must be `IF EXISTS`.** Payload emits `DROP TABLE "<coll>" CASCADE` *and* a later
   explicit `ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "<...>_<coll>_fk"`. The CASCADE
   already removes that FK (it references the dropped table), so the explicit drop then errors
   `constraint … does not exist` and the whole (transactional) migration rolls back. Fix: make the
   `up()` drops idempotent — `DROP CONSTRAINT IF EXISTS`, and for safety `DROP TABLE/TYPE/INDEX/COLUMN
   IF EXISTS` too. (The earlier "IF EXISTS is optional" call was wrong for a real DB — it's required.)
   The `lesson_bundle_versions` FK/column/index on the same join table are left untouched — verify that.

2. **Removing a value from an in-use enum fails on stale rows.** The diff also rebuilt the
   `payload_jobs(_log).task_slug` enum to drop the retired `generateArtifact` value, via
   `ALTER COLUMN … SET DATA TYPE <new_enum> USING task_slug::<new_enum>`. That cast throws
   `invalid input value for enum … "generateArtifact"` if any retained job row still holds the removed
   value — and completed jobs ARE retained (no auto-delete). Fix: prepend `DELETE FROM payload_jobs_log
   …; DELETE FROM payload_jobs … WHERE task_slug = '<removed>'` to `up()` (kept in the migration so a
   replay on any DB is safe). Generalises: dropping any task/enum value requires clearing rows that use it.

**Process note.** The migration + `payload-types.ts` must be generated ON THE ROCK (Node 22; local
payload CLIs break on newer Node), then committed + pushed back to `main` with a short-lived PAT (the
Rock is pull-only). The hand-edits above were applied on the Rock via `sudo` (the deps container
generates the file root-owned). See the runbook in the Stage 3 entry below.

**Minor follow-up.** The DB-less fidelity scripts (`roundtrip-regression`, `adapter-fidelity`,
`pdf-fidelity-check`) default their oracle path to `~/Desktop/ares-docx-fidelity-demo`; in-container on
the Rock they need BOTH `-e ARES_DEMO_PATH=/ares-demo` AND `-v /srv/lesson3/out/ares-demo:/ares-demo`
(env alone fails ENOENT — the host path isn't mounted). Worth baking into a Rock verify helper.

## 2026-06-24 — Stage 3: legacy `lesson-bundles` collection retired

**Decision.** The Official-version model (`lesson-plans` + immutable `lesson-bundle-versions`) is now
the ONLY representation. The legacy `lesson-bundles` collection and its entire bundle-path
(endpoints, generator, hooks, access, scripts) are removed. **DONE + Rock-verified 2026-06-25** — the
drop migration applied and all verifiers pass (see the 2026-06-25 entry above for the result + the
migration gotchas). The runbook below is retained for reference / future collection drops.

**What was removed (deleted files).** `collections/LessonBundles.ts`;
`endpoints/{exportBundle,exportStatus,previewBundle}.ts`; `generator/generateForBundle.ts`;
`jobs/generateArtifact.ts`; `hooks/{bundleIntegrity,generatable}.ts`; and the obsolete scripts
`generate-bundle`, `publish-bundle`, `publish-drafts`, `wipe-bundles`, `migrate-bundles-to-versions`,
`verify-migration` (one-shot Stage-1 proof — its job is permanently done; `roundtrip-regression`
remains the standing fidelity gate). Pruned the now-dead exports from shared modules:
`authorizeExportRequest`/`bundleScope`/`findReadableBundle`/`assertExportable` and the five
`lessonBundle*` collection-access fns (`access/bundle.ts` now holds only the shared field-access
helpers `canEditProse`/`canEditStructure`/`systemOnly`).

**Three things the cutover surfaced that the plan had to handle:**
1. **Shared content fields.** `LessonBundleVersions` reused `LessonBundles.fields`, so the META/UNIT/
   LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE field groups (+ `resourceLink`/`rowLabel` helpers) were
   extracted to `fields/lessonContent.ts` (the sole home now); the version collection imports
   `lessonContentFields`.
2. **Upload re-homed, not deleted.** The web ingest endpoint (`uploadBundles.ts`) and its
   `UploadBundles` panel were mounted on `lesson-bundles`; the core (`ingestItems`) already writes
   plans+versions, so both moved to `lesson-plans` (`POST /api/lesson-plans/upload`, panel above the
   Lesson Plans list). Chosen over the versions collection because import creates a *plan*.
3. **The generator was typed to the vanishing `LessonBundle` type.** Dropping the collection removes
   `LessonBundle` from `payload-types.ts`. The generator/adapter/preview chain (`adapter.ts`,
   `previewBundle.ts`, `generateForVersion.ts`, `previewShared.ts`) was retyped to
   `LessonBundleVersion` — the surviving, content-identical shape — which also DELETED the transitional
   `as unknown as LessonBundle` casts from Stage 2a. Cleaner end-state, not just a port.

**Follow-on simplifications (the second consumer is gone).** The `PreviewBundle`/`ExportBundle`
controls dropped their `basePath`/`publishedGate` clientProps (hardcoded to the version endpoints; a
version has no published gate); `previewShared.ts` and `fieldSplit.ts` doc comments updated to
single-owner. RBAC: `verify-rbac.ts` was rewritten to the People/Curriculum rules it UNIQUELY covers
(SubjectGrade displayName, ≤1-subject-admin auto-demote, password/assignment guards); its bundle
field-split + draft/publish-versioning assertions were dropped because the Official-version model's
field-split/immutability RBAC is covered by `verify-stage2b-edit`. `adapter-fidelity.ts` kept as the
byte gate (retyped; its obsolete draft/published export-gate check removed).

**Verification.** Local: type-check clean, lint warnings-only (pre-existing patterns), unit 19/19.
**Rock (2026-06-25): DONE** — drop migration applied + all verifiers green (see the 2026-06-25 entry).

**Drop migration — Rock runbook** (schema change → generate ON THE ROCK, Node 22; local payload CLIs
break on newer Node — same pattern as prior migrations). NOTE: the generated `up()` needed hand-edits
before applying — see the 2026-06-25 entry's two gotchas (`IF EXISTS` on drops + DELETE stale job rows):
```
git pull
docker build --target deps -t lesson3-deps ./app
docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app --env-file .env \
  lesson3-deps npx payload generate:types          # LessonBundle type drops out; commit payload-types.ts
docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules \
  -w /app --env-file .env lesson3-deps npx payload migrate:create drop_lesson_bundles
#   → REVIEW the generated up()/down() before applying. It should DROP the lesson_bundles tables
#     (+ its _v versions/locks/rels). Confirm it does NOT touch lesson_plans / lesson_bundle_versions.
#     Make it idempotent (IF EXISTS); commit it.
docker compose up -d --build                        # one-shot `migrate` applies it, then `app` starts
```

## 2026-06-24 — Stage 2b finish: admin Preview/Export controls cut over to versions

> **Partially superseded by the Stage 3 entry above (same day).** The `basePath`/`publishedGate`
> clientProps and the `as unknown as LessonBundle` cast described below were REMOVED in Stage 3 when
> `lesson-bundles` was retired (the components hardcode the version endpoints; the generator is typed
> natively to `LessonBundleVersion`). The decisions here are kept as the record of what was built then.

**Decision.** The admin edit-view **Preview** and **Export** controls now run on the
`lesson-bundle-versions` working-copy editor (where Edit→fork lands the user), not only the legacy
`lesson-bundles` edit view. This closes the Official-version cutover bar Stage 3 (retire
`lesson-bundles`).

**What changed.**
- New **version preview endpoints** (`src/endpoints/previewVersion.ts`), mounted on
  `lesson-bundle-versions`: `GET /:id/preview` (stored version) and `POST /:id/preview` (current
  UNSAVED working-copy form state). The version-model counterpart of `previewBundle.ts`, minus the
  draft/published axis (every retained version is a valid snapshot — `findReadableVersion`), rendering
  by casting the version across to the sibling bundle content shape (as `generateForVersion` does).
- The preview **page shell + CSP + completeness gate + error semantics** (`renderPreviewResponse`)
  and the **unsaved-POST body parse + size limit** (`parsePreviewCandidate`) were extracted to
  `src/endpoints/previewShared.ts` so the bundle and version preview paths can't drift on what a
  preview looks like, how an incomplete/failed render is reported, or the `data`-field validation.
  The per-endpoint remainder (the readable-doc loader and the overlay + field-split hook, which
  genuinely differ) is intentionally NOT shared — `lesson-bundles`/`previewBundle.ts` retire in
  Stage 3, so a higher-order `handler(loader, hook)` seam would only complicate that deletion.
- POST-unsaved security mirrors the bundle path: edit-authority gate (`isEditorFor`) THEN the real
  version field-split (`enforceVersionFieldSplit`) on the posted overlay — an Editor previews only
  what they could save; a structural change → `Forbidden` → 422. Preview persists nothing, so it does
  NOT enforce version immutability (saving an Official version is separately rejected).
- The two admin controls were **parameterised, not duplicated** (chosen over version-only twins):
  `PreviewBundle`/`ExportBundle` gained `basePath` (default `lesson-bundles`) and `ExportBundle` a
  `publishedGate` clientProp. Versions mount them with `basePath: 'lesson-bundle-versions'` +
  `publishedGate: false` (no published gate — every version is inherently exportable, SPEC §9). Same
  registered components → no importMap change. Names kept as-is despite now serving versions; renaming
  is churn + importMap regen — defer to Stage 3 cleanup.

**Verification.** Local: type-check + lint clean, unit 19/19. **Rock-verified 2026-06-25:**
`verify-stage2b-preview` **7/7** (saved-render non-empty, editor prose applied / admin+structure
reverted, cardinality change rejected, teacher has no edit authority).
Export-on-versions is already covered by `verify-stage2-export`. **Test gap (follow-up, non-blocking):**
`verify-stage2b-preview` bypasses HTTP, so the new `parsePreviewCandidate` formData→JSON→size→shape
path is not yet exercised — a small unit test on its 400/413 error cases would close it.

## 2026-06-24 — Stage 2b edit model: working-copy (fork on Edit, mutable until Official)

**Decision (supersedes the earlier "edit-in-place, fork on first save").** Editing works on a
mutable **working copy**, not per-save snapshots:
- An **Official** version is **immutable** (frozen).
- Clicking **Edit** on a version creates ONE new **Not-Official working version** (a content copy,
  semver patch-bumped, `sourceVersion` = the edited version) and opens it in the admin editor.
- A Not-Official version is **mutable** — subsequent saves update that same working version (no
  version explosion). When a Subject/Site Admin **marks it Official**, the plan's `officialVersion`
  pointer moves to it and it becomes frozen.

**Why the change.** Payload's admin edit view is bound to one document; a save is an `update` on that
doc. "Fork on first save" would require a hook to transparently turn an update into a *new* document
and redirect the admin UI — fragile machinery fighting the framework. The working-copy model is
Payload-native (fork is an explicit create-then-edit), avoids one-version-per-keystroke, and matches
how editors actually work (draft until ready, then publish-as-Official).

**Implementation — as built (`d18a544` admin slice; `a774273`/`36e9500` Editor slice):**
- Immutability enforced by `enforceVersionImmutable` (`beforeChange`): rejects updates to a version
  that is currently its plan's `officialVersion` (not via access `Where`, which can't express "not
  this plan's pointer" across all rows).
- **Field-split for Editors (Editor slice).** The Editor whitelist was factored OUT of
  `enforceBundleStructure` into a shared pure `applyEditorFieldSplit` (`hooks/fieldSplit.ts`),
  parameterised by which TOP-LEVEL keys an Editor may influence — the one bundle-vs-version
  difference (a bundle has `semver`/`bumpType`/`lockVersion`/`_status`; a version doesn't). Both
  collections now delegate to it; the bundle path is behavior-identical (`verify-rbac` stays 36/36).
  `enforceVersionFieldSplit` applies it on versions.
- `lessonBundleVersionUpdate` access is **editor-scoped** (Editor/Subject Admin for their grades; Site
  Admin all) — the field-split limits an Editor to prose. `lessonBundleVersionCreate` is **admin-only**:
  the fork copies the source via `overrideAccess` (a trusted faithful snapshot, not Editor-authored
  input), so Editors never create a version directly — which would let them set admin-only fields on a
  brand-new row where the whitelist has no original to protect.
- **Edit** affordance on the detail page (**Editors + admins**) → `POST /:id/fork` (Editor-or-admin
  gated) creates the working version and returns its admin URL. **Make Official** (**admins only**) →
  `POST /:id/make-official` sets `LessonPlan.officialVersion` only (no content copy);
  `canSetOfficialVersion` + `validateOfficialVersionPointer` gate/validate it.
- **Retention guard** (`enforceOfficialNotDeletable`, `beforeDelete`): the Official version cannot be
  DELETED (would orphan the plan pointer / lose the canonical snapshot). Not-Official working copies
  stay deletable so a Site Admin can prune abandoned forks; to delete the Official one, move the
  pointer first. (Update-immutability alone left Official versions delete-able — closed here.)

## 2026-06-24 — Stage 2a: teacher read/view/export cut over to the version model (deployed + verified)

**Done.** Browse, detail, content-preview and download now read `lesson-plans` + `lesson-bundle-
versions` instead of legacy `lesson-bundles`. Teachers get the Official version by default with a
`?version=` selector for all retained versions. Deployed to the Rock (`0d4a49a`) and verified.

**Key design choice — generator-agnostic artifact cache.** Rather than maintain the export chain
twice during the transition, the cache key was genericized from `bundleId`+`lockVersion` to an opaque
`scope` string (`version:<id>` for immutable snapshots — no cache-buster needed — or
`bundle:<id>:<lockVersion>` for the legacy path). `produceArtifacts` no longer fetches/generates; the
caller passes the already-generated DOCX + filePrefix, so one cache serves both paths. This let the
teacher path move to versions while the admin/bundle export machinery kept working untouched.

**Other choices:** `generateForVersion` has NO published gate (a version is immutable and already
passed `enforceBundleVersionGeneratable` at create). A second job (`generateVersionArtifact`) keys on
the immutable version id, so the bundle path's lockVersion-drift race cannot occur. Version export
endpoints (GET serve / POST prepare / status) mount on `lesson-bundle-versions`, preserving the
audit-#3 GET/POST split. Detail route id is the PLAN id (`/lessons/<planId>?version=`); old
bundle-id links break (acceptable, non-production).

**Verified on the Rock:** roundtrip gate 3/3 byte-identical vs the approved DOCX (proves
`generateForVersion`); teacher read verify 13/13 plans visible + browse rows + detail-generate
(`verify-stage2-reads.ts`); export produce→cache→zip for DOCX (41 KB) + PDF (118 KB via Gotenberg)
(`verify-stage2-export.ts`); endpoints 401 unauth / 307 redirects / 403 APIs, no 500s; app boots clean.
Also fixed `roundtrip-regression.ts`, which had silently broken when ingest moved to plans/versions.

**Deferred to the next slices (Stage 2b / 3):** edit-in-place fork-on-save + admin Preview/Export
component cutover; Make-Official UI; retiring `lesson-bundles`. During the transition admin editing
still uses the legacy bundle editor, so admin edits and teacher views can diverge (consistent with
the model: edits make new versions; Official doesn't move automatically).

## 2026-06-24 — Stage 2: new-model reads stay open to all authenticated (teachers see all subjects)

**Decision.** On the new Official-version collections, ANY authenticated user may READ every
`lesson-plan` / `lesson-bundle-version` (the existing `Boolean(user)` access on `lessonPlanRead` /
`lessonBundleVersionRead` is correct and stays). WRITES remain subject-grade-scoped (create/update/
delete + the `officialVersion` pointer) — those rules already exist and are unchanged.

**Why (and a reversal).** A subject-grade-scoped read was briefly considered ("teachers see only
their associated subject-grades"), but a plain Teacher has **no** subject-grade association (the only
assignment roles are `editor` / `subjectAdmin`), so scoping reads would make teachers see *nothing*
unless a new view-only association role were added. We chose NOT to add that: teachers keep
cross-subject read, matching legacy intent (where a Teacher could read any published bundle across
all subjects). Two properties make `Boolean(user)` the faithful translation of that intent:
- **No draft/published gate on versions.** Legacy scoping existed mainly to hide *drafts* from
  teachers (`or: [published, subjectGrade in scoped]`). A retained version is immutable and already
  passed `enforceBundleVersionGeneratable` at create, so there is no draft to hide.
- **Official is a default/trust marker, NOT an access/export gate.** Within everything they can see,
  users may view/export every retained version (Official or not).

Other Stage-2 forks locked the same day (see NEXT-SESSION): detail URL `/lessons/<planId>?version=`
(Official by default), and Edit = edit-in-place / fork-on-first-save into a new Not-Official version.

## 2026-06-24 — Stage 1: backfilled the 13 legacy bundles into the Official-version model

**Decision.** The Official-version schema + ingest write path were live but the 13 pre-existing
**published** `lesson-bundles` (ids 63–75: 10 Biology @ SG 30, 3 Math @ SG 31) had no Plan/Version,
so the new read/export paths had no data. Backfilled them with a one-shot, idempotent migration
(`scripts/migrate-bundles-to-versions.ts`) that mirrors ingest's Phase-2 write block exactly: per
bundle, create `LessonPlan {title, subjectGrade}` → create `LessonBundleVersion {…content,
lessonPlan, semver:'1.0.0'}` → point `LessonPlan.officialVersion` at it, all in ONE transaction.

**How it stays faithful.** Content is the legacy doc minus version-metadata/internal keys
(`semver, bumpType, lockVersion, _status, createdAt, updatedAt, id`) with **all nested array-row
`id`s stripped** (those belong to the source rows; Payload regenerates them on create). The same
version hooks then run (`numberBundleVersionRows`, `enforceBundleVersionGeneratable`). Drafts are
NOT migrated — only published snapshots were ever Official. The run is idempotent (skips a bundle
whose `(title, subjectGrade)` already has a Plan), so a re-run after partial failure is safe.

**Verified (oracle-free, `scripts/verify-migration.ts`).** Generated all three CBE DOCX from each
legacy bundle AND its new version and diffed: **39/39 documents content-identical** (Resource column
excluded), including the 6/13 sub-strands that legitimately have no FE/ST ("both absent — OK").
`bio_1_4` ("CHEMICALS OF LIFE", bundle 66 → plan 10) matches, consistent with the standing fidelity
proof. Applied + verified on the Rock; legacy `lesson-bundles` left **untouched** (purely additive,
fully reversible). **Next:** Stage 2 cuts the read/export paths over to Plans/versions; Stage 3
retires `lesson-bundles`.

## 2026-06-24 — Audit #3 closed: GET `/export` split into serve-only GET + enqueue-only POST

**Decision.** The export endpoint that *enqueued* heavy work on a cold GET was both non-idempotent
and a cross-site enqueue vector (a bare `<img src=…/export>` would queue a job). Split by HTTP
method:
- `GET /:id/export` — serve-only. Warm → `200` zip; cold → `409 {state:'not_prepared'}`. It **never
  enqueues**, so it is idempotent and side-effect free.
- `POST /:id/export` — the only state-changing export op. Warm → `200 {state:'ready'}`; cold →
  enqueue `generateArtifact` + `202 {statusUrl}`. The per-user rate limit moved here (the enqueue).
- `GET …/export/status` unchanged. The client (`exportClient.ts`) now POSTs to prepare, then GETs to
  download (200 ready → GET; 202 → poll → GET). Both UI callers pass the same base URL, so no change.

**Why this is the CSRF fix.** Verified against installed Payload source: the auth cookie defaults to
`SameSite=Lax` (`collections/config/defaults.js`) and `Users.ts` doesn't override it. A cross-site
POST therefore carries no cookie → `req.user` null → `401`. So the only operation that drives the
queue is an authenticated *same-site* POST — no CSRF token machinery needed.

**Verified on the Rock (`9c9a701`, 2026-06-24):** cold POST → `202` → poll `ready` → GET `200`
application/zip (42 KB, correct filename); cold GET on an unprepared spec → `409` (no enqueue);
unauth POST → `401`; Teacher POST `/api/payload-jobs` → `403`. **Note:** unauth POST
`/api/payload-jobs/run` returned `404`, not the `401/403` the backlog predicted — harmless (the run
surface isn't exposed to an unauth caller, nothing runs/leaks), but the run path/handler differs from
what was assumed; confirm if revisiting the jobs surface.

## 2026-06-24 — Official pointer replaces draft/publish as product state

The product state is now **Official / Not Official**, not Payload **published / draft**. A lesson
plan has many retained immutable version snapshots and exactly one global Official version pointer.
Uploading valid ARES data creates version `1.0.0` and immediately points the Lesson Plan's
`officialVersion` at that exact snapshot. Later edits create new Not Official snapshots by default.
Site Admins and the matching Subject Admin may move the pointer to any retained version; moving the
pointer must not restore/copy content into a new version, because that would duplicate identical
documents under different semver labels. Teachers can view and export all versions; Official is the
default/trust marker, not an access or export boundary.

Implementation note: adding the new collections without a generated Payload migration made the Rock
admin fail at runtime (`relation "lesson_plans" does not exist`, plus missing lock-document relation
columns). The fix was the normal schema-change path: run `payload generate:types` and
`payload migrate:create official-version-model` on the Rock's Node 22 tooling, commit
`payload-types.ts`, `migrations/index.ts`, and `20260624_221905_official_version_model.{ts,json}`,
then redeploy so the one-shot migrate container applies it before the app starts.

## 2026-06-24 — UX batch: one login, consistent top-right menu, resources checkbox, admin polish

A second UX pass (with the user + external review) unified the auth/shell and the export controls.
Decisions + reasoning:

- **One login form.** Two surfaces (The App + `/admin`) each had a login; teachers can't use `/admin`,
  so the frontend `/login` is the single form. `/admin/login` now redirects to `/login` — chosen as a
  **`next.config.ts` `redirects()`** rule (fires at the routing layer before the admin routes resolve,
  so it can't 404). Two earlier attempts were rejected: a Payload **views.login override** (404'd —
  the `views` slot didn't reliably catch the login route) and **Next middleware** (worked but was more
  machinery than a static redirect needs — the open-redirect guard it justified was redundant with the
  login page's own sanitizer). Product call: **everyone lands on `/` after login, just like a teacher;
  admins click the header "Admin" link** — so the `?redirect=` return-path plumbing (`safeRedirect`,
  middleware) was deleted as gold-plating. Brand text `Lesson Plan Repository 3` → `Lesson Plan
  Repository` everywhere; the admin login Logo graphic was dropped (never rendered after the redirect);
  the frontend header is hidden when logged-out so `/login` is a clean splash.
- **One consistent top-right user menu on both surfaces:** username · [Admin|Lessons] · logout ·
  initials avatar (the cross-link shows the surface you're NOT on). Admin side injected via
  `admin.components.header` (renders top-of-page, gets `user` in serverProps). **One logout everywhere**
  — Payload's own nav logout is hidden (`custom.scss .nav__log-out { display: none }`). `Avatar` +
  `LogoutButton` are shared components, styled per surface. The custom dashboard's "Browse lesson
  library" action was removed (the header "Lessons" link covers it — closing the redundancy).
- **"Include ARES Resources" checkbox replaces Standard/Compact** everywhere (teacher view, admin
  export, admin preview). Standard/Compact only ever meant *with/without the Resource column*, and
  users work in one mode — so it's a single checkbox, **unchecked by default** (= compact = no Resource
  column), driving the view AND all downloads; the 4 teacher download buttons collapsed to DOCX/PDF.
  The boolean↔format mapping lives in one place (`lib/format.ts`); a shared `ResourcesCheckbox`
  dedups the two admin controls.
- **Admin legibility — and a trap.** Payload's `--base-body-size` is a **DIVISOR** for its spacing
  unit, NOT the text size — bumping it 13→14 *shrank* the admin (a regression we caught). The real
  lever is the rem root + body size: `html, body { font-size: 15px }` scales text + spacing uniformly
  (~15%) toward the 16px frontend. The nav mark slot (`.step-nav__home`) is a fixed **18×18px** box
  that clips text (a wordmark showed as "Le"/"LP"), so the mark is a small **SVG document glyph sized
  to 18×18**, not a cryptic monogram.
- **OPERATIONAL — importMap entries reproduced by hand (again).** Each new admin component registered
  by config path (`views.login`, `views.dashboard`, `components.header`, graphics) needs an
  `admin/importMap.js` entry, and the local `generate:importmap` CLI breaks on Node > 22. The entry is
  deterministic — `default_<md5(component-path-without-#default)>` — so it's reproduced locally and
  committed, keeping origin correct without a Rock regen. (See the 2026-06-23 entry for the scheme.)
- **e2e login helper** (`tests/helpers/login.ts`) updated for the single login: go to `/login`, fill
  the frontend form, wait for `/`; admin specs navigate to `/admin` themselves (shared cookie).

## 2026-06-23 — UI/admin redesign: strand-first Lesson Plans page, custom dashboard, nav rename

A multi-round UI pass (with the user + an external reviewer) replaced the arbitrary-feeling browse and
admin surfaces. Decisions + reasoning:

- **Lesson Plans page is strand-first and server-rendered.** Sub-strands are children of strands, so
  the page groups subject-grade → strand → sub-strand in **curriculum order** (`meta.substrand_id`,
  e.g. "1.4"), sorted **dotted-numeric** (`1.4 < 1.10`) — not alphabetical, not Payload default. The
  identifier `substrand_id` was already the stable bundle key; the strand is its first dotted segment,
  named by `unit.strand` (fallback `Strand N`). Labels use `meta.substrand_name`, dropping the
  denormalized shouty `title`; strand headings strip the stored `Strand N.M:` prefix so they read
  `Strand N: Name` (not `Strand 2 · Strand 2.0: …`).
- **Stacked sections over a master-detail two-pane** (the user preferred master-detail visually, but an
  external review flagged it as "custom app shell"). Stacked sections need **no client state** — one
  access-gated `payload.find` + JS grouping in a server component — so it's the lower-custom, more
  Payload-native choice, and it stacks multiple subject-grades naturally. Lesson counts come from a
  light `select: { lessons: { id: true } }` (no bodies). Search is modest **local JS filtering** over
  sub-strand number/name, strand, subject, grade (not a Payload nested `where`, not lesson-body text);
  it filters the already-fetched ≤200 set and will need to move server-side when pagination lands.
  Pure logic in `src/lib/substrand.ts` with a **DB-free** unit suite on its own `vitest.unit.config.mts`
  (`test:unit`) so the dotted comparator etc. run locally without the Rock; `test`/`test:int` untouched.
- **Admin dashboard: replace, don't fight.** Payload's default dashboard renders collection-card boxes
  that exactly duplicate the nav. Override **only** that view via `admin.components.views.dashboard`
  (sanctioned extension point) with a quiet, role-aware, **additive-only** landing (role/scope line +
  actions the nav lacks: public-library link, Site-Admin-only ingest) — never re-listing collections.
  **Rejected the new modular widget dashboard:** its only built-in widget is the same `CollectionCards`
  plus drag/config chrome, so a clean result would need custom widget components — *more* code for a
  worse fit. Styles live in `(payload)/custom.scss` (already wired by the scaffold), scoped to
  `.lp-admin-dash`, using `--theme-elevation-*` so they follow light/dark; type scale mirrors the
  Lesson Plans page. No global admin re-theme.
- **Nav: rename, because headingless isn't native.** A truly headingless flat nav is NOT a config
  option — Payload renders one heading per group, and **`admin.group: false` HIDES the item** (verified
  in `groupNavItems`), not flattens it; a custom `Nav` override would have to re-implement the
  account/logout menu (`SettingsMenuButton` isn't cleanly exported) — too custom/fragile. So the clean
  native fix is to **rename** the vague groups to plain words and reorder: Content/Taxonomy/Collections
  → **Lesson plans / Curriculum / People**, ordered by the `collections` array (first-seen wins).
- **Redundant column:** `title` is derived from `meta.titleDoc` at ingest, so both columns duplicated;
  `admin.disableListColumn` on `titleDoc` bars it from the list (incl. saved user prefs), edit form
  unaffected.
- **OPERATIONAL — importMap without a Rock push.** Registering an admin view (the dashboard) requires
  regenerating `(payload)/admin/importMap.js`, and the local `payload generate:importmap` CLI breaks on
  Node > 22 (tsx loader). Rather than depend on the Rock (which has no git push credential), the entry
  was reproduced locally: Payload names the identifier **`default_<md5(component-path-WITHOUT-#default)>`**
  (verified against an existing entry), so the import + map line are byte-identical to the generator's
  output and can be hand-committed. **Lesson:** when only a component path is added, the importMap entry
  is deterministic and can be written by hand if codegen isn't runnable locally.

## 2026-06-23 — Async-export correctness fixes (external audit findings #4/#5/#6)

A full external audit (GPT-5.5) of Phase 5 surfaced three correctness bugs in the async-export path,
now fixed (tsc/eslint clean; not yet runtime-verified on the Rock):
- **#5 temp-file collision** (`artifactCache.putArtifact`): the temp path was `${file}.${pid}.tmp`, so
  two concurrent jobs producing the *same* key (duplicate cold exports) shared a temp file and could
  clobber each other before rename. Now `${file}.${pid}.${randomUUID()}.tmp` (per-write unique).
- **#6 manifest-only readiness** (`exportArtifacts.isExportReady`): it checked only the manifest, but
  `loadCachedExportZip` requires every listed deliverable. If a deliverable was evicted while the
  manifest survived, status said "ready" then the download re-enqueued (looked like a failure). Now
  `isExportReady` verifies the manifest **and** every artifact exists (cheap `hasArtifact` existence
  checks — added to the cache — no byte reads).
- **#4 stale-lockVersion stuck poll** (`exportStatus`): a job caches under its enqueue-time
  `lockVersion`, but status recomputed readiness from the *current* bundle. A republish mid-job left
  the client polling forever. Status now compares the job's `input.lockVersion` to the current spec and
  returns **409 "bundle changed — retry"** on drift; and if the job `completedAt` but artifacts aren't
  present (evicted post-completion), returns **409 "expired — retry"** instead of spinning. The client
  already treats a status `state:'error'` as terminal, so no client change was needed.

**Deferred from the same audit:** **#3 (GET `/export` enqueues on cache miss → not idempotent; a
cross-site top-level navigation with SameSite=Lax could consume quota/enqueue work).** The fix —
make GET serve-only and move enqueue to a `POST /export` (SameSite=Lax blocks cross-site POST, so the
CSRF vector closes) + the matching client handshake change — is a client-contract change to the
headline feature, so it is held to pair with **runtime verification on the Rock**, not blind-shipped.
The remaining audit items (#2 deps, #7 CSP/sanitization, #8 optimistic concurrency, #9 GraphQL gating,
#10 endpoint tests, #11 pagination, #12 PDF-fidelity CI) are the already-tracked production-hardening
backlog (NEXT-SESSION #2–#9) — the planned next phase, not single-turn fixes.

## 2026-06-23 — Jobs surface locked down (external-review finding; Payload defaults are permissive)

An external review (GPT-5.5 audit) flagged that the Phase 5 job surface trusted that only the export
endpoint could enqueue `generateArtifact`, but **Payload 3.85.1's job defaults are open**. Verified in
installed source:
- the **run endpoint** (`/api/payload-jobs/run`) access defaults to **`() => true`** —
  `jobsConfig.access?.run ?? (() => true)` — i.e. callable **unauthenticated**;
- the **`payload-jobs` collection ships with no `access` block**, so it falls back to
  `defaultAccess = ({ req:{ user } }) => Boolean(user)` — **any authenticated user** could
  `POST /api/payload-jobs` to enqueue `generateArtifact` with an arbitrary `input`, **bypassing the
  export endpoint's read-gate AND the per-user rate limit** (forces Gotenberg/cache work for any
  bundleId; a Teacher still can't *download* a bundle they can't read — export/status re-gate — but
  the generation work runs).

**Fix (`payload.config.ts` `jobs`):** set `jobs.access.{run,queue,cancel}` to `isSiteAdmin`, and add
`jobsCollectionOverrides` setting the collection access to `read: isSiteAdmin`, `create/update/delete:
() => false`. **Why this is safe for the system path (verified in source):** the export endpoint's
`payload.jobs.queue(...)` and the `autoRun` runner both use the Local API's default
`overrideAccess: true`, and job-state writes go through `payload.update` (Local-API default
overrideAccess true) or `payload.db.updateJobs` (direct DB) — all bypass access control. So the gates
hit **only external REST callers**. No schema change (access fns only) → no migration; deploy is the
plain `git pull` + `up -d --build` path. **Lesson:** Payload's job system is open-by-default — any app
exposing it must set `jobs.access` AND lock the `payload-jobs` collection via `jobsCollectionOverrides`.

## 2026-06-23 — Phase 5 (readiness #1): artifact cache + per-user rate limit + Jobs Queue async export

**DEPLOYED + verified live on the Rock 2026-06-23** (commit `d3525c0`): cold export → `202` +
enqueue → `autoRun` runner produced + cached the artifact → status `ready` → warm export → `200`
zip with a valid PDF. Closes the "heavy generation is synchronous + unthrottled" top risk and
finishes the deferred async half of the PDF slice. Verified the Payload **3.85.1** APIs against
installed source before building (knowledge-currency rule): `jobs.tasks` + `jobs.autoRun` exist;
**Payload 3 has NO built-in `rateLimit`** (dropped from v2's Express server — confirmed absent in
`config/types.d.ts`), so the limiter is necessarily custom.

- **Artifact cache behind a seam** (`generator/artifactCache.ts`). Generation is content-stable, so
  bytes are cached by `(bundleId, lockVersion, format, kind, doc)` — **`lockVersion` is the
  cache-buster** (it bumps on every bundle update, so an edit/republish auto-invalidates). Bounded
  on-disk LRU (atomic temp+rename writes; oldest-by-mtime eviction over `ARTIFACT_CACHE_MAX_BYTES`).
  Deliberately NOT a Payload media/storage layer (SPEC §9 defers persistence); swappable for object
  storage later. Durable across `up --build` via a **`lesson3_artifact_cache` named volume** on the
  `app` service (a cache wiped every deploy is near-useless). A warm `?as=pdf` export now skips
  Gotenberg entirely (the 120s-timeout path).
- **Per-user rate limit** (`lib/rateLimit.ts`) on export + both preview verbs → `429 + Retry-After`.
  In-memory sliding window, keyed by user id. **Per-process** (not shared across replicas; resets on
  restart) — correct for the single-box Rock; must move to a shared store if ever horizontally
  scaled. This bounds the *request rate*; the queue `limit` bounds *concurrency* — both needed.
- **Jobs Queue async export** (`jobs/generateArtifact.ts` + `jobs` config). Defining the task creates
  the **`payload-jobs` collection → a migration** (generate on the Rock per the runbook). In-process
  `autoRun` cron (`*/3 * * * * *`, 6-field seconds — croner supports it; `_initializeCrons` is gated
  `!isNextBuild()` so it never fires during `next build`) with **`limit` as the GLOBAL concurrency
  cap** on heavy conversions. Export endpoint is now **two-phase**: warm → `200` .zip synchronously;
  cold → enqueue + **`202`** + a status URL. New `GET …/export/status?jobId=` reports
  preparing/ready/error (binds the job to the bundle so a jobId can't probe unrelated jobs). The job
  output carries **no bytes** — artifacts live only in the cache; a manifest entry written LAST is
  the "ready" sentinel. Shared `generator/exportArtifacts.ts` is the single source of cache keys +
  zip assembly for both the sync endpoint and the async job (they cannot drift).
- **Frontend follows the 202 handshake** (`components/exportClient.ts`): the admin Export button and
  teacher download links are now JS-driven (fetch → poll → blob download) with Preparing…/error
  states, because a plain `<a href>`/navigation can't follow a 202. No importMap change (these are
  ordinary ESM imports inside already-registered client components, not new component-path entries).
- **Typing around `TypedJobs`:** the task is typed by its I/O *shape* (`TaskConfig<{ input; output }>`)
  not its slug, which keeps it strongly typed regardless of regen. The `payload-jobs`/`jobs.queue`
  slug casts were needed only *before* the Rock ran `generate:types`; once `payload-types.ts` landed on
  `main` (it now knows the `payload-jobs` collection + `generateArtifact` task) a follow-up `/simplify`
  pass **removed those casts** and switched the status endpoint to the real `PayloadJob` type. **Deploy
  = schema-change path:** on the Rock, `generate:types` + `migrate:create` (commit both), then
  `up -d --build`. Two follow-ups noted: completed jobs are kept (no auto-delete) for failure
  visibility → periodic cleanup later; the status endpoint is unthrottled (cheap, but a generous
  limiter could be added).
- **`/simplify` cleanup (post-merge, 2026-06-23, tsc/eslint clean):** the export download + status
  endpoints share one `authorizeExportRequest` gate (`endpoints/exportAuth.ts`) so the read-access +
  published-only check and `ArtifactSpec` can't drift between them; the now-redundant `TypedJobs` casts
  were dropped (see above); `produceArtifacts` restored **concurrent** PDF conversion (`Promise.all`,
  capped at the ≤3 deliverables — a serial-loop regression vs the original endpoint); and `safePrefix`
  + the rate-limit `Bucket` type were de-duplicated to single sources. Behavior-preserving — re-run the
  cold→ready→warm export smoke-test on the next Rock deploy to confirm at runtime.

**Deployment traps hit on the Rock (both env/infra, not code) — fix for any new artifact-cache deploy:**
1. **Named-volume root ownership.** A fresh Docker named volume mounts its path **root-owned**, but
   the Next standalone image runs as **uid 1001 `nextjs` / gid 65533 `nogroup`** (the scaffold's
   `adduser` sets no `-G`, so the primary group is `nogroup`). So the app couldn't `mkdir`/write the
   cache → the job failed with `EACCES` and the export stayed stuck at `202` forever. Fix: the
   Dockerfile now `mkdir -p /var/cache/lesson3 && chown nextjs:nogroup` **before `USER nextjs`**, so a
   fresh volume initialises writable (a new named volume inherits the image dir's ownership). The
   existing Rock volume was `chown`ed live (persists in the volume). **Lesson: any writable named
   volume on this image must be pre-created + chowned to `nextjs:nogroup` in the Dockerfile.**
2. **Missing `ARTIFACT_CACHE_DIR`.** Without the env var the cache fell back to its in-image default
   `/app/.artifact-cache`, which the non-root user also can't create → same `EACCES`. The var must be
   in the Rock `.env` (`/var/cache/lesson3`) AND the container recreated (`up -d --force-recreate app`)
   for it to take, since `env_file` is read at container create. **Diagnosis tip: the job error names
   the exact failing path — `mkdir '/app/.artifact-cache'` vs `/var/cache/lesson3` instantly tells you
   whether the env var or the volume ownership is wrong.** Both are now in `.env.example` + this entry.

## 2026-06-22 — PDF export slice (§9): Gotenberg sidecar behind a `docxToPdf` seam

PDF export shipped as a first slice and is **live on the Rock**. The locked SPEC §9 constraints
(faithful / free / fully offline / self-hostable) were realised as decided on 2026-06-14.

- **PDF = convert the generated DOCX, never a parallel renderer.** The same "one source of layout
  truth" rule that limits the mammoth preview to *content*. We feed the generator's own DOCX bytes
  to a **local office engine** and return its PDF — so the PDF reproduces the approved DOCX exactly.
- **Engine = a Gotenberg sidecar** (`gotenberg/gotenberg:8`, multi-arch/arm64, offline), wrapping
  headless LibreOffice. Packaged as a **separate compose service**, **internal-only — no published
  host port** (same isolation posture as Postgres); the app reaches it at `http://gotenberg:3000`
  (`GOTENBERG_URL`). Keeps the app image slim; the ~GB office engine lives in the sidecar.
- **Seam = `src/generator/docxToPdf.ts`** — the *only* module that knows the engine
  (`POST /forms/libreoffice/convert`; throws `PdfConversionError` → the endpoint maps it to **502**,
  an upstream-service failure, not a client error). Callers depend on `docxToPdf(buffer) → buffer`,
  so the engine can be swapped if the fidelity test ever favours another, without touching export.
- **`?as=pdf` on the existing export endpoint** (default `docx`) — reuses the **exact same READ
  gate** (`findReadableBundle` + `generateForBundle`, published-only) then converts each of the
  three DOCX and zips the PDFs. No new auth surface. DOCX/PDF picker added to the admin Export
  button and the teacher `/lessons/[id]` download links. **No schema change → no migration.**
- **Synchronous first; Jobs Queue deferred (approved fallback).** A single sub-strand converts in
  a few seconds, so the slice ships synchronously; the async Payload Jobs Queue
  (`jobs.tasks` generatePdf + in-process runner + enqueue/poll) is the immediate follow-up, not a
  blocker. This let the live slice land without queue plumbing that can't be verified off-Rock.
- **Fidelity gate is the engine's go/no-go — written, not yet run.** `scripts/pdf-fidelity-check.ts`
  converts the approved bio_1_4 DOCX via the seam and pixel-diffs each page (`pdftoppm` +
  ImageMagick `compare`) against **Word's own DOCX→PDF** (same input both sides → pure converter
  fidelity, so the Resource-column caveat the *generator* test carries does not apply). Blocked on:
  ImageMagick on the Rock (poppler already present), 3 staged Word `*.oracle.pdf`, and a path to
  reach the port-less `gotenberg`. **Conversion itself is proven live** (Teacher `?as=pdf` → zip of
  3 valid `%PDF` docs); the gate measures *layout faithfulness*, which is the remaining evidence.
- **Verified on the Rock** (commit `9ef5ccc`): `gotenberg /health` → 200 on the compose network;
  authenticated `?as=pdf` export → 200 `application/zip` with 3 `%PDF` files. tsc 0 / eslint 0 /
  `docker compose config` clean.

## 2026-06-22 — §5 editor refinements: browser smoke-test ALL PASS on the Rock

The three §5 refinements (live-unsaved preview, teacher Standard/Compact toggle, array row labels)
were code-complete since 2026-06-17 but never clicked through with real role logins. Done now,
driven via the Chrome MCP over Tailscale with seeded Teacher + Editor logins — **all checks pass**.

- Teacher login at `/admin` → redirects to The App home (the 2026-06-22 redirect fix, in a browser).
- Teacher format toggle Compact↔Standard re-renders server-side (`?format=`).
- **`POST /:id/preview` is edit-gated:** Teacher POST → **404**, while GET → **200** (read-gated) —
  the deliberate verb split holds. Editor **unsaved** prose edit → Preview renders it (banner
  "UNSAVED EDITS"); the stored bundle was verified pristine afterwards (nothing saved).
- Editor **structural** change (6→5 lessons) → **422**; oversize (>4 MB) `data` → **413**.
- Shared `RowLabel` confirmed on every nested array: **Lesson N —**, **Phase N —**, **Section N —**,
  **Rubric row N —**.
- **Lesson — cosmetic follow-up:** lesson rows read "**Lesson 1 — Lesson 1 — …**" because `RowLabel`
  prepends `Lesson N —` while the stored `title` already begins with its own `Lesson N —`. The other
  arrays don't double (their source fields carry no such prefix). Fix later in `components/RowLabel`
  (strip a leading `Lesson N —` for the lessons array, or drop its number prefix). **Rule:** when a
  RowLabel's source field may already embed its own ordinal, the label's `noun N —` prefix can
  duplicate it — pick the prefix per array against the field's actual content, not uniformly.

## 2026-06-22 — Teachers redirected from /admin to The App (no "unauthorized" error)

A Teacher who authenticated against `/admin` (the admin login form, or a stale post-logout
cookie reopening `/admin`) hit Payload's hard **"this user does not have access to the admin
panel"** error. Teachers live entirely in The App (SPEC §2; DECISIONS 2026-06-14), so this is a
dead end. Fixed by **overriding Payload's built-in `unauthorized` view**.

- **Mechanism (verified in installed source).** On admin-panel-access denial, Payload's `RootPage`
  calls `redirect(handleAuthRedirect(...))`; for an *authenticated* user that targets
  `admin.routes.unauthorized` (`/admin/unauthorized`), which renders the default `UnauthorizedView`.
  `getRouteData` resolves a per-key custom view first (`getCustomViewByKey`), so
  `admin.components.views.unauthorized` overrides the built-in. This is the **single chokepoint**
  for every admin-access denial, so it covers all entry paths (login, stale cookie, direct nav).
- **Fix.** New server component `components/AdminUnauthorizedRedirect` = `redirect('/')` (The App
  home / lesson-plans browse). Server-side → no error flash. It only ever runs for a user who
  failed `canUseAdminPanel` (Teachers); every authenticated user can view `/` (`requireUser`).
  Registered via Payload's own `generate:importmap` (run on the Rock, Node 22) — the canonical
  basic method, so the committed `importMap.js` matches generator output and future regens no-op.
- **Why the view-override, not middleware.** A Next.js middleware can't distinguish a Teacher from
  an Editor: `roles` is `saveToJWT` but `assignments` is NOT, and `canUseAdminPanel` =
  `isSiteAdmin || assignments.length`. The decision needs the DB-backed user, which the
  Payload-rendered view already has. The view-override is also config-only, no new route.
- **Verified on the Rock** (curl with real logins): Teacher → `GET /admin` follows to
  `http://…/` (200, "Lesson plans"); Editor → `GET /admin` stays at `/admin` (200, "Dashboard").
  Admins unaffected. Test users seeded + deleted.

## 2026-06-22 — UNIT model fix + contract hard gate + clean corpus re-ingest (deployed)

Three converging tracks, all shipped and verified on the Rock. The interim UNIT model fix
(deferred since 2026-06-17) is done: the Sub-Strand Overview now renders end-to-end.

- **UNIT model (Track 3).** The `unit` group modelled only a dead `overview` stub (the generator
  never reads `unit.overview` — Section B reads `lesson.overview`), so ingest dropped ARES's now-
  populated `UNIT`. Replaced it with the **17 canonical UNIT fields** the generator's
  `subStrandOverview()` reads (`vendor/lib/sections.js`) and the contract declares: 5 short
  (`structureText`: gradeLevel/subject/strand/substrand/totalDuration) + 12 prose (`proseAdmin`:
  content/learningOutcomes/coreCompetencies/values/sep/pcis/careers/focus/drivingQuestion/
  phenomenon/supportingPhenomena/storylineThread). All admin-only — the `enforceBundleStructure`
  whitelist preserves the whole `unit` group wholesale for Editors (UNIT isn't in `EDITOR_INFLUENCED`),
  so no hook change was needed. Migration `add_unit_fields` (idempotent `IF [NOT] EXISTS` on both
  `lesson_bundles` + `_lesson_bundles_v`; drops `unit_overview`). **Proven:** `roundtrip-regression`
  3/3 on the Rock through the full DB path — **LessonSequence 381 → 408 blocks** (the +27 are the
  Sub-Strand Overview rows), FE 52 / ST 37 identical.
- **Contract → HARD GATE (Track 2).** Flipped the warn-only drift check to blocking: `ingestItems`
  pre-flight now throws on any non-empty `contractDrift(raw)` (all-or-nothing, like
  `validateGeneratable`). 13/14 upstream files conform (`f36d47c`); **chem_1_4 is rejected** until
  its string `LESSONS[].number` is coerced to integer — the gate doing its job (we deferred chem_1_4
  from the corpus accordingly). `contract-check` gained the string-number reject case (11/11).
- **Clean re-ingest (Track 3e).** Per the user: version lineage beyond 1.0.0 is disposable in early
  testing → **wipe + re-ingest fresh** (not in-place backfill). New `scripts/wipe-bundles.ts`
  (deletes all bundles incl. published, guarded by `--yes`; companion to `publish-drafts.ts` whose
  `--delete` refuses published). Wiped the 13 old empty-UNIT bundles → ingested the 13 conforming
  upstream files once (all passed the hard gate) → published. DB confirms all 13 carry populated
  UNIT (`unit_content`/`unit_storyline_thread`/`unit_learning_outcomes` non-null).
- **Fidelity oracle refreshed.** The Desktop/Rock oracle was stale (`UNIT={}`, May-30 DOCX with no
  overview). Re-staged from `upstream/main`: populated-UNIT `bio_1_4_data.js` + ARES's regenerated
  `Biology_Chemicals_of_Life_*` DOCX (`data/outputs/docx/Grade 10 Biology/Bio 1.4/`, confirmed to
  carry the overview rows; its `_data.json` UNIT is byte-identical to the data file). Oracle = the
  generator's own regenerated output (proves OUR pipeline matches the generator on the new data).

**LESSON — local `tsc` can't catch type errors from dropped/renamed Payload fields.** Dropping
`unit.overview` left a stale `unit: { overview: null }` literal in `scripts/adapter-fidelity.ts`.
Local `tsc` passed because **`payload generate:types` is blocked on local Node 25**, so the Mac's
`payload-types.ts` still had `overview`; the Rock's *regenerated* types removed it and `next build`
failed the type-check. Rules: (1) when dropping/renaming a Payload field, **grep the whole codebase
for the old name** before deploying; (2) to type-check against the real new types without a Rock
round-trip, **fetch the Rock-regenerated `payload-types.ts` and run `tsc` against it locally**
(done here — caught nothing further; all gates green pre-redeploy).

**Git flow note.** Types + migration are generated on the Rock (Node 22 + DB), but to avoid stranded
un-pushable Rock commits, their content was pulled to the Mac and committed to origin (`3b9a364`),
then the Rock `reset --hard origin/main`. **origin is the single source of truth; the Rock mirrors
it.** Verified on the Rock: migration applied (38 ms), `verify-rbac` 36/36, app up.

## 2026-06-17 — ARES data-contract: drafted, shared, and validated on every ingest

ARES (Mark) agreed to canonicalise their data output. Root cause of the blank Sub-Strand
Overview: 12/13 source files carry a rich `UNIT`, but our `unit` group was modelled as a stub
(`{overview}`) so ingest dropped it. We delivered our half of the offer — a contract + drift
validation — WITHOUT yet doing the interim UNIT model fix (still deferred).

- **Canonical schema is the single source of truth, co-located in the app.** Moved the drafted
  JSON Schema to `app/src/ingest/ares-contract.schema.json` (from `docs/`) so the validator
  imports it directly (`resolveJsonModule`) and Next bundles it — a relative import across the
  `app/` boundary is fragile. `docs/ARES-DATA-REQUEST.md` links to it there; it's both our
  validation source AND the artifact shared with ARES, so the two can't drift.
- **Hand-rolled subset validator, not ajv (`src/ingest/contract.ts`).** Only ajv 6 is present
  (transitive, draft-07) and the project pins deps deliberately; our schema uses a small fixed
  keyword set (type/required/properties/additionalProperties/items/enum/pattern/minItems/minimum),
  and hand-rolling lets us emit ACTIONABLE drift messages — alias hints (`UNIT.duration` →
  `totalDuration`) and typo hints (`slo.safety3otes` → corrupted `safetyNotes`). De-risked by a
  DB-less gate (`scripts/contract-check.ts`, 9/9: conforming→0 drift, null sections allowed, each
  drift class detected).
- **Drift is NON-BLOCKING (report, don't gate) — for now.** Current ARES output doesn't conform
  (that's the drift we report), so a hard gate would block ingesting the preliminary corpus.
  Wired into ingest pre-flight as a per-bundle warning (alongside `deliverableWarnings`), validated
  on the RAW UPPERCASE object the contract describes. Promote to a hard gate once ARES conforms
  (same staged approach as the FE/ST deliverable decision). `scripts/contract-drift.ts` prints the
  full per-file report — both a pre-ingest preview and the artifact we send ARES.
- **What the report found across the 13 files** (sent upstream): widespread `safetyNotes`
  corruption (`safety1otes`..`safety8otes` in 5 files), missing `META.titleDoc`/`substrand_id`/
  `substrand_name` in several, a missing `LESSONS[3].summaryTablePrompt.explained` (bio_3_1), the
  `duration`/`storylineThread` aliases + stray `UNIT.keyInquiry` (bio_2_1, math_*), bio_1_4's empty
  UNIT, and a universally-missing `schemaVersion`. Validates that the contract is doing its job.

## 2026-06-17 — Codex review of the §5 preview: POST authz/boundary hardened; triage

Codex reviewed the live-unsaved preview + editor refinements. No critical RCE/secret issue.
Fixed the three High findings (all in the new `POST /:id/preview`) + two Lows; the rest are
pre-existing/tracked. All fixes tsc 0 / eslint 0; DB-less gates still green (ingest 24/24,
adapter 5/5, format2, fidelity 3/3). **Behavioural verify is on the Rock** (`verify-rbac.ts`
covers `isEditorFor` + `enforceBundleStructure`; the round-trip script covers cleanup-exit).

**FIXED:**
- **#1 POST preview authz — was read-gated, now edit-gated.** My "equivalent to save-then-
  preview" claim was WRONG: a Teacher can read (and so could POST to) any *published* bundle,
  but cannot save — so read access let a non-editor drive the render path with arbitrary
  content. Rule: **unsaved preview is an EDITING affordance → require `isEditorFor` for the
  bundle's subject-grade** (Teachers → 404). GET stays read-gated (it shows only stored content).
- **#2 Field-boundary bypass — now reuses the save hook.** The whole-object overlay bypassed
  `enforceBundleStructure`'s editor whitelist, so an Editor could preview admin-only/structural
  changes they couldn't save. Fix: **call `enforceBundleStructure` (a pure, sync function)
  directly on the posted candidate** — Editor → prose-only overlay, structural change → 422,
  Subject/Site Admin → unrestricted. Reusing the hook (not a parallel whitelist) means preview
  and save can't drift — the key altitude point. The hook trusts that update-access already
  passed, which is exactly why #1's gate must run first.
- **#3 No payload cap — added.** Cap the posted JSON before parse/generate
  (`MAX_PREVIEW_JSON_BYTES = 4 MB`, 413). Full per-request body-limit + rate-limit + Jobs-Queue
  for generation stays the deferred production item (#2/#3 below).
- **#10 round-trip cleanup now fails the gate.** A self-cleaning gate that leaves rows behind is
  a failed gate (else CI/Rock silently accumulate state) — track cleanup failures, exit non-zero.
- **#9 RowLabel committed.** The new `components/RowLabel/` is part of the commit with its
  importMap entry (was untracked at review time).

**TRIAGED / pre-existing (NOT this session's regressions):**
- **#4 optimistic concurrency (`lockVersion` incremented but not checked)** — real, but
  pre-existing and already an open item; API/script updates can still clobber. Backlog.
- **#5 sanitize shared `docxToSections` HTML + add CSP to the teacher frontend route** — the
  same tracked XSS-hardening item (low exploitability today: prose is plain text, mammoth
  escapes; raise priority when Resource links land). The admin preview already sends a
  script-blocking CSP; the teacher Next.js route does not (needs an app-wide CSP strategy).
- **#6 FE/ST warn-only vs SPEC's three-documents** — the deliberate deferred decision (promote
  `deliverableWarnings` to a hard gate once the corpus is confirmed to always carry all three).
- **#7 dep advisories (vitest/postcss/esbuild, dev-tooling)** — backlog; deliberate pinned
  upgrade + re-run gates.
- **#8 no tests for POST preview authz/whitelist/limits** — fair. The logic is covered indirectly
  by `verify-rbac.ts` (roles + hook). Follow-up: add HTTP-level int tests (Teacher POST→404,
  Editor structural→422, oversize→413) — needs the cookie-auth + role-fixture harness the
  current `tests/int/api.int.spec.ts` lacks; deferred rather than shipped unrun (no local DB).

## 2026-06-17 — §5 editor refinements: live-unsaved preview, teacher format toggle, array row labels

Three §5 editor refinements (priority #2), code-complete + tsc/eslint clean; functional verify
is on the Rock (admin-component / endpoint / field-config changes → `up -d --build`, NOT a
script-only re-run). **No new stored fields, no migration, no payload-types regen.**

- **Live-unsaved preview.** Preview now reflects the editor's CURRENT form state — unsaved
  edits included — instead of only the latest saved snapshot. Added `POST /:id/preview`
  alongside the existing `GET` (`endpoints/previewBundle.ts`): same READ gate
  (`findReadableBundle(draft:true)`), then OVERLAYS the posted form values onto the stored
  bundle (pinning stored `id`/`_status` so the body can't spoof identity/exportability) and
  renders. Output stays HTML-only behind the same script-free CSP — rendering the caller's own
  posted content is **equivalent to save-then-preview**, so no new trust surface. The
  `PreviewBundle` control reads form state via `useAllFormFields` + `reduceFieldsToValues(.,true)`
  and submits a hidden transient `<form method=POST target=_blank>` so the new tab gets the
  endpoint's real HTML response (real CSP headers) — no fetch/blob round-trip. GET (saved) and
  POST (unsaved) share one `renderPreviewResponse` so they can't drift on gating/422/500/CSP.
- **Teacher format toggle.** The teacher inline view (`(frontend)/lessons/[id]`) gained a
  Standard/Compact toggle via a `?format=` **searchParam** (server-rendered, no client JS),
  matching the existing download links. Default stays **Compact** (the 2026-06-16 decision —
  Standard's Resource column is deferred/blank); Standard is available on demand.
- **Array row labels.** Collapsed rows for all five nested arrays (lessons, framework phases,
  FE sections, summary-table rows, rubric) now read "<noun> N — <first line of a field>"
  (e.g. "Lesson 1 — …", "Phase 2 — Observe Phase") instead of generic "Lesson 01". ONE shared
  client component `components/RowLabel` configured per array via `admin.components.RowLabel`
  `clientProps: { field, noun }`; falls back to "<noun> N" for an empty new row. **Lesson: one
  importMap.js entry covers all five** — the entry keys on the component PATH
  (`@/components/RowLabel#default`), not the call site, so reusing one component across many
  arrays needs a single hand-registered binding (generate:importmap still blocked on local
  Node 25). `PHASE_OPTIONS` has label===value, so the phase row label just shows `data.phase`
  — the component stays fully generic (`{ field, noun }`), no phase special-casing.

## 2026-06-17 — Repeatable round-trip regression (priority #1 DONE; 3/3 on the Rock)

The manual Phase-4 round-trip is now ONE self-cleaning command, run + green on the Rock.

- **New gate `app/scripts/roundtrip-regression.ts`.** Proves the *stored* path stays
  content-faithful (not just the DB-less `fidelity-spike`): seed-if-missing taxonomy →
  `ingestPaths(bio_1_4_data.js)` → 1.0.0 draft → publish → `generateForBundle('standard')` →
  `compareDoc` ×3 vs the approved DOCX (Resource column excluded for the SoW). Reuses
  `scripts/lib/docxDiff.ts`. **Result: 3/3 content-identical.** Runs fully in-process on the
  Rock — no Mac round-trip (the earlier Phase-4 proof pulled the DOCX to the Mac to diff).
- **Self-cleaning + non-destructive (the design rule for DB gates):** track every record the
  script creates and delete it in a `finally`, newest-first (bundle → SubjectGrade → Subject).
  Seed taxonomy only if absent and delete only what was seeded; ingest always creates a *fresh*
  draft, so the live published bundle is never touched. Cleanup runs on pass AND on crash, so
  re-running is always safe. (Same track-and-teardown pattern as `verify-rbac.ts`.)
- **Lessons (Rock script-run gotchas, both hit live):**
  1. **A script-only change must be committed + pushed before the Rock can run it.** The Rock
     bind-mounts `/srv/lesson3/app`; `git pull` only sees *committed* files — an uncommitted
     local script gives `ERR_MODULE_NOT_FOUND` for the `.ts` path. (Predicted, then hit.)
  2. **The approved DOCX + data file must be staged on the Rock** (e.g. `/srv/lesson3/out/
     ares-demo`) and pointed at via `ARES_DEMO_PATH`. They were Mac-only before this gate.
- **Invocation (deps-image + bind-mount + compose network, the established script-run line):**
  `docker run --rm --network lesson3_default -v /srv/lesson3/app:/app -v /app/node_modules -w /app
  --env-file .env -v /srv/lesson3/out:/out -e ARES_DEMO_PATH=/out/ares-demo lesson3-deps
  npx payload run scripts/roundtrip-regression.ts`. Like the sibling gates, it's not a
  package.json script — the run command lives in the file header.

## 2026-06-16 — Preview layout: Compact default; HTML preview stays content-only (no width injection)

After deploying §5 and eyeballing real lessons in-browser, two layout decisions (don't re-litigate):

- **On-screen preview defaults to Compact.** The Resource column is deferred/blank, so Standard's
  HTML preview renders an **empty** column. Default both surfaces to Compact (the admin Preview
  keeps a Standard/Compact toggle; the teacher inline view is Compact-only — both export formats
  still download). Compact also gives the four content columns **equal** widths in the DOCX.
- **Do NOT inject fixed column widths into the HTML preview.** The browser's auto-layout makes the
  content columns uneven (sizes by text, ignoring the generator's DXA widths), which looks less
  balanced than the DOCX. We considered injecting the generator's `cw` proportions via a `colgroup`
  but **rejected it:** (1) it's cosmetic polish on the **content-preview tier**, which is explicitly
  *not* the faithful view; (2) it doesn't generalize — forcing the DOCX widths in **Standard** would
  reserve ~19% for the *empty* Resource column (worse, not better); (3) faithful layout/colour is the
  job of the future **PDF** (the *converted* DOCX), and the **DOCX export already has correct widths +
  colour**. Rule: the HTML preview is the fast content check; fidelity lives in the DOCX/PDF, never in
  a second HTML renderer (same single-source-of-layout-truth reasoning as the PDF decision).
- **Build gotcha (lesson):** the production `PAYLOAD_SECRET` fail-fast (#1) **broke `next build`** —
  build-time page-data collection runs with `NODE_ENV=production` but **without** the runtime secret
  (injected at container runtime via `--env-file`). Gate such runtime-only guards on
  `process.env.NEXT_PHASE === 'phase-production-build'`. Build-time config evaluation ≠ runtime.

## 2026-06-16 — §5 preview shipped; corpus published + deduped; Codex-review hardening

Three threads this session: the corpus went live, the §5 content preview shipped, and an
external (Codex) review was triaged.

**Corpus: 13 canonical published bundles (was 27 with duplicates).** The Rock had drifted
to 27 bundles — the Site-Admin web upload **dedups within a single request, not across
requests**, so re-uploading the same set created duplicate drafts (three waves on 06-14:
ids 36–47 and a verbatim 48–59, plus stragglers). Resolved by picking **batch B (48–59) +
bundle 33** (Chemicals, the fidelity oracle) as canonical — it already contained the only
pre-published members (33, 56, 59) so nothing had to be un-published — publishing its 10
remaining drafts and **deleting the 14 duplicates** (34–47). Result: one published bundle
per distinct sub-strand (10 Biology + 3 Math). New tool `app/scripts/publish-drafts.ts`
(`--list` / `--drafts` / id-list / `--delete`) did the batch work.
- **Correction — FE/ST presence:** a naive `--list` that checked field *truthiness* labeled
  all 13 as "FE ST", but the **generator's output is the truth**: **6/13 produce empty
  FE/ST** (the documented upstream gap). The field can be a non-null-but-empty group. Trust
  `generateBundleDocx`'s null buffers, not the stored field's truthiness.

**§5 content preview shipped (teacher + admin).** Teacher view now renders all three
documents (FE/ST omitted when absent). New **admin draft-capable preview** so an editor can
see saved-draft output before publishing. Design decisions:
- **Preview ≠ export — a separate HTML-only, draft-capable core.** `renderBundlePreview`
  (and the shared `docxToSections`) has **no published/exportable gate** — the deliberate
  difference from `generateForBundle`. It returns **HTML only, never DOCX bytes**, so it can
  never be an export bypass. Authorization is enforced at the endpoint
  (`findReadableBundle(draft:true)` — the read access rule still filters, so a Teacher can't
  reach a draft), exactly as the export endpoint does.
- **Incomplete-draft 422 reuses the publish gate.** The preview endpoint calls
  `validateGeneratable` (the same single-source gate `enforceGeneratable` uses) to return a
  **precise** "can't preview yet: <reasons>" (422); an unexpected throw *after* completeness
  passes is **logged and surfaced as 500**, not masked. (Fixes the first-draft blanket
  `catch` that turned every error into 422.)
- **Previews the latest SAVED snapshot**, not unsaved form state (live form-state preview is
  deferred — far bigger). Returned HTML page is **script-free + CSP-locked**; the frontend
  view relies on mammoth text-escaping (our prose is plain strings, no inline markup).

**Codex review — dispositions.** Fixed in-change: **#5** (blanket catch masking failures),
**#8** (`publish-drafts.ts` `process.exit(0)` overrode `process.exitCode` → false CI
success). Folded in as separate hardening: **#1** (fail-fast on missing `PAYLOAD_SECRET` in
production — was `|| ''`), **#10** (removed the dead `my-route` scaffold). **Deferred**
(pre-existing / already-tracked): #2 rate-limit/Jobs-Queue, #3 dep advisories, #6 FE/ST hard
gate, #7 official-version model, #9 CSRF posture (our preview is a read-only GET).
- **#4 XSS — kept as an open hardening item, not closed.** No *current* attacker-controlled
  HTML path (mammoth escapes text; our generated DOCX carries no user-controlled hrefs/
  images), but both preview surfaces *trust generated HTML*, so it stays a high-value
  hardening point. When the deferred **Resource-column links** land, sanitize in the shared
  `docxToSections` chokepoint (DOMPurify) — a deliberate dependency decision, declined for now.

**Calibration (lesson).** Two claims were corrected as overstated: "**Rock deploy** ≠
**production-ready**" (the Rock is a non-production verification environment; the audit's
production blockers stand), and the `validateGeneratable` happy-path invariant holds for
bundles **published via the normal hook**, not unconditionally (overrideAccess scripts /
legacy data / hook drift could violate it — the failure mode is a benign 422, not a crash).

## 2026-06-14 — PDF converter: open decision, but constraints locked (offline/free/faithful)

PDF output (and emailing/linking PDF + DOCX in the messaging platform) is confirmed in scope
(SPEC §9/§10). The converter is **not locked in**, but the constraints are:

- **Faithful** — must reproduce the generator's complex DOCX (40 tables, merged cells, shading,
  column widths). **PDF must be the *converted DOCX*, never a parallel renderer** (one source of
  layout truth — the same reason the mammoth view is a *content*-only preview). This **disqualifies
  semantic converters** (Pandoc, mammoth/HTML→Chromium/wkhtmltopdf): they reinterpret layout and
  won't match the approved DOCX. Good enough for a rough preview, not for the exact artifact.
- **Free — no paid/commercial product or service** (rules out Aspose/Apryse/Syncfusion/etc.).
- **Fully offline — no cloud** (rules out MS Graph convert and any metered API). Offline is a
  product goal; lesson content must not leave the box.
- These three together → the viable class is a **local office engine** (LibreOffice headless, or
  OnlyOffice/Collabora). There is **no lightweight free converter** at this fidelity — the bulk
  (~0.4–1 GB; minimal headless Writer ~0.4–0.7 GB, full suite ~1 GB+; ~150–300 MB RAM/run, slow
  cold start) is intrinsic to faithful Word layout. Fine on the Rock's **NVMe**.
- **Preferred packaging:** a **sidecar container** (e.g. Gotenberg wrapping LibreOffice — multi-arch
  incl. arm64, offline) so the app image stays slim and the converter is isolated/poolable. PDF is
  slow → **Jobs Queue (async)**.
- **How the engine gets chosen:** by a **golden-file fidelity test** (Word's own DOCX→PDF as the
  oracle) on a real ARES lesson, when the PDF slice is built. Until then, code calls a swappable
  **`docxToPdf(buffer)`** seam so nothing depends on the specific engine.
- **Artifacts are addressable/version-pinned/access-gated** (bundle, version, document, format,
  layout) — stable URLs that resolve deterministically (generation is content-stable). Email
  attaches freshly-generated bytes; messages link the URL; persistence/caching is a later
  optimization (avoids reintroducing media storage now).

## 2026-06-14 — Architecture: a unified role-aware App for all users + `/admin` as back-office

Confirmed the product is **two front-ends over one Payload backend** (one runtime/auth/access):
**The App** — a role-aware front-of-house frontend (`app/src/app/(frontend)`) that *all four roles*
log into — and **Payload `/admin`** as the content/admin back-office. See SPEC §2 ("Two application
surfaces") + §10 (the now-confirmed cross-user workflows).

- **What forced the decision.** The user confirmed a set of features **common to every role**:
  browse/view/export, **email a document**, **internal messaging + notifications** (any user → any
  user, optional bundle link/attachment), **translation** (Swahili), and **AI features**. A
  teacher-only frontend would force duplicating those across two apps (or making editors switch
  apps). So they belong in one shared App; `/admin` stays the editing/management console for
  Editors/Subject Admins/Site Admins.
- **Roles map cleanly to surfaces.** Teachers (the majority) live *entirely* in the App
  (intentionally excluded from `/admin`). Editors/Subject Admins use the App for the common
  features and `/admin` for editing; Site Admins administer in `/admin`. The §13 minimal-UI
  principle governs the App's role-aware rendering (show only what the role can do).
- **Resolves prior open decisions.** SPEC §2 "editor placement" → start in `/admin`, optionally
  move editing into the App later (the §5 Phase-2 custom editor, now well-motivated). SPEC §10
  workflows (messaging/favorites/browse) → **confirmed in scope**, plus email-out, translation, AI.
- **No core-architecture change.** New surface = the already-scaffolded `(frontend)` route on
  Payload's API + auth; new features = ordinary Payload collections/endpoints/hooks + the Jobs
  Queue. Single runtime preserved. Outbound services (AI, email, translation) stay server-side,
  rate-limited (§11); AI uses the current Claude API/models.
- **Sequencing.** Phase 2+ track; does NOT block current `/admin` work (publish the uploaded
  drafts, §5 editing cleanup). Recommended first App slice: the teacher-critical path
  (browse → view → export — the majority's core need and the only surface that doesn't exist yet).

### Sample role logins for UI testing (2026-06-14)

Added `app/scripts/seed-users.ts` — creates one Teacher, one Editor, one Subject-Grade Admin
(Editor + Subject Admin scoped to Biology G10 by default) via the Local API, to exercise the
role-tailored UI. Credentials from env or randomly generated + printed once (no secrets committed);
idempotent (skips existing emails). Run on the Rock (needs a DB). Note: the Teacher login has **no
surface until The App exists** — it's created ready for that.

## 2026-06-14 — Admin session timeout: 15-min expiry + reliable idle-logout backstop

Auth `tokenExpiration: 900` (15 min) is the admin inactivity window (commit `d0cf69a`).
Investigated a report that the "Stay logged in?" modal lingered for a very long time and the
session seemed resurrectable. Traced through the installed Payload 3.85 source and confirmed
behavior on the Rock:

- **Server-side enforcement is sound — no security hole.** The auth cookie's `Expires` and the
  JWT `exp` are both `issuedAt + tokenExpiration` (`auth/cookies.js` `getCookieExpiration`;
  `auth/jwt.js`). `jwtVerify` (jose) rejects an expired JWT, and the `refresh-token` operation
  throws `Forbidden` without a valid `req.user` (`auth/operations/refresh.js`). So after 15 min of
  real time the session genuinely dies — confirmed: reloading/navigating past the window bounces
  to login. No `autoLogin` is configured (ruled out as a resurrection path).
- **The defect was client-side.** Payload's *proactive* auto-logout is a single `setTimeout`
  scheduled for the deadline (`providers/Auth/index.js`); browsers throttle/suspend timers in
  backgrounded or slept tabs, so an idle tab lingers past expiry and only clears "eventually" (on
  the next server interaction). Annoying, not a breach — a stale tab can't act once the token dies.
- **Fix — `IdleLogout` wall-clock backstop** (`app/src/components/IdleLogout`, mounted via
  `admin.components.providers`, so it's always inside `AuthProvider`). Uses Payload's own auth
  context (`tokenExpirationMs` + `logOut`): a 30 s interval (focused-idle tab → out within ~30 s)
  plus `focus`/`visibilitychange` (slept/backgrounded tab → out immediately on return). It never
  logs out an active user — `tokenExpirationMs` advances on every refresh (activity or clicking
  "Stay logged in"). It changes no server behavior; it only makes the tab terminate promptly.
- **General rule:** don't rely on a single client `setTimeout` for security-relevant timing —
  browsers suspend timers off-screen. Enforce server-side (already true here) and, for UX, check
  the wall clock on an interval + visibility/focus.

## 2026-06-13 — Site-Admin web upload for ingest (DEVIATION from SPEC §7 "no HTTP/upload surface")

The user asked for an in-browser upload to add bundles, Site-Administrator-only, with the
control hidden from everyone else. This **reverses** SPEC §7's original "ingest is … never an
HTTP/upload surface." Recorded as a deliberate, documented deviation; SPEC §7 updated.

- **Why it's now safe.** The original rule existed to prevent **executing uploaded `.js`** (RCE).
  Uploads are never executed: the web path is **JSON-only** (`JSON.parse` via `extractAresJson`).
  `.js` stays CLI-only. So the threat the rule guarded against doesn't apply to the web surface.
- **Authorization is server-side, not cosmetic.** `POST /api/lesson-bundles/upload`
  (`app/src/endpoints/uploadBundles.ts`) enforces `isSiteAdmin(req.user)` → 401/403; the
  self-hiding list panel (`app/src/components/UploadBundles`, `beforeListTable`, returns null
  unless `roles` includes `siteAdmin`) is convenience only. `roles` is `saveToJWT`, so the client
  check needs no fetch.
- **Guardrails:** JSON only (`.json` extension + content-type-agnostic safe parse), per-file 5 MB
  / 50-file caps, the same `validateGeneratable` + exact-match taxonomy gates as the CLI, and the
  same **all-or-nothing** transaction. Pre-flight failures → **422** with the actionable per-file
  message; nothing written. Bundles land as **drafts** — publish stays a separate step (no
  auto-publish from upload).
- **Shared core (no duplication).** Refactored `app/src/ingest/index.ts` to a single
  `ingestItems(payload, items)` where each item is `{ name, extract() }` (a thunk so parse
  errors aggregate in pre-flight). `ingestPaths` (CLI) and the endpoint both call it; the endpoint
  runs it as the trusted system path *after* the Site-Admin gate.
- **Verified:** `tsc` 0 / eslint 0; ingest gate 24/24; importMap hand-updated for the new
  component (the `payload generate:importmap` CLI is blocked locally by the 3.85.1/Node-25 tsx
  bug — entry added with Payload's exact `default_<md5(path)>` binding so a Rock regen is a no-op).
  **Endpoint + panel are runtime-tested on the Rock (need a DB).** TODO before real exposure:
  **re-run `security-review`** on this web ingest surface (SPEC §7 calls ingest the highest-risk
  surface; a web entry point warrants a fresh pass).

## 2026-06-13 — Ingest accepts `.json` exports as well as `.js` modules (SPEC §7)

ARES prefers JSON as the transport format (and its repo now emits `*_data.json` exports), so
ingest now reads both. Confirmed the two are equivalent before building: for the same
sub-strand the `.js` module and ARES's official `.json` export are **deep-equal** (verified
on bio_3_3 — same five groups, same fields, ~213 KB each; neither carries `framework[].resources`,
so JSON does *not* un-blank the Resource column — that's still ARES's build-time Python step).

- **Only the read step differs; everything downstream is shared.** New `extractAresJson(source)`
  in `src/ingest/extract.ts` is the `.json` sibling of `extractAresData`. `src/ingest/index.ts`
  picks by extension (`gatherDataFiles` accepts `.js`/`.json`; `extractDataFile` branches), then
  feeds the same `rawToBundle → validateGeneratable → create` pipeline. Proven: a real clone
  `.json` → `extractAresJson` → `rawToBundle` is deep-equal to the `.js` path (0 validate problems).
- **Security: no new execution surface.** `JSON.parse` only yields data — there is no
  parse-never-execute concern as there is for `.js`. We still apply the structural guards the
  `.js` path enforces, for parity: reject a non-object root, **recursively reject `__proto__`
  keys** (JSON.parse makes `__proto__` an own property rather than polluting the prototype, but
  we reject it so downstream spread/assign can't be surprised), and require the five top-level
  groups.
- **CLI unchanged in spirit** — `payload run scripts/ingest.ts -- <file.js | file.json | dir>`;
  a directory ingests every `.js`/`.json` in it. (Pointing at a dir holding BOTH a `.js` and a
  `.json` for the same sub-strand would create two bundles — ingest has no dedupe; in the ARES
  clone the two live in different dirs so this doesn't arise.)
- **Verified:** `ingest-extract-check.ts` extended to **24/24** (round-trip JS↔JSON parity +
  the three reject guards + accept-valid); `tsc` 0 / eslint 0.

## 2026-06-13 — Payload 3.85.0 → 3.85.1 (deliberate patch bump)

Took the 3.85.1 patch after reviewing the changelog (none of the seven fixes touch us —
they're upload-collections / import-export-plugin / conditional-tabs / TS6 areas we don't
use). Bumped all six pins (`payload` + `@payloadcms/{db-postgres,email-nodemailer,next,
richtext-lexical,ui}`) to exact `3.85.1`; transitive `@payloadcms/{drizzle,graphql,
translations}` followed. Verified locally: `tsc` 0, eslint 0, **fidelity 3/3**, **format2
7/7** — the fidelity-critical chain is intact.

- **Caveat (dev-env only) — `payload generate:importmap`/`generate:types` fail locally on
  Node 25.** 3.85.1 bundles `tsx@4.22.4`, whose loader throws
  `ENOENT … node:path?tsx-namespace=…` under **Node 25** (my local). It works on **Node
  22.17.0** (the Docker base, `app/Dockerfile`) — so the **Rock is unaffected** (build,
  migrations, `payload run` scripts all run on Node 22). Our own DB-less gates use the
  project's `tsx@4.21.0` devDep and are fine. **Not worked around:** an `overrides: { tsx }`
  pin (a) didn't re-resolve payload's nested copy cleanly and (b) would impose a tsx pin on
  the Rock to paper over a local bleeding-edge-Node issue — wrong trade. To run those two
  CLIs locally, use Node ≤23 (or the deps Docker image); otherwise they run on the Rock.
- **Deferred-to-Rock verification (unchanged from prior workflow).** `generate:types`,
  `generate:importmap`, and `next build` run on the Rock at deploy (Node 22). `next build`/
  `test:int` were already Rock-only (need a DB). The committed `importMap.js` and
  `payload-types.ts` are valid as-is — a patch with no schema/field change on our side
  doesn't alter generated output, and `tsc` passes against the committed types under 3.85.1.
  If `generate:types` yields a diff on the Rock, commit it.

## 2026-06-13 — Second LessonSequence DOCX format (compact, no Resource column)

Added a **second LessonSequence layout**, selectable per-export, alongside the existing
(now-named `standard`) one. The new `compact` format addresses two complaints with the
upstream layout: the narrow first column wrapped phase names mid-word, and the Resource
column rendered blank (the Python recommender is out of scope — see the 2026-06-08/09
resource decisions). Only **Section C** ("C. Lesson Implementation Framework") differs;
FinalExplanation and SummaryTable are identical across formats.

- **What changes.** `standard` Section C = 6 columns `[900, 2300, 2556, 3324, 2300, 2300]`
  with the (blank) Resource column. `compact` = 5 columns, Resource **removed**, widths
  `[2261, 2854, 2854, 2854, 2857]` DXA — Phase fixed at **1.57″ (2261 DXA)**, the other
  four split the remaining content width evenly so the row sums to exactly **13680 DXA**
  (no overflow). The four flex widths are *derived from* the vendored content width `W`
  (`floor((W − 2261) / 4)`, remainder on the last column), so they track any future margin
  change automatically.
- **Width reasoning (recorded so it isn't re-litigated).** Page is landscape US Letter
  (15840 DXA wide). The generator **overrides** margins to 0.75″ (1080 DXA), giving a
  **13680 DXA (9.5″)** content area — *wider* than docx's default 1″ margins would
  (`docx@9.6.1` `sectionMarginDefaults` = 1440 all round → 12960 DXA / 9.0″). The user's
  first instinct (four 2.00″/2880-DXA columns) overflowed by ~0.07″; at the kept 0.75″
  margins, even columns land at **1.98″ (2855 DXA)** and fit exactly. Chosen:
  keep 0.75″ margins, columns ≈ 1.98″. Phase column was explicitly kept at 1.57″.
- **Where the toggle lives — per-export parameter, NOT stored on the bundle.** Confirmed
  with the user. A format is a *presentation* choice; storing it on the versioned bundle
  would couple data to presentation and need a migration, against "edit the data, never the
  document" (SPEC §5). So `format: 'standard' | 'compact'` is a function/CLI argument
  (default `'standard'`), threaded `generateBundleDocx` → `generateForBundle` → the
  `generate-bundle` CLI `--format=` flag, and ready for the future §9 export/preview UI to
  pass per request. No schema change, no migration.
- **Vendored code stays byte-pristine.** Format 1 remains the pure vendored path
  (`vendor/lib/build_docs.js` → `sections.js`), so its fidelity is untouched — re-verified
  **3/3 content-identical** via `fidelity-spike.ts`. Format 2 is Lesson3-owned
  `app/src/generator/buildSowCompact.cjs`: a CommonJS bridge that **reuses** the vendored
  primitives (`docx_kit`) and unchanged section builders (`sectionA/B/D/E`,
  `titleBlock`, …), re-implementing only `sectionC` + the `buildSoW` wrapper. It is loaded
  via `createRequire` like the vendored generator; a one-file eslint override exempts it
  from the ESM-only `no-require-imports` rule (require() is correct for the CJS bridge).
- **LESSON — a CJS bridge file outside `vendor/` MUST be `.cjs`, not `.js`.** First written
  as `buildSowCompact.js`; it ran under `tsx` (which transpiled it) but **broke under
  `payload generate:importmap`** with "require is not defined in ES module scope". Cause:
  the app root `package.json` is `"type":"module"`, so a bare `.js` there is ESM; the
  vendored `.js` only load as CJS because `vendor/package.json` declares
  `"type":"commonjs"`. Node's native `require(ESM)` path (used by the Payload CLI, not just
  tsx) then loads the `.js` as ESM and `require`/`module.exports` are undefined. Fix: the
  `.cjs` extension forces CommonJS unconditionally. Rule: any new require()-style bridge
  module living under the `"type":"module"` tree gets `.cjs` (or its own
  `package.json{"type":"commonjs"}`).

### §9 export — first slice: web download with the format toggle (2026-06-13)

Wired the standard/compact toggle into the admin UI (the user's follow-up: "toggle from the
web interface, not just the CLI"). This is the first piece of SPEC §9 (export/sharing) —
there was no export endpoint or admin component before.

- **Output = all three DOCX as one `.zip`** (confirmed with the user), mirroring the CLI.
  `jszip` promoted from transitive to an **exact direct dependency (3.10.1)** — it's now
  runtime app code, so the Rock's `npm ci` must resolve it from the lockfile (same reasoning
  as the acorn promotion). The format only changes the LessonSequence; FE/ST are identical.
- **Endpoint = Payload collection endpoint** (`app/src/endpoints/exportBundle.ts`), mounted
  `GET /api/lesson-bundles/:id/export?format=standard|compact`. Payload-first: a native
  collection endpoint, not a hand-rolled Next route, so it gets `req.user` + the Local API.
  **Authorization lives here, by design** — `generateForBundle` fetches with
  `overrideAccess:true` (trusted system path, per its own security note), so the endpoint
  FIRST re-reads the bundle with `overrideAccess:false` + `user` to enforce `lessonBundleRead`
  (a Teacher can export only published bundles; an Editor only within their subject-grades →
  else 404). `NotExportableError` (draft) → 409; bad format → 400; no user → 401.
- **Admin control = client component** (`app/src/components/ExportBundle/index.tsx`) injected
  via `admin.components.edit.beforeDocumentControls`. `useDocumentInfo()` gives `id` +
  `hasPublishedDoc`: hidden on unsaved docs, disabled (with a "publish to enable" tooltip)
  when no published version exists. Download is a same-origin `window.location` GET so the
  admin auth cookie rides along; the attachment Content-Disposition downloads without
  unloading the edit page. Registered in the import map (`@/components/ExportBundle#default`,
  committed `importMap.js`).
- **Synchronous for now.** SPEC §9 mentions the Jobs Queue for long generations; a single
  bundle generates in well under a second, so v1 returns the zip inline. Promote to the Jobs
  Queue if/when batch or very large exports need it.
- **Verification.** `tsc` 0 / eslint 0; `generate:importmap` loads the whole config through
  the new endpoint→generator→`.cjs` chain (also how the `.js`→`.cjs` bug surfaced);
  standalone zip round-trip = 3 valid DOCX entries; both DOCX gates still green
  (fidelity 3/3, format2 7/7). Endpoint+button runtime-tested on the Rock (needs a DB).
- **Deploy delta.** Unlike the CLI-only change, this adds app-server code + a dependency +
  a component, so the Rock needs a full `docker compose up -d --build` (not `git pull` +
  re-run), and `npm ci` picks up jszip from the committed lockfile.
- **Verification.** New DB-less gate `app/scripts/format2-check.ts` (7/7): unzips
  `word/document.xml`, asserts compact Section-C grids are 5-col `[2261,2854,2854,2854,2857]`
  summing to 13680, standard stays 6-col with Resource, no cross-leak, and FE/ST
  **content** (document.xml) is identical across formats. Note: full-buffer byte-equality
  is *not* a valid assertion — `docProps/core.xml` carries a per-build timestamp, so
  "byte-stable regeneration" (SPEC §4) means *content*-stable; compare `document.xml`, as
  the fidelity gate already does via mammoth. `tsc` 0 / eslint 0; standard fidelity 3/3.

## 2026-06-09 — Phase 3: safe `.js → JSON` ingest (SPEC §7)

Built the ingest path on `main`: ARES `.js` data modules → stored bundles created as 1.0.0
drafts via the Local API. New code under `app/src/ingest/` (`extract.ts`, `toBundle.ts`,
`validateGeneratable.ts`, `index.ts`, `errors.ts`), the CLI `app/scripts/ingest.ts`, the
native publish hook `app/src/hooks/generatable.ts`, the shared phase vocab
`app/src/fields/phases.ts`, and the DB-less gate `app/scripts/ingest-extract-check.ts`.
Decisions (confirmed with the user at design time):

- **Ingest is DEV-ONLY, a CLI, never teacher-facing.** Run by the app developer or the
  lesson-plan author (`payload run scripts/ingest.ts`). No HTTP/upload surface, no upload
  RBAC — the SPEC §9 endpoint stays deferred. It is a trusted Local-API system call
  (`!req.user` → `enforceBundleStructure` treats it as the system path).
- **Safe extraction = static `acorn` parse, evaluate literals only, NEVER execute.** The
  untrusted-input contract (SPEC §0/§7): parse to an AST and statically evaluate ONLY pure
  data literals (string/number/bool/null/array/object, plus unary ± on numbers and
  zero-expression template literals). REJECT everything executable/dynamic — calls,
  identifier references inside data, member access, template-with-`${}`, spread, getters,
  `__proto__` keys. No `require`/`vm`/`eval`/`Function`. acorn@8.16.0 was already in the
  tree (via Next/Payload); promoted to an exact **direct** dependency. (`tsc`/`typescript`
  could parse too but acorn is the lighter, purpose-built ESTree tool.)
- **`acorn`-as-direct-dep lockfile sync.** acorn was already resolved at 8.16.0 in
  `package-lock.json` (transitive); adding it to root `dependencies` needed only
  `npm install --package-lock-only` (one-line lock diff, zero version churn) so the Rock's
  strict `npm ci` stays in sync. **No migration / no schema change this phase** (only hooks
  + validation + a dep — `generate:types` left `payload-types.ts` byte-identical).
- **SubjectGrade: EXACT `(Subject.name, grade)` match, require pre-existing, fail loud.**
  The `.js` META carries only `subject` (free text) + `grade` (int), not a SubjectGrade id.
  Resolve by exact name match (trimmed) — **no fuzzy matching** (a silent mis-assignment
  corrupts RBAC scope, worse than a clear failure). Missing taxonomy aborts with an
  actionable message listing existing subjects. **No `--seed`/auto-create** — keeps the
  curated junction-entity invariant (2026-06-09 SubjectGrade decision) pure; seed taxonomy
  first. A read-only **pre-flight** resolves/validates all files and reports every problem
  before any write; the actual writes run in **one all-or-nothing transaction**.
- **Ingested 1.0.0 is a DRAFT; an administrator reviews & publishes.** Lesson plans land as
  `_status: 'draft'` (not official, not exportable) until an admin publishes (SPEC §6).
  Teachers never upload and never publish — they view/export published bundles only.
- **Generator-completeness gate, built the Payload-first way (the export-correctness check
  Codex flagged).** Schema-required fields + publish status are NOT enough: the generator
  unguarded-dereferences `lesson.slo.purpose`, `lesson.summaryTablePrompt.observed`,
  `lesson.framework.map(…)` and reads `META.*` (verified in `vendor/lib/sections.js` /
  `build_docs.js`); FE/ST are fully guarded there, so they're not gated. `validateGeneratable`
  (a pure function, single source of truth) requires META + per-lesson `slo`/
  `summaryTablePrompt`/≥1-phase + every phase ∈ vocab. Wired three ways: (1) the ingest
  script rejects incomplete data pre-write (even as a draft); (2) a native `beforeValidate`
  hook `enforceGeneratable` throws a Payload `ValidationError` **when the write would be
  PUBLISHED** — so it surfaces in the admin UI and via the Local API, not just the export
  path; drafts may be incomplete WIP; (3) native `minRows: 1` on `lessons` + `framework`
  for inline admin feedback (skipped on drafts, which is fine — the hook is the authority).
  Export then trusts validated-in data. The adapter's array-coercion stays the type-safety
  backstop (it can't *crash*); completeness is content-correctness, enforced here.
- **GATE `app/scripts/ingest-extract-check.ts` (DB-less, 13/13).** (1) PARITY — static
  extraction of `bio_1_4_data.js` deep-equals `require()`ing it (execution used ONLY as the
  test oracle, never in the product path). (2) SAFETY — a non-execution canary (a benign
  top-level statement never runs) + eight adversarial modules (require-in-data, member
  access, template-with-expr, identifier ref, IIFE, binary op, `__proto__` key, undefined
  export) all rejected. (3) completeness assertions. By transitivity with the Phase-2
  adapter gate (which runs `require(bio_1_4)` → adapter → DOCX, 5/5), extract → DOCX is
  proven faithful. All gates green: extract 13/13, fidelity 3/3, adapter 5/5, `tsc` 0,
  `lint` 0 errors.
- **`security-review` DONE (Phase 3 task 4) — no qualifying findings.** Reviewed the
  extraction + orchestration: no `require`/`vm`/`eval`/`Function` on the product path; the
  literal evaluator's `default`-throw rejects every executable/dynamic node; query inputs
  (`META.subject`/`grade`) are type-guarded and flow only through Payload's parameterized
  ORM; CLI paths are trusted; a malicious `.js` can't self-publish (explicit `draft: true`
  + `rawToBundle` shape). DoS/resource-exhaustion is out of scope by policy.
- **Still TODO:** the true DB round-trip — ingest → stored 1.0.0 draft → publish →
  `generateForBundle` → diff vs approved — is Phase 4 (needs a DB; run on the Rock).

## 2026-06-09 — Transport format from ARES: JSON preferred (not `.js`+JSON, not DOCX)

ARES asked which format Lesson3 needs to **store, edit, and generate** lesson plans: the JSON,
the `.js`, or both. **Answer: the data once — JSON preferred. Not both; not the rendered DOCX.**

**Why one format suffices.** Transport (how ARES hands us a lesson) is separate from storage. At
ingest, Lesson3 extracts the data and keeps it as **structured JSON in Postgres** (native Payload
fields, versioned). Store/edit/generate all run off that stored JSON; the DOCX/PDF are
regenerated build artifacts. So the original file is only an ingest *seed* — needed once, in one
form. This is exactly SPEC §3 ("canonical storage format is JSON; ingest extracts the `.js`").

**Why JSON over `.js` (recommend ARES emit JSON going forward).**
- **Safety:** a `.js` module is executable code, so ingest uses a deliberate parse-but-never-run
  extractor (acorn AST, literals only — the RCE-avoidance machinery). **Pure JSON is inert** →
  `JSON.parse`, no risk surface, no AST walk.
- **No JS-only quirks:** JSON sidesteps the things we had to special-case in the `.js`
  (cross-line string concatenation `'a\n' + 'b\n'`, single-quoted/unquoted keys in the Math
  files, `//` comments). JSON is lossless for this data — the modules are pure literals.

**Not needed:** both formats (identical data, redundant); the generated DOCX/PDF (we reproduce
them byte-faithfully — proven for bio_1_4). **Shape unchanged:** `{ META, UNIT, LESSONS[],
FINAL_EXPLANATION, SUMMARY_TABLE }`, ideally with the resolved `resources` included (see the
resource-sourcing entry below).

**Our-side follow-up (small, when ARES switches):** add a **direct `.json` ingest path** beside
the `.js` extractor — `JSON.parse` → the SAME `rawToBundle` + `validateGeneratable` + Local-API
create. Keep the `.js` extractor for backward compatibility / mixed inputs. No schema change;
just an input-format branch in `app/src/ingest/`.

## 2026-06-09 — Resource column: source resolved resources FROM ARES (un-defer the rendering)

Reviewing the Phase-4 output, the user flagged the blank Resource column as a major fidelity
issue — a blank column makes the document look incomplete, even though the *links* are useless
to the offline-majority audience (the original deferral rationale, 2026-06-08). Extracted the
approved column to confirm what it holds: **per-lesson recommended resources** — a video and a
reading, each `title + source` + "Search ARES" links (e.g. *Gene Expression Essentials* / PhET;
*…DNA Codons* / MIT Blossoms). Verified this text is **NOT in our pipeline**: bio_1_4's framework
rows carry no resource field, and the vendored generator pulls the column from the `aresResources`
*module* (our blank shim), not from the lesson data. (Also: the recommender's matches are uneven —
a DNA video landed on the diet-themed Lesson 1.)

**Decision (user-chosen): source the resolved resource data FROM ARES**, carry it through ingest
via the existing `framework[].resources` seam, and render it via an updated shim — no live Python,
no DOCX back-extraction, generalises to every bundle. This refines (not reverses) the deferral:
we still don't run the recommender; we ingest its *output as data*. The two lighter options were
declined: (b) one-off extraction from approved DOCX (doesn't generalise, inherits mismatches),
(c) keyword-only "Search ARES" guidance (non-blank but not the real titles).

**Data contract requested from ARES (per lesson — resources render identically across a lesson's
phases):**
```
resources: {
  video:   { title, source, direct_url?, search_url },
  reading: { title, source, direct_url?, search_url }
}
```
Delivery: ideally embedded in the `.js` data files (a lesson-level `resources`, or on each
`framework[]` row), else a side JSON keyed by (substrand_id, lesson number). `direct_url` may be
dead/omitted (offline) — `title`/`source` are what make the column non-blank.

**Our-side work (scoped, PENDING the data shape — do NOT build speculatively):**
1. **Schema gap:** the current `resourceLink` is `{ title, direct_url, search_url }` — **add
   `source`** (a migration). Hold until ARES confirms the shape/granularity (per-lesson vs
   per-phase).
2. **Render:** rewire the Lesson3 shim `vendor/aresResources.js` (`buildResourceParagraphs` /
   `getAllPhaseResources`) to render the stored resources (the 📹 VIDEO / 📖 PDF / Source / Search
   layout) instead of a blank paragraph — still pure Node, no Python.
3. **Ingest:** already carries `framework[].resources` through (adapter tolerates populated or
   empty); confirm the inbound shape maps cleanly.
4. **Fidelity gate:** once resources render, the diff can *stop* excluding the Resource column for
   bundles that have resource data (or keep excluding where `direct_url`s differ run-to-run).

Open question to settle with ARES: **per-lesson or per-phase** resources? Rendered output is
per-lesson; model accordingly once confirmed.

## 2026-06-09 — Phase 4 DONE: bio_1_4 DB round-trip proven on the Rock (3/3)

Closed the full pipeline against the real Postgres DB on the Rock: seeded taxonomy (Biology
G10, Mathematics G10) → ingested `bio_1_4_data.js` via the CLI → stored 1.0.0 draft (id 33) →
published → generated the three DOCX → diffed vs the stakeholder-approved set. **3/3
content-identical** (LessonSequence 381 blocks, FinalExplanation 52, SummaryTable 37; Resource
column excluded). The architecture is validated end-to-end: edit-the-data → regenerate
byte-faithful documents, through ingest + Postgres + versioning + the generator.

Two bugs surfaced + fixed, one wrinkle flagged:
- **[FIXED, `f696214`] `payload run` tears the process down before async work finishes.** The
  script scaffolds ended with a detached `run().then(() => process.exit(0))`. `payload run` only
  `await`s the module's EVALUATION, then calls `process.exit(0)` unconditionally
  (`payload/dist/bin/index.js:53,76`) — so the first two ingest attempts exited 0, created 0
  rows, and printed nothing (silent no-op; both the "no output" AND "no data"). Fixed with
  top-level `await run()` (like `verify-rbac.ts`, which always worked) + an explicit trailing
  `process.exit(0)` (so it also exits under `tsx`, where getPayload keeps the DB pool open).
  Applied to `ingest.ts`, `generate-bundle.ts`, `publish-bundle.ts`. **Rule: any `payload run`
  script MUST top-level-await its work — never fire-and-forget.**
- **[ADDED, `afd6f80`] `scripts/publish-bundle.ts`** — Local-API publish (`payload.update`
  `_status: 'published'`, overrideAccess). The admin "Publish Changes" button is disabled on a
  pristine/unchanged draft (expected Payload behavior — the form must be dirty), so a scripted
  publish is the clean path for round-trips.
- **[NOT A BUG — corrected] The 1.0.0 → 1.0.2 semver was TWO publishes, not a double-bump.**
  Initially mis-diagnosed as a single publish double-bumping; the user clarified they ALSO
  published via the admin UI (after a trivial edit to un-grey the disabled "Publish Changes"
  button) in addition to the scripted `publish-bundle.ts`. So: ingest 1.0.0 → publish 1.0.1 →
  publish 1.0.2 — **one bump per publish**, which is exactly what `enforceBundleStructure` does
  (every `update` bumps). No fidelity impact (generator ignores semver). **Lesson:** don't infer
  a bug from a version number without accounting for every write that occurred.
  **Minor open question (not urgent):** the hook bumps even on a *no-op* publish (the scripted
  one changed no content yet bumped). If "mark official without editing shouldn't bump" is
  wanted, skip the bump when only `_status` changes — small refinement, the user did not consider
  the current behavior a problem.

Mechanics learned (Rock round-trip):
- **Scripts run via the deps image + bind-mount** (`-v /srv/lesson3/app:/app`), so a
  script-only change is `git pull` + re-run — **NO image rebuild**.
- **Generated DOCX must go to a bind-mounted host dir** (`-v /srv/lesson3/out:/out`, pass `/out`
  as the `generate-bundle.ts` outDir) or they vanish with the `--rm` container's `/tmp`.
- The Mac drives Rock steps over passwordless SSH; the **content diff** (mammoth→HTML→jsdom via
  `scripts/lib/docxDiff.ts`) runs on the Mac, comparing the pulled-back DOCX vs the approved set
  (`compareDoc(label, generated, approved, stripResources)` — strip=true only for the
  LessonSequence). Not yet wired as a one-command regression (see NEXT-SESSION).

## 2026-06-09 — Removed the unused `subjects.slug` scaffold field

`Subject.slug` ("URL-safe identifier, e.g. biology") was `create-payload-app`-style residue —
referenced **nowhere** in logic: ingest matches Subject by `name` (exact), RBAC / SubjectGrade
link by `id`, and there are no subject routes/URLs in scope (SPEC §8 = discipline only). It also
cluttered the Subject create form with an extra (optional, blank-able) field. Same call as the
2026-06-09 Media-collection removal. Removed the field + its `defaultColumns` entry; fixed the
one consumer (`verify-rbac.ts` test fixture). **Migration hand-authored** (no local Postgres to
run `migrate:create`): `20260609_170000_drop_subject_slug` — `DROP INDEX IF EXISTS
subjects_slug_idx` + `DROP COLUMN IF EXISTS slug` (`up` idempotent per the migration-gen
lesson), `down` restores column + unique index. The `.json` snapshot was derived from the prior
one by deleting `public.subjects.columns.slug` + `indexes.subjects_slug_idx` (only the `.ts`
runs at apply time; the snapshot keeps future `migrate:create` diffs clean), registered in
`migrations/index.ts` (sorts last). `generate:types` dropped `Subject.slug`. Gates: tsc 0, lint
0, ingest 18/18, fidelity 3/3, adapter 5/5. **Pending Rock deploy** — rides the next
`docker compose up -d --build` (safe; slug data is disposable/unused).

## 2026-06-09 — Corpus dry-run: `+` concat folding + FE/ST readiness map

Ran the real extractor + gates over all **13** corpus data files (`generators/data/*_data.js`
at SHA `529be40`, materialized read-only via `git show`) before Phase 4, to confirm
ingestability and which SubjectGrades to seed. Two findings:

- **Seed exactly TWO SubjectGrades: `Biology — Grade 10` and `Mathematics — Grade 10`.** All 13
  files are grade 10; subjects are `"Biology"` (10 sub-strands) and `"Mathematics"` (3). Seed
  those exact subject names (ingest matches on `Subject.name` verbatim). NB Math META differs
  in *syntax* (unquoted identifier keys + single-quoted strings, vs Biology's JSON-style
  double quotes) and *labels* (`col3Label`/`col5Label` = "Teacher Actions"/"Assessment
  Strategy") — the acorn extractor handles both syntaxes; `JSON.parse` would NOT (proves acorn
  was the right tool, not a regex/JSON shortcut).
- **`+` string-concat folding added (user-approved, `+` only).** 6/13 files (bio_1_1, bio_1_3,
  bio_2_1, all 3 Math) initially failed extraction with `Unsupported expression
  (BinaryExpression)` — ARES authors build long prose as `'a\n' + 'b\n' + …`. Extended
  `literalToJson` to **constant-fold `+`** (and only `+`) on operands that each evaluate to a
  string/number literal. **Security boundary unchanged:** both operands recurse through
  `literalToJson`, so a non-literal operand (`'a' + ident`, `'a' + call()`) still throws; a
  non-`+` operator (`6 * 7`) still throws. Gate updated: the old `reject: 1 + 2` case became
  `reject: '+' with a non-literal operand` + `reject: non-'+' operator` + a positive fold
  assertion. Now **18/18**, and **13/13 files extract + pass the hard gate**.
- **FE/ST readiness (validates the warn-only decision).** 6/13 files have
  `const FINAL_EXPLANATION = null; // fill in or extract manually` (and the same for
  SUMMARY_TABLE) — bio_1_1, bio_1_3, bio_2_1, math_2_2/2_3/2_4. They are **upstream content
  gaps** (ARES hasn't authored FE/ST for those sub-strands yet), not a code/shape issue — the
  extractor handles `null` and the bundle just warns. So the corpus does NOT uniformly carry
  all three documents; **do not promote FE/ST to a hard gate** (it would reject ~46% of the
  corpus). The 7 complete bundles (bio_1_2, 1_4, 2_2, 2_3, 3_1, 3_2, 3_3) produce all three;
  the 6 produce only the LessonSequence until ARES fills in FE/ST. bio_1_4 (the Phase-4 oracle)
  is complete → ready for the full round-trip.

## 2026-06-09 — Phase 3 external review (Codex + CodeRabbit) triage + fixes

Codex/CodeRabbit reviewed the ingest work. Verified each finding directly; all green after.

- **[PRODUCT DECISION — FE/ST deliverable contract] WARN-ONLY for now.** SPEC §3 says every
  bundle "generates three documents," but the Phase-2 adapter omits empty FINAL_EXPLANATION /
  SUMMARY_TABLE (generator then produces only the LessonSequence), and `validateGeneratable`
  deliberately gates only crash-safety, not deliverable completeness. **User's call:** add the
  FE/ST checks but as a **non-blocking warning at ingest** (logged, not a hard publish block),
  until the full corpus is confirmed to always carry all three — then promote to a hard gate.
  Implemented as `deliverableWarnings()` (FE has ≥1 section, ST has ≥1 lesson row), surfaced
  per-file by the CLI; `validateGeneratable` (the hard gate) is unchanged. SPEC §3 stays the
  target (canonical); this interim stance lives here.
- **[FIXED — `__proto__` at the export layer] Consistency.** `literalToJson` rejected
  `__proto__` data keys, but the `module.exports = { … }` resolution loop did not — no global
  prototype-pollution exploit (it would only re-point the local `result` object's prototype),
  but it broke the stated "reject `__proto__`" contract. Added the same guard there + a gate
  test (`reject: __proto__ key in module.exports`).
- **[FIXED — CI portability] Hard-coded `~/Desktop/ares-docx-fidelity-demo`.** All three
  DB-less gates (`fidelity-spike`, `adapter-fidelity`, `ingest-extract-check`) hard-coded the
  demo path. Added an `ARES_DEMO_PATH` env override (defaults to the existing path, so local
  behaviour is unchanged) across all three, so the suite runs on CI / the Rock / another
  machine without editing.
- **[FIXED — type hygiene] Dropped the needless `as string` cast in `enforceGeneratable`** —
  `?? 'draft'` already yields the `'draft' | 'published'` union (CodeRabbit).
- **[NO ACTION] `npm run test:int` fails locally** — local Postgres isn't running; not this
  code path. The DB round-trip is Phase 4 on the Rock.

## 2026-06-09 — DEPLOYED to the Rock: SG compound index + media drop (migration-gen quirk)

Generated + applied the migration `20260609_164927_subjectgrade_unique_drop_media` on the Rock
(`docker compose up -d --build`; migrate exit 0 in 43ms; app healthy on :3001). Verified live:
`subject_grades` now has `"subject_grade_idx" UNIQUE btree (subject_id, grade)`, and the `media`
table is gone. The Rock now runs `0096f7a` (both branches + origin even at `0096f7a`).

**Hard-won lesson — Payload's migration generator collides `DROP TABLE … CASCADE` with an explicit
`DROP CONSTRAINT`.** The first `up` failed: `constraint "payload_locked_documents_rels_media_fk"
does not exist`. Cause: dropping a collection (`media`) that is referenced by Payload's internal
`payload_locked_documents_rels` FK generates, in order, `DROP TABLE "media" CASCADE` (which already
drops that FK) **and then** an explicit `ALTER TABLE payload_locked_documents_rels DROP CONSTRAINT
payload_locked_documents_rels_media_fk` — which now errors because CASCADE already removed it.
Migrations are transactional, so it rolled back cleanly (no partial state).

**Fix (rule for the next collection removal):** make the generated `up` idempotent by hand before
applying — `DROP TABLE IF EXISTS … CASCADE`, `DROP CONSTRAINT IF EXISTS`, `DROP INDEX IF EXISTS`,
`DROP COLUMN IF EXISTS`, `CREATE … IF NOT EXISTS`. (Equivalently: delete the redundant explicit
`DROP CONSTRAINT` line, since CASCADE handles it.) `IF EXISTS` throughout also makes the migration
safely re-runnable regardless of any partial state. The migration was patched, re-applied, and the
idempotent version committed (`0096f7a`). **Process note:** the migration is authored *on the Rock*
(needs DB access to diff schema), so it flows Rock→git→Mac (pull to sync) — the reverse of normal.

## 2026-06-09 — Preview strategy locked: derive from the generator (DOCX→HTML), never parallel HTML

Discussed how the "Preview as Word/PDF" trust-builder (SPEC §5) should render lesson plans, and
whether a JSON→HTML preview would be "close enough." Locked the approach (also tightened SPEC §5).

- **Principle (non-negotiable): preview is always DERIVED from generator output, never a parallel
  HTML renderer.** A hand-built HTML template re-implementing the layout would be a *second source
  of layout truth* that can drift from the real DOCX and **mislead the teacher** — fatal for a
  trust-builder aimed at a Word-centric stakeholder, and a return of the "HTML is lossy" problem we
  rejected for storage. One layout source: the generator.
- **What Payload provides (verified in installed source):** the *plumbing* only — `admin.livePreview`
  (`LivePreviewConfig`: iframe + breakpoints + form-state `postMessage`) and `admin.preview`
  (`GeneratePreviewURL`: a preview-button URL). Payload does NOT render your data as HTML; you supply
  the view/URL. So "does Payload manage HTML natively" = harness yes, document rendering no.
- **Two fidelity tiers:**
  1. **Fast in-browser content preview** = real DOCX (generated in-process from the working copy) →
     HTML via **`mammoth`**. We already do this in the fidelity harness, so it's nearly free. It is
     the *actual document's* content + table structure; mammoth intentionally drops styling
     (colours/widths/fonts). Adequate *because* teachers edit prose and the generator owns visuals,
     which don't change with prose edits; our grammar (`\n`=para, `- `=bullet) round-trips cleanly.
     (Implication: `mammoth` moves devDep → dependency when this ships.)
  2. **Exact visual check** = the real DOCX download and/or DOCX→PDF. PDF needs a converter
     (headless LibreOffice or similar) — heavier; fold into §9 PDF export. HTML is never the
     "exact look" answer; the DOCX/PDF is.
- **Trigger:** a preview button / custom edit-view component (the §5 component note), NOT continuous
  live-preview — regenerating a DOCX per keystroke is wasteful; the value is "check before publish."
  A debounced "Refresh preview" on the draft is the sweet spot.
- **Gates differ:** preview runs on the **working draft** (that's its purpose, so it bypasses the
  published-only export gate); **export** stays published-only via `generateForBundle`. Preview ≠
  export.
- **Status:** design decision only; built with the §5 editor / §9 export work, not now.

## 2026-06-09 — Removed the unused scaffold `Media` collection

Audited `Media` (Payload-first tidy-up): it was pure `create-payload-app` scaffold residue — an
`upload` collection with only an `alt` field, **zero domain references** (the only mentions were
the config registration, auto-generated `payload-types.ts`, the initial migration's `CREATE TABLE
"media"`, and Payload's internal `payload_locked_documents_rels.media_id`). The editor grammar is
plain strings (SPEC §4) and the generator owns all visuals, so there is no upload need; an empty
"Media" collection in the admin sidebar was misleading dead weight.

Removed: `src/collections/Media.ts`, its `payload.config.ts` import/registration, and the
media-only `images.localPatterns` block in `next.config.ts`. `generate:types` regenerated (Media
gone from `payload-types.ts`); `tsc` 0 errors, `lint` 0 errors, fidelity gates 3/3 + 5/5.
**Pending Rock migration:** a `DROP TABLE media` (+ the locked-docs FK) rides the next deploy —
safe, the table is empty. If image/attachment support is ever needed, re-adding an upload
collection is trivial.

## 2026-06-09 — SubjectGrade modeling locked (junction entity) + native compound-unique index

Deliberate review of "two fields (subject, grade) vs one SubjectGrade entity" (SPEC §8),
confirmed with two requirements the user nailed down:

- **(1) Teachers are ALWAYS assigned at `(subject, grade)` granularity → SubjectGrade stays a
  first-class junction entity.** The decisive test is the *permission grant*: a grant is a tuple
  ("Grade 10 Math"), and a teacher holds several independent tuples. Two *independent* fields
  (`subjects[]`, `grades[]`) can only express their **cross-product**, which over-grants (e.g.
  Math-10 + Biology-12 would also grant Biology-10, Math-12). So the pair must be atomic — an
  entity. This also gives clean Payload access queries (`subjectGrade: { in: [...] }`, mirrored in
  `readVersions`), referential integrity (a curated list of valid combos, no garbage/typos), and
  matches the domain mental model (Subject + Grade = building blocks; SubjectGrade = their curated
  junction). **Caveat recorded:** the entity's justification rests entirely on per-pair
  assignments; if that ever softened to subject-only or grade-only grants, two fields would be
  simpler and this should be revisited.
- **(2) Cross-axis reporting ("all Biology across grades", "all Grade 10") is OCCASIONAL → do NOT
  denormalize.** Mirror `subject`/`grade` columns on bundles would buy direct querying at the cost
  of permanent sync upkeep + more secure-by-default whitelist surface — not worth it for occasional
  use. Pattern instead: the **two-step** (resolve SubjectGrade ids for the subject/grade, then
  `bundles where subjectGrade in (...)`), which always works regardless of adapter query support. A
  one-shot relationship dot-path (`where: { 'subjectGrade.subject': … }`) may also work — verify
  against the DB before relying on it; the two-step is the safe default.
- **`grade` stays a constrained integer**, not its own `Grade` collection (YAGNI). Promote to a
  relationship via migration only if grades gain attributes (alternate names like "Form 4",
  ordering/banding, per-grade metadata).

**Action taken — adopt the native compound-unique index** (supersedes the 2026-06-08 audit note
"DB-level composite unique index still deferred; app-level check acceptable"). Added
`indexes: [{ unique: true, fields: ['subject', 'grade'] }]` to `SubjectGrade` (verified in
installed source `collections/config/types` — Payload natively supports compound unique indexes;
this is the Payload-first replacement for relying on the hook alone). Kept the `beforeValidate`
duplicate check for a friendly error message (a raw unique-violation is opaque) → defense in depth.
`generate:types` parses clean, `tsc` 0 errors, `payload-types.ts` unchanged (no new fields).
**Still needs a migration generated + applied on the Rock** (the index is DDL); existing data is
safe because the app-level check has prevented duplicates all along.

## 2026-06-09 — "Payload-first" working rule (+ leverage audit)

**Rule (adopted; also added to SPEC §13).** Before adding any new custom endpoint, editor,
permission layer, workflow, or persistence code, first check whether Payload already provides it
— via collection config, access control, field/collection hooks, versions/drafts, admin config,
the Jobs Queue, or the Local API. Build custom only when Payload genuinely cannot; when you do,
**document the specific gap** in a code comment and/or here. Keep leaning on Payload's tested
machinery instead of re-implementing it.

**Audit to date (grounded in the code, not memory) — strongly compliant.** Where we leverage
Payload:
- **Data model:** sub-strand bundle as native nested groups/arrays (`LessonBundles.ts`), NOT a
  JSON blob — the choice that unlocks per-field validation, field access, and versioning.
- **Auth:** built-in Payload auth on `Users` (JWT, `forgotPassword`, `tokenExpiration`); no custom auth.
- **RBAC:** collection + field access functions; reads return `Where` queries
  (`lessonBundleRead`) with a mirrored `readVersions` so history can't leak drafts — the idiomatic
  query-filter approach, not post-fetch filtering.
- **Versioning:** Payload `versions` + `drafts` as the history/official-version engine; restore is
  Payload's. Custom layer = only `semver`/`bumpType`/`lockVersion` (Payload has no semver).
- **Structural integrity:** `enforceBundleStructure` is a `beforeChange` hook used *because* field
  access cannot gate array cardinality/order (a documented Payload limitation) — right primitive,
  not reinvention. Same for the other hooks (`autoDemotePriorSubjectAdmins`, `guardPasswordChange`,
  `grantSiteAdminToFirstUser`, subject-rename refresh), all threading `req`.
- **Editor UI:** Phase 1 uses Payload admin edit screens; no custom React editor (SPEC §5 "only if
  needed"). **Email/migrations/persistence:** `@payloadcms/email-nodemailer`, `payload migrate` +
  `db-postgres`, Local API in scripts. **Generation:** script + reusable core via Local API; custom
  endpoint deliberately deferred to §9.

**Opportunities to be MORE native (flagged, all future — honor when these phases land):**
- **Async export (§9):** use Payload's built-in **Jobs Queue**, not a hand-rolled queue.
- **`validateGeneratable` (Phase 3):** implement as Payload field `validate` + a
  `beforeValidate`/`beforeChange` hook so it runs on save/publish/ingest and surfaces in the admin
  UI — not a standalone function only the export path calls.
- **`generateForBundle` `overrideAccess`:** trusted system path now; the §9 endpoint must switch to
  `req`-based access (Payload custom endpoint reusing access + Local API).
- **"Preview as Word/PDF" (SPEC §5):** when built, make it a Payload **admin custom component** (an
  edit-view button via `admin.components`) that calls the generate endpoint — NOT a separate React
  app. Verified caveat: Payload's native `admin.preview`/Live Preview targets HTML *frontend* URLs,
  so it does NOT fit DOCX rendering; only the *button* lives in Payload's component slots.
- **Optimistic concurrency:** currently Payload document-locking + a `lockVersion` counter; true
  reject-if-stale OCC, if needed, is a custom-endpoint concern (documented earlier).

**Verdict:** the only custom code maps to justified, already-documented gaps. The rule formalises
existing practice; its main forward use is steering Phase 3/§9 (validation + async export) toward
Payload's native validate-hooks and Jobs Queue.

## 2026-06-08 — Phase 2 external review (Codex/CodeRabbit) triage + fixes

Codex reviewed the just-committed Phase 2. Five findings, all valid; verified each directly
(don't trust the summary) and fixed. Gates re-run green afterward.

- **[FIXED — broken gates, mine to own] Repo lint + `tsc` were red, since Phase 0/1.**
  Verified: `npm run lint` → **10 errors, all the vendored pristine CJS** (`require()`
  forbidden) — eslint was never told to ignore `src/generator/vendor/`. `tsc --noEmit` → the
  vendored `.js` aren't checked (tsconfig `include` is `**/*.ts`), but `jsdom` was untyped in
  `scripts/`, so **`next build` would have failed too** (uncaught only because Phase 0/1 was
  never built on the Rock). **Calling it "pre-existing" was the wrong call** — a committed gate
  that doesn't pass is a broken gate. Fixes: eslint `ignores: ['src/generator/vendor/**']`
  (pristine code we must never edit + our sibling shim); added `@types/jsdom@28.0.3` (exact,
  matches `jsdom@28.0.0`). Now `lint` 0 errors / `tsc` 0 errors. **Rule:** run the *repo-wide*
  `npm run lint` / `tsc`, not just `eslint <my-files>` — a gate is the whole tree or it's nothing.
- **[FIXED — latent crash] Published ≠ generator-valid; adapter turned null arrays into `''`.**
  The publish gate only enforces *schema-required* fields (`title`, `subjectGrade`,
  `framework[].phase`); the generator unconditionally `.map()`s LESSONS / `lesson.framework` /
  FE.sections / FE.rubric / ST.lessons. Payload normally returns `[]` for empty arrays, but I
  proved `clean(null) → ''` — a null array would have crashed `.map`. (Codex's group examples —
  `slo.purpose` etc. — don't actually crash: Payload groups always materialise and the adapter
  nulls→''.) Fix: `bundleToAresData` now force-coerces those five iterated slots to arrays.
  **Content-completeness validation stays an ingest/publish concern (SPEC §5 "reject anything
  that would produce a broken document"), built in Phase 3** — export trusts validated-in data
  + publish status; the adapter just guarantees it can't *crash*.
- **[FIXED — product call: BLANK column] Resource cells showed "(ARES resources unavailable)".**
  `sections.js`'s try/catch fallback printed that placeholder into real DOCX (the fidelity
  harness strips the column, so gates didn't catch it). Decided (user): render the column
  **blank**, not the placeholder and not removed (removing it would diverge from the approved
  baseline, which keeps the column). Added a **Lesson3-authored** pure-Node shim
  `vendor/aresResources.js` (`getAllPhaseResources → {}`, `buildResourceParagraphs → [para('')]`)
  at the fixed `require('../aresResources')` path. No Python, deterministic. The re-sync script
  copies only the three lib files, so the shim survives a re-pin. Verified: generated
  LessonSequence contains no placeholder; gates still 3/3 and 5/5.
- **[FIXED — doc, future-endpoint] `generateForBundle` uses `overrideAccess: true`.** Correct
  for the trusted CLI/system path, dangerous if a future §9 endpoint reuses it without a read
  check. Hardened the docstring to a firm contract: the endpoint must enforce the caller's READ
  access (or pass `req`) before calling; do not expose this directly as a handler. Restructure
  when the endpoint lands.
- **[FIXED — hygiene] `meta.filePrefix` flowed into a path join unsanitised.** Operator script
  writing to a temp dir, but `filePrefix` is ingested data → trivial path-traversal hygiene.
  Now sanitised to a bare filename component (`[^A-Za-z0-9._-] → _`).
- CodeRabbit's null-check (Payload `findByID` throws by default) and duplicate-fetch notes:
  noise/minor; the script's second `findByID` is a deliberate convenience for the filename. No change.

## 2026-06-08 — Phase 2: generator integration (adapter + validity-gated core)

Built the stored-bundle → ARES generator path on `feat/generator-ingest`. Decisions:

- **Adapter is a thin rename + clean, not a field-by-field mapping.** The ARES *inner*
  keys already match the Payload field names verbatim (verified against `bio_1_4_data.js`),
  so `bundleToAresData` (`app/src/generator/adapter.ts`) only (1) renames the five top-level
  groups (`meta→META` …), (2) deep-strips Payload's row `id`, (3) converts **`null` → `''`**,
  and (4) drops **empty** `framework[].resources` / `FINAL_EXPLANATION` / `SUMMARY_TABLE`.
  **Why null→'':** Payload returns `null` for empty optional strings, but the generator's
  `cell()` wraps a non-string/non-array child as `[content]` → a raw `null` produces invalid
  docx; ARES data files never contain `null`, so the adapter restores that invariant. A
  *populated* `resources` is carried through untouched (the deferred-resources future seam).
  Verified the generator **never reads `framework[].resources`** anyway (`sections.js` pulls
  the Resource column from the absent Python `aresResources` module via its no-op fallback),
  so this is fidelity-neutral.
- **Validity gate lives in the shared core, not the caller (secure by default).**
  `generateForBundle(payload, id)` (`app/src/generator/generateForBundle.ts`) loads the
  bundle (`overrideAccess`, no `draft:true` → the published snapshot), calls `assertExportable`
  (refuses anything whose `_status !== 'published'` with a `NotExportableError`), then runs the
  adapter + `generateBundleDocx`. The gate is enforced by **every** path by construction; the
  CLI uses it now and the future §9 export endpoint just adds READ access on top — it does not
  re-implement the gate. Publishing already enforces required fields, so a published bundle is
  schema-valid. Matches the deferred Codex finding (drafts must never export).
- **Generation exposed as a script for now** (`app/scripts/generate-bundle.ts`, run via
  `payload run`), not an endpoint — full export/sharing UI is SPEC §9, later.
- **Phase-2 GATE is DB-less** (`app/scripts/adapter-fidelity.ts`, 5/5): it *simulates* a stored
  Payload bundle from `bio_1_4_data.js` (camelCase groups + injected row `id`s + sidebar fields
  + `null` UNIT.overview + empty `resources` groups), runs the real adapter + generator, and
  diffs vs the approved DOCX — proving bundle→DOCX by transitivity with the Phase-1 gate. The
  true end-to-end **DB** round-trip + Rock verification stays Phase 4 (per NEXT-SESSION). Shared
  mammoth/jsdom diff helpers were extracted to `app/scripts/lib/docxDiff.ts` (both gates import
  them; Phase-1 gate still 3/3). *Tooling note:* `scripts/*` trip a pre-existing
  `@types/jsdom`-missing `tsc` warning (present since Phase 1); left as-is to avoid an
  out-of-scope dependency add.

## 2026-06-08 — Resources deferred (recommender out of scope); audience-driven priority note

**Decision (firm):** the ARES **Resource column is not populated** for the foreseeable future,
and the **Python recommender is not integrated at all** — not live *and not at ingest*. This
formalises the Phase-0 omission of `aresResources.js`. It is **within SPEC**, not a spec change:
§3/§4/§5/§7 already mark resources **optional and "undetermined… may be omitted entirely,"** and
the recommender path was always conditional ("if the column is enabled"). We are exercising the
already-specified "off" branch.

**What we keep (the future seam):** the optional `framework[].resources` field in
`LessonBundles.ts` stays. Removing it would be the one move that forecloses the future; keeping
it costs nothing (it already tolerates empty).

**Why (three distinct audiences, user-provided):**
- **A — schools with their own ARES server** (~10–60): links resolve to local content; genuinely useful.
- **B — schools using the online ARES demo** (hundreds): links useful if online.
- **C — little/intermittent internet** (thousands — the **largest** group): links are useless.

So links add value only for a minority, while the majority is best served by a self-contained
lesson-plan document (high-fidelity DOCX/PDF, no live links). This **aligns with** the existing
SPEC non-goal "not an offline content-distribution platform (Kolibri/RACHEL serve that need)."

**Future sourcing (no live recommender):** resources do **not** live in the ARES data files —
upstream they exist only in the *rendered* DOCX (computed at build time from `aresKeywords`). So
if links are wanted later, the path is to **extract them from the ARES-produced documents** and
attach to `framework[].resources` — or, if the ARES team later embeds resources in the data
files, ingest simply carries them through. Either way, the same optional field absorbs it.

**Fidelity impact:** none. We already diff "everything-except-resources." The approved DOCX still
contain the column, so we keep excluding it; only a *structural* removal of the column would force
new baselines, and we are not doing that (that's the generator/format owner's call, not a fork).

**Flagged for a later deliberate SPEC pass (NOT changed now):** SPEC line 25 calls offline a
**"secondary goal."** The audience sizing above suggests the *exported documents* standing alone
offline is actually the majority case (distinct from running the *app* on an offline box, which
remains secondary infra). Before editing SPEC, firm up the audience numbers and think through the
downstream nudge toward **print/PDF/offline fidelity over interactive links**. Captured here as an
open question rather than a reactive spec edit.

---

## 2026-06-08 — Generator embedding (Phase 0): vendor pristine, omit Python, mirror the SHA

Starting the bio_1_4 end-to-end fidelity proof (NEXT-SESSION.md). Phase 0 vendors the ARES
Node generator into Lesson3. Decisions (all confirmed with the user at plan time):

- **Vendor pristine, not submodule/npm-dep.** The source lives on an **unmerged `claude/*`
  bot branch** (`markknit/cbe-generation-system@212da91…`), which can be rebased/force-pushed/
  deleted on merge — so any approach that points *live* at that ref (submodule SHA, npm
  git-ref) is fragile, and submodules add friction to the Rock's bind-mount Docker flow.
  **Decision:** copy the three lib files **byte-verbatim** into `app/src/generator/vendor/lib/`
  and never edit them; all integration lives in `app/src/generator/` (ours). Provenance +
  exact SHA in `vendor/PROVENANCE.md` and `docs/EXTERNAL-DEPENDENCIES.md`; one-command re-sync
  via `scripts/vendor-generator.sh`. **Pinned at `529be40`** (branch tip). *Process note:* the
  SHA was first taken as `212da91` from a **stale local fork**; the real tip was four commits
  ahead (`529be40`). Re-pinned after verifying the four intervening commits touched only
  docs/content/output DOCX — the three vendored lib files are **byte-identical** at both
  commits and the fidelity gate still passes. **Lesson:** `git fetch` before resolving a pin;
  don't trust a local clone's `origin`. **Rule:** because a generator change *also* ripples into
  our schema/adapter/approved-DOCX, an upgrade is never a silent SHA bump — the **fidelity
  regression is the acceptance gate** for adopting any new version. Vendoring makes that change
  visible and tested; a submodule's transparent bump would hide it.
- **Buffers need ZERO generator modification.** `build_docs.js` exports the three builders
  (`buildSoW`/`buildFinalExplanation`/`buildSummaryTable`), each returning a `docx` `Document`.
  Our wrapper calls them + `Packer.toBuffer()`. The NEXT-SESSION assumption that we'd "refactor
  `run()` to return Buffers" was unnecessary — `run()` stays untouched (disk-write parity only).
  This is what makes pristine vendoring cheap: no local patches to carry across upstream changes.
- **`aresResources.js` intentionally NOT vendored (deviation from NEXT-SESSION, rule-driven).**
  It `execSync`s `python3` against a SQLite DB for the Section-C Resource column. Single-runtime
  / "never invoke the Python recommender live" (SPEC §0) forbids that. `sections.js` already
  `try`-requires `../aresResources` and falls back to no-ops when absent — so **omitting the
  file** exercises that documented fallback, guaranteeing zero Python and a deterministic
  (empty) Resource column. The fidelity diff excludes the Resource column anyway.
- **CJS-in-ESM boundary.** The vendored files are CommonJS; the app is `"type":"module"`.
  Added `vendor/package.json` = `{"type":"commonjs"}` so Node parses them correctly without
  editing them; Lesson3 imports the builders from ESM via `createRequire`. (Smoke-tested: a
  builder produces a valid PK-zip docx Buffer.)
- **Pinned `docx@9.6.1` exact** (the version the generator was authored against) + **`mammoth@1.12.0`**
  (devDep, for DOCX→text diffing) in `app/package.json`.
- **Mirror tag pushed:** `lesson3-vendor-212da91` on `james-beep-boop/cbe-generation-system`,
  insurance against the upstream bot branch disappearing.
- **Export gate (confirmed, ties to the deferred Codex finding below):** generation is
  restricted to **published/official** (validated) versions; drafts are never exported.

---

## 2026-06-08 — External review (Codex) on versioning: read boundary + secure-by-default

Codex reviewed the deployed versioning work. Four findings; two acted on now (deployed,
`verify-rbac.ts` **36/36**), two recorded for the relevant upcoming phase.

- **[FIXED — security] Teacher read boundary.** `lessonBundleRead` was `Boolean(user)`, so
  with drafts enabled any authenticated Teacher could pull unpublished work via `?draft=true`
  and enumerate history via the versions endpoint. Not exploitable yet (only the Site Admin
  exists) but live the moment Teacher accounts do. **Decision (locked):** Teachers read only
  **published/official** bundles; **Editors/Subject Admins** additionally read any-status
  bundles (incl. drafts) **within their subject-grades**; Site Admins all. Implemented as a
  query-returning `read` plus a mirrored **`readVersions`** (`version._status` /
  `version.subjectGrade` paths — verified working against the live DB) so the version-history
  endpoint can't leak drafts. `verify-rbac.ts` covers teacher-sees-published,
  teacher-blocked-from-draft (list + by-id + versions), editor-sees-own-SG-draft.
- **[FIXED — secure-by-default] Top-level whitelist gap.** The hook's claim that "a new
  admin/system field is protected automatically" held for *array subfields* (overlayRows
  rebuilds each row from the original) but **not for top-level fields** — the Editor branch
  only restored enumerated keys (`title`/`subjectGrade`/`meta`/`unit`/`_status`), so a future
  top-level field added without access/hook handling would pass through an Editor update.
  **Fix:** invert to a true allow-list — restore EVERY top-level key from the original except
  the content containers (`lessons`/`finalExplanation`/`summaryTable`), the hook-set version
  fields (`semver`/`bumpType`/`lockVersion`), and Payload's `updatedAt`. New top-level fields
  are now protected by default. **Rule:** "secure by default" means *restore-all-except-known*,
  never *restore-known*; the latter silently rots as the schema grows.
- **[DEFERRED — export phase, SPEC §6/§9] Draft validity vs bulletproof export.** Enabling
  drafts relaxed DB `NOT NULL` and `draft:true` skips required validation, so an invalid draft
  snapshot can exist. SPEC says "any version regenerates on demand" — so **generation/export
  must validate the exact snapshot first, and/or only official/validated versions are
  exportable.** Honor this when the generator integration lands; not a bug today.
- **[DEFERRED — low] CodeRabbit migration notes.** `numeric` for integer-ish columns is the
  db-postgres default for `number` fields (style, not a bug); the down-migration `SET NOT NULL`
  only fails if you roll back after creating null-bearing drafts. Both downgraded; no action.

## 2026-06-08 — Versioning DEPLOYED + hard-won Payload/Docker lessons

Bundle versioning is merged and **deployed on the Rock** (migration
`20260608_224715_bundle_versioning` applied; `verify-rbac.ts` **30/30** against the live DB).
Getting there surfaced several non-obvious traps — recorded so the next schema change and the
public-production host don't re-hit them:

- **Regenerate `payload-types.ts` BEFORE building, after any schema change.** `next build`
  type-checks the whole tree; the generated `LessonBundle` type won't know new fields
  (`semver`/`bumpType`/`lockVersion`/`_status`) until regenerated, so the build fails on
  `verify-rbac.ts` (and would fail on the hook/collection too). It can't be regenerated
  locally here (no `node_modules`), so it's done on the Rock via the **deps image with the
  source bind-mounted** (anon volume preserves the image's node_modules):
  `docker run --rm -v /srv/lesson3/app:/app -v /app/node_modules -w /app lesson3-deps npx payload generate:types`.
- **`migrate:create` needs a bind mount AND the compose network.** `docker compose run --rm
  migrate npx payload migrate:create` writes the migration file *inside* the ephemeral
  container (the builder stage `COPY . .`'d the source; there's no volume) — `--rm` then
  deletes it. Run it via the deps image with `-v /srv/lesson3/app:/app` (so the file lands on
  the host) **and** `--network lesson3_default --env-file .env` (migrate:create connects to
  Postgres to diff the schema). The exact workflow is in `docs/NEXT-SESSION.md`.
- **Publishing is `_status: 'published'` in *data*, not the `draft` op param.** Verified in
  installed source (`collections/operations/create.js`/`update*.js`): `draft: true` only forces
  draft status + skips required-field validation; the persisted `_status` otherwise comes from
  `data._status` (default `'draft'`). So **marking official = passing `_status: 'published'`**;
  `draft: false` alone does nothing. Publishing also **enforces required fields**, so a publish
  update must carry a valid doc (e.g. `framework[].phase`). The whitelist hook *preserves*
  `_status` for Editors, which both blocks an Editor from publishing a draft AND stops an
  Editor's edit from accidentally unpublishing an official bundle — both now covered by
  `verify-rbac.ts`.
- **`lockDocuments: true` is not a valid literal** (the option type is `false | { duration }`);
  document locking is **on by default** in Payload 3, so we leave it unset. An explicit `true`
  breaks the build type-check.
- **Test hygiene:** the versioning checks initially reused the suite's already-mutated bundle
  (semver long past its initial value) — they now create a **fresh** bundle. General rule:
  exact-value assertions need a fixture untouched by earlier steps.
- **`enforceBundleStructure` now treats `!req.user` as trusted** (system / `overrideAccess`),
  bypassing the Editor whitelist — so ingest/migrations can set all fields and publish.
  Unauthenticated updates are already denied at collection access, so this only frees genuine
  system calls. Matches the `guardPasswordChange` `!actor` convention.

## 2026-06-08 — Bundle versioning: implementation decisions (SPEC §6)

Implemented `versions: { drafts: true, maxPerDoc: 100 }` on `lesson-bundles` plus three
sidebar fields (`semver`, `bumpType`, `lockVersion`) and versioning logic in
`enforceBundleStructure`. Key decisions:

- **Payload drafts as the "official version" mechanism.** Payload's single published
  document per collection naturally enforces "≤1 official version per bundle" (SPEC §6).
  Publishing (`_status: 'published'`) = marking official. The whitelist hook preserves
  `_status` for Editors (`d._status = orig._status ?? 'draft'`), so only Subject Admins
  can publish.
- **bumpType is Editor-accessible.** SPEC §6 says "user may choose patch/minor/major" without
  restricting who. The `bumpType` field passes through the whitelist for all users; Editors
  can signal a minor/major bump when their change warrants it. The hook consumes and resets
  it to `'patch'` after every save.
- **Versioning logic runs before the admin early-return.** The semver bump and lockVersion
  increment are in the outer scope of `enforceBundleStructure` (before `if (isSubjectAdminFor)
  return data`), so all users get version stamps on every save. Subject Admins also get the
  whitelist bypassed (correct).
- **Restore interaction.** Version restore in Payload calls `update` with the old version's
  data, which goes through `enforceBundleStructure`. For Editors: the whitelist applies —
  only prose fields from the restored version are written; admin fields are preserved from
  the current document. For Subject Admins: the full restored data is written. The semver
  always bumps on restore (treated as a write), which is correct.
- **Optimistic concurrency: `lockVersion` counter + Payload's `lockDocuments`.** True
  server-side OCC (reject-if-stale) can't safely distinguish a restore (submitted old
  `lockVersion`) from a concurrent edit without Payload exposing a restore context flag.
  Implemented: `lockVersion` increments on every save (clients can use it to detect races);
  Payload 3 **document locking is on by default** (guards concurrent admin-UI edits) — note
  there is no `lockDocuments: true` literal (the option type is `false | { duration }`), so we
  leave it at the default rather than setting it explicitly. Server-side reject-if-stale can
  be added when building custom API endpoints — at that point callers can pass
  `_expectedLockVersion` and the hook can enforce it.

---

## 2026-06-08 — Admin login loop on Safari: serverURL forces strict CSRF

After a Rock reboot, browser login looped (enter password → flicker → back to login),
specifically on **Safari**. Diagnosed against the running stack (not guessed): app healthy,
account not locked, password valid, and **header auth (`Authorization: JWT`) worked while
cookie auth failed** — login POST set the cookie but the follow-up GET wasn't authenticated.

Root cause in installed source (`auth/extractJWT.js` + `config/sanitize.js`): setting
**`serverURL`** makes sanitize **push it onto `config.csrf`** (`if (serverURL !== '')`), and a
non-empty `csrf` makes Payload honor a cookie token on a request with **no `Origin`** only if
it carries `Sec-Fetch-Site: same-origin|same-site|none`. Browsers omit `Origin` on same-origin
GETs; **older Safari also omits `Sec-Fetch-Site`** → the admin's auth-check GET is rejected →
bounce to login. (Reproduced exactly: cookie + correct `Origin` ✓; cookie + no `Origin`/no
`Sec-Fetch-Site` ✗; cookie + `Sec-Fetch-Site: same-origin` ✓.)

**Fix:** default `serverURL` to `''` (empty → NOT pushed to csrf → cookie auth honored for all
browsers; CSRF still covered by the `SameSite=Lax` cookie, which blocks cross-site
POST/subrequests). The password-reset email base moved to a separate **`ADMIN_URL`** env via a
custom `forgotPassword.generateEmailHTML` (serverURL is no longer available for it). Env-driven:
a public **HTTPS** host may set `SERVER_URL` to opt into strict CSRF (modern browsers over HTTPS
send `Sec-Fetch-Site`, so they're fine). **Rule:** don't set `serverURL` on a plain-HTTP/internal
host that older browsers hit — it silently breaks their cookie login; use `ADMIN_URL` for email
links instead. Gotcha: `serverURL` must be the empty string, not `undefined` (undefined is still
pushed to csrf).

**Session policy (same session):** set `auth.tokenExpiration: 900` (15-min inactivity window).
With `admin.autoRefresh` off (Payload default), the admin shows a "Stay logged in?" prompt ~1 min
before expiry and **force-logs-out an unattended session at expiry even with the tab open** —
addressing the shared-device "someone sits down later" concern (cookie persistence alone wouldn't).
Avoided very short windows (e.g. 1 min): the prompt fires at `expiry − min(60s, lifetime/2)`, so a
1-min window nags every ~30s and logs you out on any brief pause, risking lost unsaved edits.
"Log Out" is always immediate. Note Payload has **no native session-cookie / "clear on tab/browser
close"** option (cookie carries `Expires` = tokenExpiration, and tabs aren't cookie-scoped), so the
inactivity window is the supported lever. Tune `tokenExpiration` (`app/src/collections/Users.ts`) if
15 min proves tight for real editing.

## 2026-06-08 — Bundle field protection: blacklist → whitelist (secure by default)

Follow-up to the audit below. The first fix made `enforceBundleStructure` restore an
*enumerated* list of admin-only fields from the original (a **blacklist**). That is
insecure-by-default: a new admin-only field added inside an editable array that someone
forgets to add to the hook would be silently Editor-editable. **Inverted to a WHITELIST**
(commit `2059156`, deployed, `verify-rbac.ts` **19/19** against the deployed image): for a
non-admin Editor the hook writes the *original* document with only the Editor-editable
**prose** fields overlaid from the submission. Everything else is preserved.

- **Why this is the right default:** forgetting to whitelist a field can only make it
  non-editable by Editors (a visible annoyance, caught in use) — never silently editable
  (a security hole). New admin/system fields are protected automatically.
- **Standing rules for anyone adding bundle fields (see the LessonBundles docstring):**
  1. A new field is **admin-only by default**. To make it Editor-editable, add it to the
     matching prose-whitelist constant in `hooks/bundleIntegrity.ts` (and use `prose()`).
     The cross-container regression test in `verify-rbac.ts` guards the contract.
  2. Field-level `access` is **not** the authority for the Editor/admin split — the hook is.
     (`prose()`/`proseAdmin()`/`structureText()` carry only grammar hints + UI/create access.)
  3. **Array edits must submit the full array** (same rows/order): the hook rejects
     cardinality/order changes by Editors. Fine for the Payload admin UI; required to know
     before building custom API/editor flows.
- **UNIT.overview** is admin-only (SPEC §5 does not list UNIT) — modeled with `proseAdmin`
  and preserved wholesale by the hook; it is intentionally not in the prose whitelist.
- Field-level access is still kept on groups (META/UNIT), `phase`, the `rubric` array, and
  top-level `title`/`subjectGrade` as harmless defense-in-depth, but the hook is the
  single source of truth.

## 2026-06-08 — External audit (Codex + CodeRabbit) triage + fixes

Second external pass on the auth/bundle work (already merged to `main`). Six findings; all
valid. Triage (live now / next-task / future) and resolution below.

**Status:** landed over two commits on `main`, both deployed to the Rock (rebuilt via
`docker compose up -d --build`, migrate exit 0, app running) and verified against the
deployed image (not bind-mounted): `eba6157` (the fixes below) verified 17/17, then
`2059156` (the whitelist inversion + cross-container test, see the dedicated entry above)
verified **19/19**. The current design point is the whitelist hook.

- **[live-when-roles-exist, FIXED] Subject Admins could reset any user's password.**
  Verified in installed source (`collections/operations/utilities/update.js`): Payload saves
  `data.password` with NO password-specific access check — only collection `update` gates it,
  and Subject Admins have collection update on all users (needed for assignment mgmt). Added
  `guardPasswordChange` (beforeChange): only self or Site Admin may change a password; `!actor`
  is treated as a trusted system/override call (unauthenticated REST is already denied at
  collection access, and the token reset writes hash/salt directly, never via this path).
  Not exploitable today (only the Site Admin exists) but mandatory before assigning Subject Admins.
- **[authz-correctness, FIXED] Editors could edit `sections[].exemplar` (an answer key).**
  SPEC §5 makes exemplar Subject-Admin-only. Fixing this surfaced a **deeper Payload
  limitation (the important lesson):** field-level access reliably retains denied values for
  **groups** and **required** array subfields, but **NULLS optional admin-only subfields inside
  open arrays** when a non-admin submits the array — and nulls them at *write* time even when
  the parent is merely *omitted* from the update (hook injection of an omitted field does NOT
  persist; only modifications to *submitted* fields do). Net effect: with field access, an
  Editor's ordinary save would **wipe** `exemplar`, `sections[].title`, and (pre-existing, missed
  by everyone) `lessons[].duration/substrand/aresKeywords`. **Resolution:** remove field-level
  access from those optional admin array subfields and make `enforceBundleStructure` the single
  enforcement point — it overwrites admin-only values from the original for non-admins (omitted
  parents are then retained intact by Payload's merge; submitted changes are corrected by the
  hook). **Rule:** do not rely on Payload field-level `access` to protect optional admin-only
  subfields inside shared/open arrays; enforce those in a hook. *(This hook was then inverted
  from this blacklist to a secure-by-default whitelist — see the entry above.)*
- **[future, DOCUMENTED—not changed] FK `ON DELETE SET NULL` on NOT NULL columns**
  (`subject_grades.subject_id`, `users_assignments.subject_grade_id`, `lesson_bundles.subject_grade_id`).
  Verified Payload 3.85 / db-postgres exposes **no `onDelete` config** — it hardcodes SET NULL
  for relationships. Practically, SET NULL on a NOT NULL column *prevents* deleting a referenced
  parent (the delete errors), so there's no orphaning/data-corruption risk today — only a less
  friendly error and a schema smell. Hand-forcing RESTRICT in a corrective migration would
  diverge from Payload's generated schema snapshot and fight `migrate:create`. **Decision:** keep
  Payload's default; when taxonomy *delete workflows* are built, add app-level `beforeDelete`
  guards on Subject/SubjectGrade that block deletion when dependents exist (clear message),
  rather than fighting the FK DDL. No delete workflows exist now; deferred deliberately.
- **[live dev harness, FIXED]** `playwright.config.ts` `webServer.command` was `pnpm dev` →
  `npm run dev` (`npm run test:e2e -- --list` now works; 4 tests listed).
- **[future-correctness, FIXED]** `SubjectGrade` uniqueness `beforeValidate` lookup omitted
  `req` → added (transaction-consistent, per the rule below). DB-level composite unique index
  still deferred (app-level check acceptable at this scale; documented).
- **[next-task, DONE] Coverage.** `verify-rbac.ts` extended to 17 checks incl. password-guard
  (subject-admin-blocked / self-allowed / assignment-mgmt-still-works) and exemplar
  (editor-blocked / admin-allowed / prompt-still-editable) and admin-array-subfield anti-wipe.

## 2026-06-08 — Code-review (high) follow-ups + a Payload transaction lesson

A correctness-focused review pass (complementing the security review) on the auth branch.
No High bugs; the access hooks held up. Actioned:

- **M1 (fixed) — denormalized title went stale.** `SubjectGrade.displayName` ("<Subject> —
  Grade N") is stored at write time; renaming the parent `Subject` left it stale. Added a
  `Subject` afterChange hook that refreshes dependent SubjectGrade titles on rename.
- **L3 (fixed) — duplicated access helpers consolidated.** Exported a shared `Assignment` type
  and a single `subjectGradeIdsByRole` from `access/index.ts`; removed the near-duplicate copies
  in `access/bundle.ts` and `hooks/userRoles.ts`. Behavior-preserving.
- **Transaction-consistency bug surfaced while fixing M1 (the real lesson).** The rename hook
  *looked* correct but the title still didn't update. Root cause, found by instrumenting:
  (1) Payload **merges existing field values into `data`** on update, so a `beforeChange` that
  guards on `data.grade == null` still runs its recompute even when you only passed one field;
  and (2) `SubjectGrade.beforeChange`'s subject lookup **omitted `req`**, so it read *outside the
  current transaction* and recomputed the title from the pre-rename name, clobbering the refresh.
  **Rule:** always thread `req` into nested `payload.find/findByID/update` inside hooks — not just
  for writes (atomicity) but for **reads**, or they see pre-transaction state. Don't assume a
  partial update means other fields are absent in `beforeChange`.
- **Verification:** `verify-rbac.ts` extended with a rename check; full gate green on the Rock
  (9/9), test data self-cleaned. Tooling note: `/code-review` resolved to the CodeRabbit plugin
  (name collision); the high-effort correctness pass was done inline instead.

## 2026-06-08 — Product model: authorization entities + sub-strand bundle

Modeled the authorization entities and the sub-strand bundle as **native Payload nested fields**
(SPEC §3, §5, §8), plus the Codex scaffold-hygiene fixes. Collections: `subjects`,
`subject-grades`, role-bearing `users`, and `lesson-bundles`. Verified locally as far as a
DB-less host allows — `generate:types`, config sanitization, `tsc --noEmit`, and `eslint` all
clean; the migration + true end-to-end run happen on the Rock. Decisions and the non-obvious
traps:

- **Content model grounded in real data, not memory.** Shapes were read from the
  fidelity-proven `~/Desktop/ares-docx-fidelity-demo/bio_1_4_data.js` (matches SPEC §3 exactly):
  `rubric[]` = `{criterion, excellent, proficient, developing}`; `sections[]` =
  `{title, prompt, exemplar}`; `framework[].resources` is **absent** in real data → modeled
  optional. `UNIT` is `{}` there → modeled minimally as a single optional `overview` pending a
  populated example.
- **Conflict resolved — admin-panel access.** NEXT-SESSION said "panel = Site Admins only";
  **SPEC §5 (canonical) has Editors/Subject Admins editing via the admin edit screen in Phase 1.**
  SPEC wins: `access.admin` (`adminPanelAccess`) allows **siteAdmin OR subjectAdmin OR editor**,
  excludes plain Teachers. General rule: when NEXT-SESSION (staged plan) and SPEC (canonical)
  disagree, SPEC governs; surface the conflict rather than silently following either.
- **Conflict flagged — phase vocabulary.** The local `cbe-generation-system` checkout is the
  older **Python** generator, so the authoritative Node `docx_kit.js` phase→colour map isn't
  available. The `framework[].phase` dropdown uses the **five phase strings from `bio_1_4`**
  (`Predict Phase`, `Observe Phase`, `Explain Phase`, `Driving Question Board (DQB) Creation`,
  `Model Building Phase`). **TODO: reconcile against the Node generator's colour-map keys when
  the generator integration / ingest lands** — an unknown phase silently degrades output (SPEC §4).
- **Field access gates *values*; a hook gates *structure*.** Payload field-level `update: false`
  silently keeps a field's existing value, but field access **cannot** stop add/remove/reorder of
  array rows. So SPEC §5 is enforced in two layers: per-field access (prose = Editor+, META /
  phase / duration / answer keys = Subject Admin+, resource column + lesson `number` = system-only),
  **plus** `enforceBundleStructure` (beforeChange) which rejects cardinality/order changes by
  non-admins and re-derives lesson numbers from order. Highest-risk surface → security-review.
- **≤1 Subject Admin per subject-grade.** `autoDemotePriorSubjectAdmins` (afterChange) demotes any
  prior holder to Editor in the **same transaction** (`req` threaded) guarded by a `context` flag.
  Scoped role management for Subject Admins is enforced by `enforceAssignmentScope` (beforeChange):
  a non-site-admin may only touch assignment rows for subject-grades they administer.
- **`req.user` carries full role data.** Confirmed in installed source: the JWT strategy
  re-fetches the user via `findByID` (`auth/strategies/jwt.js`), so `roles` and `assignments` are
  always present in access functions; relationships come back as raw IDs at the default auth depth
  (helpers normalize ID-or-object via `toId`).
- **Two Payload-3 gotchas (trust installed source).** (1) A **virtual** field can be `useAsTitle`
  *only* if it maps to a relationship field — so `SubjectGrade.displayName` ("<Subject> — Grade N")
  is a **stored** field maintained by a beforeChange hook, not virtual. (2) `payload generate:types`
  runs **without a DB** (pure config parse) and is a fast local correctness gate; `next build` and
  migrations do need the DB → run on the Rock.
- **Field naming.** Top-level groups are camelCase (`meta`, `unit`, `lessons`, `finalExplanation`,
  `summaryTable`) to avoid uppercase-column oddities; the generator adapter will map them back to
  `META/UNIT/LESSONS/FINAL_EXPLANATION/SUMMARY_TABLE`. Inner keys already match the ARES data verbatim.
- **ESLint fix.** `eslint-config-next` 16 ships native flat-config arrays; wrapping them via
  `FlatCompat.extends('next/...')` double-wraps the flat plugin config and crashes the legacy
  validator ("circular structure"). Fix: import `eslint-config-next/core-web-vitals` and
  `/typescript` and spread them directly (no FlatCompat).
- **Security-review finding (fixed) — don't backfill `name` from `email`.** The first migration
  backfilled the new, publicly-readable `users.name` from the private `email`. Because `name` is
  *intentionally* public (attribution — SPEC §8) while `email` is gated by `emailReadAccess`,
  copying email into name leaked it to any authenticated user for pre-existing rows. Fix: backfill
  with a neutral `'User ' || id` placeholder, not email. **Rule:** when adding a public field to a
  table with rows, never backfill it from a private column — fix the *data*, not the field's
  visibility (locking down `name`'s read would break required attribution). The migration had
  already applied on the Rock, so the data was corrected in place (admin `name` set to "Site
  Administrator") and the committed migration amended for the not-yet-deployed production host;
  amending an applied migration is acceptable here because only the pre-existing-row backfill
  changed — the schema snapshot is untouched and the Rock won't replay it.
- **Admin-panel lockout + bootstrap (fixed).** Gating `access.admin` on siteAdmin/assignment
  (correct per SPEC §5) locked out the *existing* Rock admin, whose `roles` was `[]` — login API
  returned 200 but `/admin` refused entry. Fixed in place (granted siteAdmin). The deeper bug:
  on a *fresh* deploy Payload's first-user creation also yields `roles: []`, so the new admin
  would be locked out too — a bootstrap deadlock. Fix: `grantSiteAdminToFirstUser` (beforeChange)
  forces `roles: ['siteAdmin']` when creating the first user (user count 0). **Rule:** any time
  panel/admin access is gated on a role, ensure the *first* user is granted that role
  automatically, or the system is un-bootstrappable. Lesson on testing: `verify-rbac.ts` passed
  because it created users *with* roles; it didn't cover the role-less pre-existing/first user —
  exercise the bootstrap path, not just the happy path.
- **Email adapter (operations).** Password resets silently no-op'd ("Email attempted without
  being configured") because no email adapter was set. Added a conditional `nodemailerAdapter`
  (enabled when `SMTP_HOST` is set; console fallback otherwise; `skipVerify` so boot isn't
  coupled to SMTP reachability). Gmail SMTP needs a 16-char **App Password** (2FA required), not
  the account password. SPEC §11 wants real email/observability before real users.

## 2026-06-08 — External review (Codex) triaged into the build plan

Codex audited the scaffold against the root docs. Its code reads were accurate and it ran the
real `lint`/`test`/`build` commands (caught genuine tooling breakage). Its weakness was
**urgency calibration**: it reviewed code-vs-root-docs without weighting the staged plan
(this file + `NEXT-SESSION.md`), so "no product model yet" was reported as a defect when it's
the intended scaffold state. Outcome:

- **Actionable items folded into `NEXT-SESSION.md`:** a "scaffold-hygiene" pre-flight
  (npm/pnpm drift in the `test` script; int-test DB host; ESLint flat-config; finish dep
  pinning; Media default-private), plus the security items attached to the auth task
  (`access.admin`; `username` + field-level `email` read). None is a live exploit today
  (only the admin user exists) — they're requirements for the imminent roles work.
- **Prompting lesson for cross-model review:** give the reviewer the plan/stage
  (`SPEC.md` + `DECISIONS.md` + `NEXT-SESSION.md`); ask it to classify findings as
  (a) live risk now / (b) requirement of the next planned task / (c) future, and to check
  exploitability before assigning P1; have it separate scaffold defaults from designed
  choices. Keep leaning on it for running the deterministic commands and (later) security
  review of the access functions.
- Reviews stay **advisory**; the deterministic gate (golden-file diff, type-check, CI) is the
  arbiter — consistent with the 2026-06-07 multi-agent decision.

## 2026-06-08 — Scaffold deployed on Rock 5B; build & DB-init gotchas resolved

Got the Payload + Postgres stack building and running in Docker on the Rock 5B
(`/srv/lesson3`, named volume `lesson3_pgdata`), co-tenant with nanoclaw, `/admin`
serving, first admin user created. Several non-obvious traps, recorded so the
public-production host (identical stack) doesn't re-hit them:

- **`npm ci` failed: "Missing yjs/monaco/@testing-library/... from lock file."**
  Root cause was **not** Node/npm version (that was a red herring that cost time — a
  pinned-npm "fix" was tried and reverted). The scaffold's **`app/.npmrc` sets
  `legacy-peer-deps=true`** (Payload 3 / React 19 / Next 16 peer conflicts), but the
  generated Dockerfile's `COPY` line **didn't include `.npmrc`** — so `npm ci` ran in
  strict-peer mode in the image and rejected the legacy-peer-authored lock. **Fix:**
  add `.npmrc` to the deps-stage `COPY`. Lesson: `.npmrc` must travel into the build;
  when install passes locally but `npm ci` fails only in Docker, suspect a missing
  `.npmrc`/config, not versions.
- **Build then failed at `COPY /app/public`:** the blank Payload template ships no
  `public/` dir but the generated Dockerfile assumes one. **Fix:** committed
  `app/public/.gitkeep`.
- **App ran but `/admin` 500'd: `relation "users" does not exist`.** Production builds
  do **not** auto-push the schema (push is dev-only); production needs **migrations**.
  Verified against installed Payload source: prod default `push:false`, CLI is
  `payload migrate*`, default `migrationDir = src/migrations`.
- **Migrations can't run from the prod image** (minimal Next standalone, no Payload CLI).
  Generated + applied the initial migration from a one-off container built off the
  Dockerfile **`builder`** stage, on the compose network. Initial migration committed
  (`app/src/migrations/*`).
- **Wired migrate-on-deploy:** added a one-shot **`migrate`** service to
  `docker-compose.yml` (builds `target: builder`, runs `npx payload migrate`), gated on
  a new Postgres **healthcheck**; `app` now `depends_on` it via
  `service_completed_successfully`. So `docker compose up -d --build` applies pending
  migrations before the app starts. Idempotent.
- **Open follow-up — schema-change workflow:** generating a *new* migration still needs
  the `builder`/tools image (or local dev) to run `payload migrate:create`; only the
  *apply* step is automated. Document the create step when we first change collections.
- **Latent risk:** dev Mac runs **Node 25**, the build image runs **Node 22** (LTS).
  Regenerate lockfiles in the Node-22 toolchain (or align local dev to Node 22) to avoid
  tree-resolution drift. Not yet fixed.

## 2026-06-07 — Multi-agent review: deferred, with a concrete trigger

Considered bringing in a second agent (OpenAI Codex, and/or **Hermes** — the Nous Research
always-on agent daemon on the MacBook Air, GPT-5.x-capable) to review/test alongside Claude
Code. **Decision: defer. Claude codes; the human is the arbiter; deterministic checks are the
gate.** Rationale and the rules we settled on:

- **Independent cross-model review is valuable** (uncorrelated blind spots), but the *verdict*
  stays deterministic — golden-file DOCX diff, type-check, eventual test suite + CI — never a
  model's opinion. Reviews are advisory input, not a merge gate; never auto-apply a reviewer's edits.
- **One writer, one reviewer, integrate at the PR.** Never two agents editing the same tree.
  Shared constitution: `SPEC.md` is canonical; `CLAUDE.md` (Claude) and `AGENTS.md` (Codex)
  both defer to it — keep the pointers in sync.
- **Do NOT use Hermes as a per-change reviewer** — it has no native git/PR pipeline, so that
  path is glue-building = complexity for no gain (Codex/CodeRabbit/`security-review` cover
  per-change review with full repo context already).
- **Hermes's real niche is out-of-loop, always-on scheduled jobs** (daemon + cron + cross-session
  memory + messaging): nightly fidelity-regression diff with notification, scheduled async GPT-5.x
  review of the day's diff, dependency/backup watches. Nothing else in the stack does this well.
- **Trigger to revisit:** once there is feature code, a test suite, and **CI** (the deterministic
  gate) — *then* Hermes is justified as the async layer that schedules regressions/reviews and
  pings on failure. Not before. CI (GitHub Actions) is the prerequisite and the next infra piece.
- **Cautions for that day:** (1) Hermes's *self-improving skills* cut against a verification
  role's need for consistency — pin/review skill changes, don't let them auto-evolve. (2) Hermes
  overlaps nanoclaw; if adopted it should *replace* a role, not add a fifth standing agent layer.

## 2026-06-07 — Tooling: Payload skill installed; connectors trimmed

- **Payload skill installed** at `.claude/skills/payload/` (`SKILL.md` + `reference/`),
  pulled from `payloadcms/payload@3.x` `tools/claude-plugin/skills/payload/`. This is the
  structural fix for the CLAUDE.md "Knowledge currency" worry (stale Payload 3 APIs) — prefer
  it over memory when working on collections, fields, hooks, access control, versioning.
  Re-pull the same path if it needs refreshing.
- **`laravel-boost` MCP server removed** from `~/Library/Application Support/Claude/claude_desktop_config.json`
  — it pointed at Lesson2's PHP `artisan` (irrelevant to this single-runtime Node project) and
  was failing to connect. Restorable from the Lesson2 repo if ever needed there.
- **Account-level connectors** (trivago, B12, website generators, mcp-registry, etc.) are **not**
  in local config — they're synced from the Claude account and toggled in the app's
  **Settings → Connectors**, not by editing files. Keep computer-use, Claude-in-Chrome/Preview,
  and pdf-viewer (planned uses: DOCX visual-fidelity checks, admin-UI verification, PDF export).
- **Permission allowlist:** committed `.claude/settings.json` holds only read-only MCP entries;
  most frequent Bash commands are already auto-allowed by Claude Code, and the rest are mutating
  or arbitrary-execution and were deliberately left out.

## 2026-06-07 — Scaffold layout, env var, and `output: 'standalone'`

- **Payload scaffolded into `./app`**, not the repo root, to preserve the committed root
  docs and co-tenancy `docker-compose.yml`. `docker-compose.yml` `build:` points at `./app`.
- **Standardized on `DATABASE_URI`.** `create-payload-app`'s blank template (v3.85.0) reads
  `process.env.DATABASE_URL`; changed `app/src/payload.config.ts` to `DATABASE_URI` to match
  the project convention and the committed `.env.example`.
- **Added `output: 'standalone'`** to `app/next.config.ts` — the generated Dockerfile copies
  `.next/standalone` and fails without it.
- **`create-payload-app` is fully scriptable** despite the abbreviated `--help`: the hidden
  flags `--db`, `--db-connection-string`, `--secret`, `--no-git`, `--no-agent` make it
  non-interactive. (The prior session's interactive/PTY blocker was avoidable.)

## 2026-06-07 — bio_1_4 fidelity proof passed

Regenerating the three DOCX from stored data reproduced the stakeholder-approved set
exactly, except the per-phase Resource column (which needs the absent Python recommender).
Validates the core architecture: edit the data, regenerate byte-stable documents.
See assistant memory `fidelity-proof-passed` for the diff detail.
