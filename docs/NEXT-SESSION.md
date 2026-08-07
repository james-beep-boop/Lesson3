# Start here — plan the next phase

You are picking up the **ARES Lesson Library (Lesson3)**: a versioned lesson-plan repository that
uploads/imports ARES CBE lesson plans as structured lesson data, lets teachers/editors view + edit
them under field-level RBAC, tracks one **Official** version pointer per lesson plan, and exports
high-fidelity DOCX/PDF by reusing ARES's own generator. Node/TypeScript + Payload CMS (Postgres)
end to end.

**Read first, in order:** `CLAUDE.md` (working rules — auto-loaded each session anyway) → `SPEC.md`
(canonical architecture/domain) → `AGENTS.md` (stack, layout, commands) → `docs/DECISIONS.md`
(build-time decisions + reasoning; newest on top). **`DECISIONS.md` is long and still growing — skim
the most recent entries and grep it for the area you're touching; don't read it end to end.** (No line
count given: this one said "~6300" while the file had reached 8311, which is the derived-fact
staleness the file's own rules warn about.) This
file is the launch prompt; the build history lives in `docs/CHANGELOG.md` (consult only for provenance).

---

# ⚑ HANDOFF (2026-08-06) — edit recovery PR 1 is IN PROGRESS on a DRAFT PR

**Read this section, then `docs/DESIGN-working-drafts.md` §2-§4 and §8. Everything else in this file
below the "Next steps" list is older history.**

## Where the work is

`feat/edit-recovery-server`, open as a **draft** PR.

Committed and pushed, including the regression-coverage commit. **Deliberately SHA-free** — the
previous version of this block named one and was wrong within the hour, twice: first by claiming
"pushed" while eleven files sat uncommitted, then by naming the pre-commit SHA moments before the
commit landed. A SHA here is stale as soon as anything moves; the commands are right forever.

⚑ **Verify state before believing anything below.** This section describes work that is easy to
describe and easy to have not pushed:

```bash
git status --short                      # not empty ⇒ the work below is not all committed
git log --oneline origin/main..origin/feat/edit-recovery-server
git rev-parse --short HEAD refs/remotes/origin/feat/edit-recovery-server   # equal ⇒ nothing unpushed
gh pr list --state all --head feat/edit-recovery-server --json number,state,isDraft,mergeable
```

## ✅ The probe image: what it actually was (2026-08-06, RESOLVED)

The symptom was "the standalone bundle is broken — every API route 500s with `ChunkLoadError`". That
reading was wrong, and it sent two sessions after Turbopack and `output: 'standalone'`.

**The real cause: an empty, untracked `app/app/` directory.** This project's App Router is at
`src/app`. Next.js prefers a root-level `./app` over `./src/app` when both exist, so `next build`
emitted a build with **zero application routes** — no `/login`, no `/api/[...slug]` — and exited 0.
Every request then fell through to `_not-found`, whose chunk was genuinely missing, and the
ChunkLoadError was the only thing anyone saw. Measured: the degraded build produced 0 `route.js`
files; with `app/` removed the same commit builds every route and a complete standalone output.

**How it got there, and why it was invisible:** the AGENTS.md probe recipe's
`docker run -v "$PWD/app:/app" -v /app/node_modules …` run from inside `app/` instead of the repo root
makes Docker CREATE `Lesson3/app/app/node_modules` on the host. Git cannot track an empty directory,
so `git status` stayed clean, the Rock and CI never saw it, and only local image builds broke — the
shape that reads as "works everywhere except here". Directory timestamp: 2026-08-05 14:26.

**Guarded, not just cleaned:** `app/.dockerignore` now excludes `/app`, so an image build cannot be
poisoned by it even if it reappears. ⚑ If this project ever genuinely moves its App Router to a
root-level `app/`, that rule must be deleted or the same zero-route build returns with the cause
hidden one layer deeper.

**Two more traps found in the same session, both worth knowing:**

- **`docker compose build app` does NOT rebuild `migrate`.** The `migrate` service builds the
  `builder` target separately, so it ran a stale image and silently skipped the edit-recovery
  migration while reporting "Done." Build both, or `docker compose -p … build` with no service.
- **`payload migrate` HANGS on an interactive prompt against a push-contaminated database** — "you've
  run Payload in dev mode… data loss will occur. Proceed? (y/N)" — with no TTY to answer it. The
  container sits in `Up` forever and `app` never starts because it waits on the dependency. Drop and
  recreate that database rather than waiting.

## ⛔ Why it is a DRAFT

**Two earlier reasons are now CLOSED, and this section has already been wrong once by not saying so.**
The migration exists (closed first). The wire suite has RUN — 27/27 on recovery, 125/125 overall,
against a migration-only schema with push off — and migration gate step 4 is complete, both halves
(closed 2026-08-06, see below).

**Save-as-new retirement is now BUILT too** (2026-08-06, later): `versionEdit.ts` retires inside the
save's transaction, and matrix cases 7, 19, 20 and 29 execute over the wire. An earlier version of
this paragraph said it was unbuilt and was left standing after it shipped — it now contradicted a
section forty lines below. ⚑ **Do not quote a wire-suite total as proof that edit recovery is
complete.** It proves migration and schema compatibility plus the cases actually written; the
per-case status lives in `docs/DESIGN-working-drafts.md` §7 and nowhere else.

**What keeps it a draft is a judgement call plus one external gate** — see "What is LEFT".

The paragraph below is kept because it is the demonstration that made the migration non-negotiable.
⚑ The CI blind spot it describes is CLOSED as of 2026-08-06 — `test:http` runs with
`NODE_ENV=production` so Payload's dev push is off. Read it as history, not as a live warning.

The `edit-recovery` collection is registered in `payload.config.ts` and its two cascade hooks run on
**every version delete and every user delete**. Before the migration existed, production's
migrate-mode meant the table would not exist there. Demonstrated, not inferred: with the table renamed
away, a version delete fails with

```
Failed query: select count(*) from "edit_recovery" where "edit_recovery"."source_version_id" = $1
```

which breaks save-as-new `deleteSource`, make-official `deletePrevious`, plan deletion and user
deletion. **Merging this before the migration would have made `main` undeployable.**

⚑ **CI CANNOT CATCH THIS — a green gate is not schema safety.** `test:http` loads no
`vitest.setup.ts`, so it seeds via the Local API into the SAME database the running app serves
(`lesson3`, migrate-mode), and CI's synthetic `.env` omits `NODE_ENV`, so that Local Payload is not in
production mode and runs Payload's dev schema **push** — silently creating whatever the migrations
forgot, before the destructive tests touch it.

## What is DONE (all DB-proven on the disposable probe)

- The `edit-recovery` collection: closed on all four operations for every role including Site Admin,
  compound unique on `(user, sourceVersion)`, both parent cascades (user, version) plus the transitive
  plan→version→recovery path.
- The pure projection: `projectCapture` / `applyCapture`, importing the prose whitelists from
  `hooks/fieldSplit` rather than restating them, with `normaliseProseValue` covering code units the
  jsonb column cannot carry (unpaired surrogates AND U+0000).
- **The kernel, all four statements**: `start` (the only insert/reactivate path; a total no-op on
  resume; now also enforcing the per-user ACTIVE-CAPTURE CAP), `capture` (CAS UPDATE, never an
  insert), `retire` (ONE transition, three precondition shapes, and ALL FOUR designed callers now
  wired: save-as-new, discard, admin cleanup, expiry), and `expireCaptures`
  (select + per-row CAS), with `expireEditRecoveryTask` carrying a **schedule** so it actually runs.
- **The active-capture cap (SPEC §5's second cap)** — per user, counting ACTIVE rows only, enforced
  inside `start`'s single statement. Resume is never refused; reactivation counts. `start` returns a
  `StartResult` rather than throwing, since being at capacity is a chosen condition, not an error.
- `src/lib/txDb.ts`: the drizzle primitives, failing closed when a `transactionID` has no session.
- **The six operations across four URL paths** (`endpoints/recovery.ts`) — §2's table lists five
  rows because it bundles metadata and cleanup, and `/:id/recovery` carries POST, GET and DELETE, so
  "five paths" was wrong wherever it appeared. Body guards split into
  `endpoints/recoveryParse.ts` so they can be unit tested without a database or a served app — the
  same split, for the same reason, as `previewParse.ts`. Wire coverage **has RUN**: 27/27 on
  `recovery.http.spec.ts`, 125/125 across the whole suite, against a migration-only schema with push
  off (2026-08-06).
- **The `recovery` rate-limit bucket** in `lib/rateLimit.ts` (120/min default), and a **raw-body
  ceiling** on top of it, because rate limiting bounds how OFTEN an editor may post, not how large one
  post may be. Sizing and the reason it is not the kernel's 512 KB cap: the `MAX_RECOVERY_BODY_BYTES`
  docblock, which is the authority. Reasoning: DECISIONS 2026-08-06.
- **The migration**, generated on the Rock and hand-edited twice. See the gate below for what is and
  is not verified about it.

**Acceptance cases executing:** 15, 17-18, 21-25, 30, plus the cap's C1-C8. `docs/DESIGN-working-drafts.md` §7 carries the
live status — update it there as cases land.

**Regression coverage for the four fixes in `206252a`** — that commit changed three production files
and no test, which is what let a reviewer ask, correctly, whether any of it was pinned. Now:
`tests/unit/recoveryParse.spec.ts` (the malformed-`document` 400 and the body ceiling, including the
assertion that matters — the body is never read), `tests/int/editRecoveryMetadata.int.spec.ts`
(tombstones absent, and `bytes` banded against the compact serialised size), and
`tests/unit/editRecoveryMigrationOrder.spec.ts` (the rollback's statement order). **Each was watched
failing against a deliberately reverted fix before being kept** — five mutations, five named
assertions red, all reverted. A guard never observed failing is a guess.

## What is LEFT, in order

⚑ Items 1, 2 and 4 of the previous version of this list — the six operations, the rate-limit bucket
and the migration — are **BUILT** and are described under "What is DONE" above. They were still listed
here as unbuilt two commits after they landed; check this list against `git log`, not against memory.

✅ **RESOLVED — the probe app image, the wire suite, migration gate step 4, AND save-as-new
retirement.** `retire` now has all four designed callers: save-as-new joined discard, admin cleanup
and expiry on 2026-08-06.

**PR 1 (server) is FEATURE-COMPLETE.** What remains before merge is judgement, not construction:

1. **Nothing is blocking. The next step is a decision about merging**, and the PR should stay a draft
   until you make it deliberately. Everything the design assigned to PR 1 is built and executing;
   the remaining acceptance cases (1-6, 8-14, 26-27) are PR 2 client cases and cannot run without a
   client. See "Next steps" item 3 for PR 2.

   Worth knowing before merge: **no client sends a recovery token yet**, so on `main` this feature is
   inert by construction — every save takes the no-token path and retires nothing. That is the point
   of the optional token, and it is what makes merging ahead of PR 2 safe rather than a flag day.

   ### The implementation contract, as BUILT (operator review, 2026-08-06)

   **The recovery token is OPTIONAL, because PR 1 is server-only and no client sends one yet.** That
   is what keeps this shippable ahead of PR 2 rather than a flag day:

   | Body | Behaviour |
   |---|---|
   | no token | existing save behaviour, unchanged; **nothing is retired** |
   | `generation` **and** `expectedRevision` | retirement is **mandatory** |
   | exactly one of the two | **400** — a half-token is a client bug, not a no-op |

   ⚑ **Carry the token OUTSIDE the lesson document** — a separate multipart field, not a key in the
   bundle. A Site Admin editing the raw document must not be able to persist recovery metadata as
   lesson content, and the field-split whitelist is not a defence against a key that was never
   supposed to be in the document in the first place.

   **Inside each semver retry attempt, in this order:**

   1. create the candidate version
   2. retire the capture using the **same transactional `req`**
   3. on a retirement conflict, throw a dedicated 409
   4. only then perform the optional source deletion
   5. commit, and return the retirement token

   ⚑ **The two conflicts are not the same and the retry loop must tell them apart.** A semver
   conflict rolls back and **retries**; a recovery conflict rolls back and is **NEVER retried** —
   retrying it would retire the newer capture the precondition just protected, which is precisely the
   work this feature exists to save. That distinction IS case 20.

   **Tests, all EXECUTING** (`tests/http/saveAsNewRecovery.http.spec.ts`, 6 cases):
   - **case 7** — a token-bearing save retires the capture (content cleared, marker kept, revision
     advanced, generation unchanged) and returns the advanced token
   - **legacy** — a no-token save still works and retires nothing; a half-token is a 400
   - **case 19** — a REAL Postgres trigger faults the retirement UPDATE, so the failure originates in
     the database inside the endpoint's own transaction. No orphan version; the capture is intact
   - **case 20** — a second tab's capture advances the revision first; the save 409s and the
     retirement statement runs **exactly once**, counted directly (see below)
   - **`deleteSource=true`** — retirement happens BEFORE the source cascade removes the row

   ⚑ **Case 20 counts retirement STATEMENTS rather than inferring "not retried" from the outcome** —
   the obvious version of that test passes a loop that retried five times. Why, and the two tricks
   the counting needs: DECISIONS 2026-08-06 (save-as-new retirement, i).

   ⚑ **`tests/http` now runs `fileParallelism: false`**, matching the int suite and Playwright. The
   binding reason is the namespace-wide fixture purge, not this feature's triggers: DECISIONS
   2026-08-06 (save-as-new retirement, ii), and `tests/helpers/fixtures.ts` on `MARK`, which is the
   authority.

## The migration gate — all four steps, in order

1. ✅ Generate the migration on the Rock (Node 22) once the schema is settled.
2. ✅ Review **both** `up` and `down`. Two hand edits were needed and BOTH were found by running the
   rollback rather than reading it: the locked-documents FK must be dropped before the CASCADE that
   would already have removed it, and this task's `payload_jobs`/`payload_jobs_log` rows must be
   deleted before the `task_slug` enum shrink casts them into a type that no longer lists them. That
   ordering is now pinned by `tests/unit/editRecoveryMigrationOrder.spec.ts`, because the realistic
   way to lose a hand edit is regeneration, and the file's "do not tidy this back" comment is a
   request rather than a guard.
3. ✅ Apply to a **completely fresh migration-only database with push disabled** — never the probe's
   `lesson3`, which already has the table from a push-mode run and is therefore contaminated.
⚑ **`git diff --check` reports mixed indent and trailing whitespace in the generated migration, and
that is CORRECT to leave alone.** Payload's generator emits `  \t"col" …` inside a template literal;
every migration in the tree does the same (`20260608_024132_initial.ts` 65 hits,
`20260608_145602_lesson_entities.ts` 108, `20260608_224715_bundle_versioning.ts` 94). It is not a CI
gate — nothing in `.github/` or `scripts/` runs `diff --check`. Normalising this one file would make it
the only migration that diverges from generator output, which costs the next regeneration a spurious
diff and buys nothing. Check `diff --check` on hand-written files; expect it to be noisy on generated
ones.

4. ✅ **DONE (2026-08-06), both halves.** The `lesson3` database was dropped and recreated, all 20
   migrations applied to it from empty, and the **full wire suite ran against it with
   `NODE_ENV=production`** — push OFF, so the schema could only have come from migrations. 125/125,
   and that suite drives `save-as-new?deleteSource=true` and `make-official?deletePrevious=true`
   directly (`tests/http/endpoints.http.spec.ts`), which is the part the gate demanded and previous
   runs had substituted a cascade test for.

   The second half is closed too: **`test:http` no longer pushes in CI.** `.github/workflows/ci.yml`
   passes `-e NODE_ENV=production` on that step alone. ⚑ Not in the synthetic `.env` — `test:int`
   DEPENDS on dev-mode push to build `lesson3_test` from the model, so the two steps want opposite
   things and the setting has to be per-step. That closes the blind spot that let a collection with
   no migration go green here while being undeployable.

## Two cleanups this branch DECLINED, with the reasoning, so they are decided rather than forgotten

Both surfaced in a four-angle `/simplify` pass and both were judged out of scope for a fix-pinning
diff under CLAUDE.md's "don't refactor stable code in passing" rule. Neither is urgent; both are real.

- **The Content-Length pre-parse guard now exists in THREE hand-written copies** —
  `endpoints/previewParse.ts`, `endpoints/uploadBundles.ts` and now `endpoints/recoveryParse.ts` —
  each re-explaining the same "the header may be absent or dishonest" caveat in its own words. The
  rule of three is reached. The extraction is `assertBodyWithin(req, maxBytes, message)` in shared
  endpoint infrastructure (`endpoints/respond.ts` already exists for exactly this). ⚑ **Share the
  CHECK, not the constants** — the three limits measure different payload classes and must stay
  independent; coupling the numbers is the hazard, not the duplication. Worth doing with the next
  change that touches any of those files.
  Deeper version, if anyone wants it: `emailVersion.ts`, `forgotPassword.ts`, `markMessagesRead.ts`
  and `userAssignments.ts` all call `req.json()` unguarded, so "no request may make the process
  allocate an unbounded body" is currently opt-in and therefore permanently incomplete — every new
  JSON endpoint starts unguarded. A shared `readJsonBody(req, max)` would make the guard the default.
  And the part no application-layer guard can do — a body with a missing or lying header — wants a
  limit at the proxy/Next layer; there is none in the repo today.

- **`20260625_125532_drop_lesson_bundles.ts` has the same latent rollback defect this branch just
  fixed.** Its `down` rebuilds both `task_slug` enums as `('inline', 'generateArtifact')` — dropping
  a value — with **no** `DELETE FROM payload_jobs*` before the cast, so it aborts on any database
  where the removed task had ever run. The other four enum-shrinking migrations all carry the
  deletes. Found while checking whether `editRecoveryMigrationOrder.spec.ts` could be generalized
  across all migrations: **it cannot, yet** — a glob-based check fails on this file, and an allowlist
  exempting it would hollow out the guard. Fix that migration first, then generalize the test; the
  generalized form is what would guard the NEXT `migrate:create`, which is where the generator will
  reproduce this defect again. This is a correctness change to a stable migration, so it wants
  `/code-review` rather than a cleanup pass.

## Two known defects OUTSIDE this branch's diff, tracked here because they will otherwise be lost

- **`endpoints/userAssignments.ts` (~line 81) has a fail-OPEN copy of the transaction lookup.**
  `src/lib/txDb.ts` now owns that reach and THROWS when a `transactionID` has no resolvable drizzle
  session; `userAssignments` still falls through to `?? adapter.drizzle`, which would run its
  `SELECT … FOR UPDATE` on a pooled connection OUTSIDE the transaction it exists to serialise —
  defeating the row lock that stops two concurrent role changes both passing the freshness check.
  Migrating it is a behaviour change on code outside this diff, so it was deliberately not done in
  passing.
- **Three near-identical cascade factories** (`Favorites`, `Messages`, `EditRecovery`) restate the
  23502 NOT-NULL rule in four docblocks and enforce it nowhere. The prize is not DRY — it is a wiring
  test that walks the config, finds every collection with a required relationship, and asserts the
  parent's `beforeDelete` carries a cascade for it. The failure mode is OMISSION, and it surfaces in
  production as an opaque error.

## How to run the tests (the probe recipe is in `AGENTS.md` — read it, there are two traps)

Short version: `docker compose -p lesson3-ci-probe up -d --build`, always pass `-p`, put
`-e NODE_ENV=test` on the `docker run` (NOT on `docker compose up`), repoint the TRACKED `app/test.env`
and restore it afterwards with `git diff --exit-code -- app/test.env`. A long session exhausts the
shared daily rate-limit budgets and unrelated specs start failing; the reset command is in AGENTS.md.

---

# Landed 2026-08-05 — the env-parity + edit-recovery-design stack is IN `main`

`chore/env-template-parity` was merged (squash, head branch deleted) after ten review rounds. Nothing
about it is pending and there is nothing to recover; this section is history, kept because those rounds
produced rules that outlive them.

**Where the reasoning lives:** `docs/CHANGELOG.md` (2026-08-05) for what shipped; `docs/DECISIONS.md`
(2026-08-05) for the durable rules.

**It needs no deploy**: documentation, two config templates, one unit test, one CI mount, one docstring.

## What that stack contained

All documentation, config templates, one new unit test, one CI mount change, one corrected docstring.
**No product behaviour changes**, so the deployed Rock is unaffected and needs no deploy. Full summary in
`docs/CHANGELOG.md` (2026-08-05); reasoning and lessons in `docs/DECISIONS.md` (2026-08-05).

1. **Both `.env.example` templates reconciled**, pinned by `app/tests/unit/envTemplateParity.spec.ts`.
   The root template declared 5 of 58 variables the app reads; the missing `ARTIFACT_CACHE_DIR` breaks
   every export with `EACCES` on a fresh install. Reverses the Codex #5 deferral.
2. **A CI blocker this branch introduced, caught by a `/simplify` pass**: `test:unit` mounts only `app/`,
   so the spec could not see the root template and would have failed *every* CI run.
   `.github/workflows/ci.yml` now bind-mounts **the root `.env.example` alone** at `LESSON3_REPO_ROOT`,
   with `--network none`. It briefly mounted the whole workspace instead — which put `.git`, and the
   token a checkout persists in it, inside a container running third-party dev dependencies. Do not
   widen it back.
3. **`IdleLogout` docstring corrected** — it claimed `logOut()` redirects; it does not navigate at all.
4. **Edit recovery reconciled and APPROVED, with no code written**: `SPEC.md` §5 (normative) + §13
   (reserved words), `AGENTS.md` native-fields rule narrowed, `docs/DESIGN-working-drafts.md` rewritten
   with a §0 changelog and a **30-case acceptance matrix**.

### ⚠ What the new account will NOT inherit

The previous account held some operational knowledge in private memory, not in the repo. None of it is
secret-free-to-publish, so **ask the operator**:

- **Rock SSH access** (`ssh Rock5b`, `david@rock5b` over Tailscale) — key must be added to the new
  machine's agent.
- **Seeded user passwords** (Teacher / Editor / Subject-Admin on the Rock) — deliberately **not** in the
  repo. Ask; do not reseed a shared box to get around it.
- **The `age` backup private key** is Mac-only on the previous machine. Encrypted Drive backups are
  active and restore-verified, but **the cron was never installed** — see "next steps" below.
- Local stack procedure is in the repo (`AGENTS.md` → Local stack); logins are `local1234` by design.

### Next steps, in priority order

1. **✓ Land the branch — DONE 2026-08-05.** Merged as the squash commit on `main` titled
   *"config+docs: env templates reconciled behind a parity test; edit recovery approved for build"*.
   Item 2 is now the live priority.
2. **Edit recovery, PR 1 (server).** *This is the real priority and the only item on any list that is
   losing user work today.* Collection + access closure + the endpoints + projection + fencing + shared
   retirement function (**four** callers: save-as-new, discard, expiry, Site-Admin cleanup) + two parent
   cascades + expiry job + migration (generated on the Rock per the Node-22 workflow). Read
   `docs/DESIGN-working-drafts.md` **§0 first** — five provisions of the original draft did not survive
   review — then §2–§4 for the protocol and §8 for the PR split. Tests: `tests/int` access matrix,
   `tests/http` wire authz, projection units, DB-backed concurrency (cases 15, 17–25, 28–30).

   ⚑ **STATE, and the two traps, are in the HANDOFF BLOCK at the top of this file** — where the work
   is, what is done, what is left, the migration gate, and the two known defects outside the branch's
   diff. Not restated here, because two copies of a status drift and the top one is what a new session
   reads first.

   Two contract details worth carrying into the endpoint work, since they change its scope:
   - **Five table rows, SIX operations, FOUR URL paths.** §2's endpoint table bundles Site-Admin metadata and cleanup
     on one line, and the cleanup verb is unspecified — settle it. The wire-authz rule is per
     OPERATION, so that is six sets of 401/403/404 plus happy path.
   - **Local-API access tests must pass `overrideAccess: false`** plus an explicit `user`, or Payload
     bypasses collection access and closed-collection tests pass without testing anything. House
     pattern: the docblock of `tests/int/access.int.spec.ts`.

3. **Edit recovery, PR 2 (client).** Capture/flush in `LessonControls`, pre-expiry flush in `IdleLogout`,
   clearing on **both** expiry paths, restore prompt, role-aware indicator, 409/429 handling. Playwright
   cases 1–13, 26–27. Case 5 (a different user on the same browser sees nothing) is what justifies the
   whole server-side design.
4. **The Official-pointer lock**, in parallel if there is capacity. An Official version can be deleted
   during a concurrent promotion (`hooks/bundleVersion.ts` read-then-write + `ON DELETE SET NULL`),
   destroying an approved snapshot. The fix is the existing in-house pattern — `lockSubjectGrades` in
   `src/ingest/index.ts` is the template — applied to `lesson_plans`, **plus a real concurrent Postgres
   regression test**. Do not ship the lock without the test.
5. **First-user bootstrap atomicity.** `grantSiteAdminToFirstUser` counts then writes, so two
   simultaneous anonymous registrations can both become Site Admin. Narrow (empty DB, internal host —
   `lib/publicPosture.ts` covers the exposed case) but real. Needs `pg_advisory_xact_lock`, not
   `FOR UPDATE`: on an empty table there is no row to lock.
6. **Install the backup cron on the Rock** (`docs/OPS.md` has the block). Scripts and restore are
   verified; only the schedule is missing. Confirm with `crontab -l` first.
7. **Going public**, when the host decision is made: `docs/OPS.md` → "Going public", in its stated order.
   `SERVER_URL` is the single switch and cannot be half-applied. **Seed users before DNS points at the
   box** — on an empty DB Payload's first-register hands Site Admin to the first visitor.

Deferred and noted in code rather than done: deriving `COMPOSE_ONLY` in the parity test from
`docker-compose*.yml` and Dockerfile `ENV` lines (adds coverage, wants its own flips).

### How this work was reviewed, and what it taught — read before the next round

Six adversarial rounds (two models plus CodeRabbit) went over one 400-line test and one design document.
**Every round found a real defect.** The full analysis is in `DECISIONS.md` 2026-08-05; three rules worth
carrying into the next PR:

- **A check that enumerates what is FORBIDDEN can always be one form short.** Rounds 1–3 and 5–6 all made
  the same move — add the newly-named bypass — and each fix was correct and insufficient. Only two changes
  closed anything: *classify or report* every route to `process`, and *resolve* module identity instead of
  pattern-matching it. Prefer resolving the real thing, or enumerating what is allowed.
- **A guard never observed failing is a guess.** Every hole lived in code that read correctly, and four
  were in guards added by earlier rounds of the same review. Mutate the tree, watch the named assertion go
  red, revert. Do this for the guards you add *while fixing* a guard.
- **Prose that explains itself is not evidence.** A `start` SQL statement contradicted the acceptance case
  written 40 lines below it and passed inspection twice, because each reading checked it against its own
  adjacent comment. The 30-case matrix in the design doc is there so PR 1 does not repeat that; **none of
  those 30 cases were executed when this was written; cases 15, 17-18 and 21-25 are now implemented and
  passing on the unmerged `feat/edit-recovery-server` branch** — the design doc's §7 carries the current
  status, and it should keep being updated as cases land rather than restated from memory here.

Two admissions worth inheriting, both from this session's own handoff notes: a "trimmed the docstring"
claim that was measured against an intermediate commit rather than `main` (it was a net *addition*), and a
"provably a strict superset" comment on an optimisation that provably was not. **Check claims about your
own diff against `main`, not against your last commit.**

---

**Current state: the ARES `resourceLinks` cutover is DONE and VERIFIED LIVE — do NOT re-run its
migration or re-upload the corpus.** The Rock holds 42 plans, each with an Official 1.0.0, 384 lessons
in those Official versions, 1,950 fully-populated resource rows and 0 unsafe URLs (verified by direct
SSH inspection 2026-07-20). Both cutover migrations are applied. Treat any older block below that
presents that work as upcoming as HISTORY.

**No runtime change is pending for the Rock, and no deploy is required to land the stack above.** It
changes documentation, two `.env.example` templates, one unit test, one CI mount and one docstring —
nothing the server executes.

⚠️ **`app/` tree hashes will NOT match while that stack is unmerged, and that is expected.** Four of its
files live under `app/` (`app/.env.example`, `app/tests/unit/envTemplateParity.spec.ts`,
`app/vitest.unit.config.mts`, and a comment-only edit to `app/src/components/IdleLogout/index.tsx`), so
the tree hash differs from `origin/main` even though no runtime behaviour does. Compare the Rock against
**`origin/main`**, not your working branch:

```bash
git rev-parse origin/main:app
ssh Rock5b 'git -C /srv/lesson3 rev-parse HEAD:app'
```

Equal ⇒ the deployed app code is byte-identical to `origin/main`, whatever commits sit either side of it.
Once the stack merges, these two stay equal: a tree hash is not a promise about behaviour, but an
inequality here is always worth explaining before you deploy.

⚑ **Compare the same thing on both sides.** The first version of this check was
`git log -1 --format=%h -- app/` locally against `git rev-parse --short HEAD` on the Rock — two
*different* questions ("newest commit touching app/" vs "repo HEAD"), so a docs-only merge that the
Rock then pulls reports a **false mismatch**. Demonstrated on real history: `6dc67c8` (#181, app code)
and `3fca0af` (#183, docs only) have the *same* app tree `bc97756…`, while those two SHAs differ.
A tree hash is symmetric and immune to docs commits; `git rev-parse --short HEAD -- app` does NOT work
(the pathspec is ignored — it still returns HEAD).

Four successive deploys on 2026-08-02/03 (`6081ffb` #184 → `fe3dba5` #185 → `72ff346` #186 → this
batch, which carries the SubjectGrade `APIError` fix). `migrate` found nothing pending on every one —
no schema change anywhere in the batch — and the site was verified healthy each time (`/` → 307
`/login`, `/login` → 200). No open PRs; merged branches are deleted on the remote.

⚑ **Deliberately SHA-free**, because this block has now gone stale twice by naming one. #182 and #183
each rewrote it, and it was three deploys out of date when this session found it. A SHA in a docs file
is wrong the moment the next app-code PR merges; the command above is right forever.

⚑ Stated as "the last app-code commit", NOT as "main and the Rock are both at X". The equality form
invalidates itself: the docs-only PR that writes it is merged straight afterwards, so `main` moves
and the sentence is false before anyone reads it — which is exactly what happened to the previous
version of this line (#182, and see the rule in `DECISIONS.md`). `main` being AHEAD of the Rock by
docs-only commits is the normal resting state and needs no deploy; compare the Rock against the
newest commit that touched `app/`, not against `main`.

**▶ NEWEST — PR 2b SHIPPED (#184/#185/#186), all three deployed and live-verified.** Guide + Compare
visual system, a much denser Manage, and the **SPEC §8 email carve-out**. Full record in
`docs/CHANGELOG.md` and `docs/DECISIONS.md` (2026-08-02/03 entries). What a future session most needs:

- **⚠ THE EMAIL CARVE-OUT IS A REAL PRIVACY-POLICY CHANGE, and it is deliberate.** Manage → Editing
  access shows email addresses to **Subject Administrators as well as Site Admins**, in the
  current-editor rows AND the grant picker. Operator decision; SPEC §8 amended; CLAUDE.md records it.
  Because the grant picker must list every grantable user, this discloses **every non-Site-Admin
  address to any administrator** — not only people in their own subjects. Inherent to a grant picker.
  `emailReadAccess` is UNCHANGED (Site-Admin-or-self), so every other surface still withholds them.
  **Do not "fix" this as a leak** — read SPEC §8 first. Pinned per role by
  `tests/int/editorGroupsAccess.int.spec.ts` (10 cases), and the boundary lives in ONE unit,
  `app/src/lib/editorGroups.ts` (role gate + trusted query + projection), because it was untestable
  while inlined in the Manage server component.
- **`.claude/launch.json` is now TRACKED and works** (`npx next dev`). It had pinned a `node@22` path
  that no longer exists AND was gitignored, so the config `AGENTS.md` points at could not start and no
  clean clone could receive a fix. `next dev` is fine on node 25; the **Payload CLI still is not** —
  run `npx payload run …` (generate:types, seed) in the `lesson3-deps` container.
- **`tests/int` CAN be run locally** — the local stack publishes Postgres on `127.0.0.1:55432` and a
  `lesson3_test` DB exists there. `test.env` targets the CI/Rock host, so point it at the local URL,
  run, and **revert it** (it is tracked). Done twice this session; Rock/Node 22 stays authoritative for
  Playwright, which does not run under local Node 25.
- **Deferred with measurements: the Manage RSC payload.** Adding `email` grew it ~54% because
  `addable` is materialised per subject-grade — measured 1.34 MB → 2.06 MB at 60 SGs × 300 users.
  Sending the roster ONCE with per-group id lists measures **20× smaller** and fixes pre-existing
  bloat. Do it with the deferred roster-pagination work. ~40 KB at today's scale.
- **Also deferred:** splitting `.lp-manage__row` into two classes rather than the `--tight` modifier
  (the review's preference; it changes `DeletePlansPanel`'s mobile layout, so it was out of scope).

**▶ The SubjectGrade "stale subject" report — STILL UNREPRODUCED, but a real bug was found beside it.**
The operator reported that when creating a subject-grade, a recently-used subject "stays in the fields
and is stale, and overwrites the new intended one". Three navigation paths were tried and all came up
clean: a full page load of `/create`, a client-side `Create New` from a just-saved document, and the
inline `Add new Subject` drawer. **Not patched speculatively.** If it recurs, the exact steps are what
is missing — specifically whether the stale value is *visible in the field* or only *in what gets
saved* (the latter would be a correctness bug worth chasing hard).

What WAS found, fixed and shipped (#187): the duplicate-`(subject, grade)` guard threw a bare `Error`,
which Payload treats as an unexpected fault — logged at error level and returned as a generic **500
"Something went wrong."** So the one hook whose entire purpose is to replace an opaque failure with a
readable one produced an opaque failure of its own, for its whole life. Now `APIError(…, 400)` and the
form shows "Grade 10 already exists for that subject." **This is the most likely thing behind the
operator's report**: the save fails with no explanation, Payload keeps the submitted values, and a form
that will not save while showing what you typed reads exactly like a value that is stuck.

Two app-code deploys landed in quick succession, and it is worth keeping them straight:
- **`e097887` (2026-07-31)** carried **#176** (the Editor Save fix) and **#177** (the visual system:
  foundation + Manage) — the first app-code deploy since #172; #173–#175 carried none, and #174's
  build-context change took effect here, as that entry predicted.
- **`57988e8` (2026-08-01)** carried **#179** (PR 2a: Messages, document email and auth join the
  button system). That deploy matters beyond presentation: it repaired a **touch-target defect that
  was live on the catalogue** — see the PR 2a entry in `DECISIONS.md`.
- **`6dc67c8` (2026-08-01)** carried **#180** (the same touch target made structural in BOTH
  dimensions — `min-height` alone left the width riding on the label; `PDF` had under a pixel of
  margin) and **#181** (guard precision + a DECISIONS bullet that contradicted the one above it).

**Verified ON THE ROCK, signed in as Site Admin** (not just locally): all twelve new tokens serve
with the right values; the frontend and the admin both render root **16px**, **system-ui**,
line-height **24.8px**; Manage shows the identity block, one-line metadata, no version badge, and
named `Continue editing` / `Delete` actions — with **46 real rows**, a far better stress test than
the 1-row local seed, and no horizontal overflow. At 390px the header stacks (109.8px), rows go to
column layout, and both actions reach the 44px touch target. A **native** Payload collection page
(`/admin/collections/users`) is comfortable at 16px: no table overflow, row height 54.33px, product
font throughout — the check the whole root-size decision rested on.

**▶ THE LOCAL STACK NOW EXISTS — use it. `next dev` works.** #173 added
`docker-compose.local.yml` (publishes Postgres on `127.0.0.1:55432`, opt-in via `-f`) and
`app/scripts/seed-local-dev.ts` (four role logins + one browsable lesson plan). Commands, logins and
two traps are in **`AGENTS.md` → Local stack**. This is the single most useful thing to reach for
before any UI work: across #169–#173, FIVE defects were caught by a reviewer or the operator's phone
and ZERO by 318 unit tests, tsc or eslint. #172 was the first change verified in a browser BEFORE
merge, and that is now the expected workflow, not a bonus.
- Two blockers were in the way, only one predicted: no local Postgres, and a stale `app/.next` that
  served EMPTY BODIES WITH A 200 (`Invariant: missing bootstrap script`) — which reads as working.
  `rm -rf app/.next` and restart.
- The seed script REFUSES any non-localhost `DATABASE_URI`; that guard is unit-tested
  (`tests/unit/localDbGuard.spec.ts`) because it is what stops known-password accounts reaching a
  shared database.

**▶ NEWEST — ONE VISUAL SYSTEM. #176 + #177 BOTH MERGED AND DEPLOYED (`e097887`).** The design phase
the operator opened with "are we forever fated to have nonstandard fonts, spacing too close to the
top, and everything inconsistent with the aesthetic of the app?" Plan, acceptance matrix and outcome:
**`docs/DESIGN-visual-system-2026-07-31.md`**. Presentation only — no authorization, schema, endpoint
or migration change.
- **#177 (merged, deployed, Rock-verified): foundation + Manage.** ONE rem root (the admin was 15px, the frontend 16;
  that gap alone caused five drift items), one font stack (via Payload's own `--font-body`, NOT a
  `body` rule — Payload applies that variable straight to headings), one line-height (1.55 vs
  Payload's ~1.25), one page shell (Manage had **0px** between header and title against the
  frontend's 24px — the operator's actual complaint). Manage gains an identity block, structured
  version rows with a named `Continue editing`, the shared danger control for Delete, and real empty
  states. **This reverses the 2026-07-18 "admin renders ~6% smaller ON PURPOSE" decision** and closes
  that entry's "still not fixed … separate work" note about the ≤640px content padding.
- **#176 (merged): Editor Save returned a bare 500** for any bundle with an empty optional array.
  Payload posts an empty array field as the NUMBER `0`; the Editor cardinality guard called `.map` on
  it. Fixed with a rule as narrow as the serializer (`0` = empty, anything else rejected) plus a
  normalizer above the role fork — admins never reached the guard, and their stray `0` was silently
  defeating the no-op guard in `endpoints/versionEdit.ts`, minting duplicate versions.
- **✅ PR 2a — DONE (#179, merged and deployed `57988e8`).** Presentation only, and it delivered:
  Scope tightened by the operator 2026-07-31: Guide and Compare move to a LATER visual PR, so 2a is
  exactly the compose-and-send surfaces plus auth. Three things, all diagnosed:
  - **Width.** `.messages { max-width: 46rem }` caps the page at 736px inside the 960px column, for
    no derived reason. Delete it; take the shared column.
  - **Controls.** Messages, the document-email modal and the auth pages were ALL excluded from the
    button system (`DESIGN-button-system-2026-07-30.md` §5a, "worth doing; not worth doing blind" —
    this is the operator report that makes it no longer blind). There are THREE hand-rolled cancels
    (`.msg-compose__cancel`, `.msg-reply__cancel`, `.modal__cancel`), all `border:none;background:none`
    text links, and two hand-rolled sends. ⚑ The real trap: `button[type='submit']` (0-1-1) OUTRANKS
    `.btn` (0-1-0), so EmailModal's send escapes the system *despite carrying the class* — fixing that
    selector is what drags the auth pages in, and it retires the `opacity: 0.55` disabled states §2a
    already fixed for buttons. Reply toggle → **compact** size at desktop (a page-level control on
    every inbox row would swamp the list), 44px at ≤640.
  - **NOT in 2a: read behaviour.** Considered and deliberately left alone. The inbox renders every
    body inline, so "viewing the inbox is reading" (DECISIONS 2026-07-03) is internally coherent;
    removing automatic marking while offering only "Mark all read" would leave ordinary no-reply
    messages with no individual resolution. Revisit as its own product decision, not inside a visual pass.
- **✅ PR 2b — DONE (2026-08-02, branch `visual/guide-compare`).** Guide + Compare, the last two
  frontend pages outside the system, plus the `PageHeader` extraction PR 1 deferred. Presentation
  only; app-level, **no migration**. It closed two live defects, both measured in a browser rather
  than inferred: the Guide's page title rendered **22.4px/600** against 30px/700 everywhere else
  (the shared rule was scoped `.lesson-heading h1`, so it never reached a third page), and the two
  compare version pickers were **30.59px tall at 390px** — they belonged to no system, so nothing
  lifted them to the 44px target. Extraction also retired `.lesson-heading`, a byte-for-byte
  duplicate of `.page-heading` that two pages applied alongside it. See DECISIONS 2026-08-02.
- **⚠ WHAT TO DO NEXT:** **PR 2c** for the `kind` field + one-click grant (schema + migration —
  specify partial-failure/retry semantics FIRST: granting access and sending the confirmation are
  two writes and must not masquerade as atomic, and the subject-grade scope must be derived
  server-side from the trusted message/lesson relationships, never client input); then **PR 3** for
  the version editor chrome + native-Payload boundary.
- **✅ Local toolchain — FIXED and now TRACKED (2026-08-02).** `.claude/launch.json` had pinned an
  absolute `node@22` path that no longer exists on this Mac, so the one launch config `AGENTS.md`
  points at could not start — and it was **gitignored**, so a clean clone could not receive the fix
  either (caught in review: "the launch fix is not actually delivered by Git"). It is now plain
  `npx next dev` and tracked; the ignore rule is gone, because the machine-specific path that
  justified ignoring it is what got removed. Node 25 runs `next dev` fine, so the "node 25 hangs"
  note is stale **for the dev server only** — `npx payload run` still faults in its bundled tsx
  loader, so seed/maintenance scripts must run inside the `lesson3-deps` container (node 22). Also:
  the local DB already holds the 42-plan corpus and the `@lesson3.local` logins, whose passwords were
  reset to `local1234` on 2026-08-02.
- ✅ `PageHeader` is EXTRACTED (PR 2b) — `app/src/components/PageHeader.tsx`, three callers (Guide,
  Compare, lesson page). Deferring it was right for an unanticipated reason: extracting with one
  caller would have preserved the duplicate `.lesson-heading` class and the mis-scoped `h1` rule
  that together caused the Guide's small title.
- **The rule that paid for itself:** PR 1's acceptance protocol required creating a candidate through
  the REAL edit-and-save workflow. Doing that is what surfaced #176 — a bug 318 unit tests, `tsc` and
  eslint had all passed over. Do not substitute an API call for the user's actual path.

**▶ #172 MERGED & DEPLOYED — PR B: narrow-screen Edit explains itself.** Edit now renders at EVERY
width; below 640px pressing it opens a dialog ("Editing needs a wider screen. You can still view this
lesson here…" + one Got it) instead of unlocking the form or navigating. The standing notice is gone
from both surfaces, which retires the overlap class that #165/#166/#167 each patched — that text was
what competed for space in the narrow bar. The once-on-mount guard is unchanged: it decides the MODE,
the dialog explains it. Verified in a browser at 390px and 1280px on both surfaces before merge.
**This completes the wider-screen-affordance arc started in #163 — `DESIGN-button-system-2026-07-30`
§4 is now fully implemented; nothing in that document is outstanding.**

**▶ Newest work: ONE BUTTON SYSTEM — #169 + #170, both merged and deployed.** The lesson page and the
version editor carried nine independently-authored button treatments; they now share one geometry
from `--app-btn-*` in `app/src/app/app-tokens.scss`, with emphasis reserved for meaning (a filled
ACCENT background and weight 600 mean primary; filled alone means selected-in-a-set). Plan, state
table and review history: **`docs/DESIGN-button-system-2026-07-30.md`**. Presentation only — no
authorization, schema, endpoint or migration change.
- **Verified live, unauthenticated** (`/forgot-password`, which carries the shared Back control):
  `<a class="btn">` computes to the declared `#f6f7f8` — the original defect was that `.btn` never
  declared `background`, so an `<a>` was transparent while a `<button>` took UA gray. 15px / weight
  400 / 38px / 6px radius, all resolving from tokens; 44px touch target at 375px; keyboard focus
  gives a 2px accent ring at 2px offset ON TOP of the fill (`:focus-visible`, tabbed to for real —
  programmatic `.focus()` does not trigger it in Chrome).
- ✓ **Operator eyeball COMPLETE** (2026-07-31, all surfaces and widths) — reported good. It also
  caught two things the tests could not: the filter chips were still a sixth geometry, and the mobile
  nav avatar was top-aligned against its text. Both fixed in #170.
- **PR B is DONE** — shipped as #172 (see its block above). The design doc has no outstanding items.

✓ **RESOLVED (#173) — the local stack works; see the block above.** The old "node hangs in its own
bootstrap" note was stale, and the real blocker (no local Postgres) is now fixed. Kept as a pointer
because the workflow change matters more than either detail: UI is verified locally BEFORE merge.

**▶ #160 MERGED (2026-07-29, squash `430fbb4`), DEPLOY PENDING — "Editor" reframed as editing access.**
Presentation only: NO authorization/schema/endpoint/migration change; the stored `editor` value and the
authorization functions in `access/*.ts` are unchanged (the only `access/*.ts` edits are display
helpers). Implements `docs/DESIGN-user-model-language-2026-07-29.md`.

- **Three displayed types** (sentence case): Teacher, Subject-grade administrator, Site administrator.
  An `editor`-only grant shows as **Teacher** + a separate "Editing access: `<scopes>`" line; a subject
  admin's scope shows under "Administrator: `<scopes>`".
- **One source of truth**: `lib/accessScopes.ts` (`resolveAccessSummary`) computes type + scope lines,
  shared by the user menu (`AppNav`) and Manage so they can't drift — including the site-admin case
  (as of 2026-08-04: NO scope line on either surface, the type alone carries global access; the
  short-circuit that keeps per-grant lines off a site admin is unchanged). Disjointness is **enforced
  in the resolver** (a same-SG admin+editor pair, reachable via the demote path, lists once under
  Administrator).
- Copy sweep across widget/email/preview+upload errors/guide (`#editors` anchor kept)/`USER_GUIDE.md`/
  `SPEC.md` §5/§8; `payload-types.ts` regenerated for the one changed field description. Also folded in
  the minor guide-width tidy (fills the shared 960px column).
- `/simplify` (four angles) + two review rounds (resolver consolidation fixing a site-admin
  menu/Manage divergence and enforcing disjointness; terminology sweep). Local: tsc clean; eslint
  clean; unit **291/291** (the gate's e2e caught one missed heading assertion — `manage.e2e.spec.ts`
  now expects "Editing access", fixed pre-merge). Post-deploy Rock eyeball wanted across editor-only,
  mixed admin/editor, and site-admin accounts. **Deploy is app-level, NO migration (`scripts/deploy.sh`).**

**▶ COMMITTED — PR [#159](https://github.com/james-beep-boop/Lesson3/pull/159) OPEN, DEPLOY PENDING (2026-07-29, later) — dropped the redundant editor description + moved Back onto the Editing-title row.** Operator review of the live editor: the "Save button writes…" banner duplicated
the Editing help modal, and Back sat on its own row below the toolbar rather than top-right.

- Removed the collection `admin.description`; the rule stays in the Editing help modal. Regenerated
  `payload-types.ts` (Node 22, byte-clean); the `editorPlainLanguage` test now asserts it is gone.
- **← Back to lesson** now rides the "Editing: `<title>`" row at the far right; Save/Cancel/preview/help
  drop to the row below (`--output` `flex-basis:100%`). Matches the frontend's Back-next-to-title.
- Local evidence: tsc clean; unit **268/268**; eslint clean on changed files. Visual verification is
  the post-deploy Rock eyeball (no local app server).

**▶ #158 MERGED & DEPLOYED (2026-07-29) — Back-button consistency.** Rock on `9f2c756`.

- Shared `.page-back` appearance across surfaces: `PageBackLink` on the frontend (lesson, comparison,
  Guide, password recovery); the version editor uses a plain `<a>` with the **same** styling.
- Every page-level Back control is the last top-right action. The lesson-page order is
  **Favorite/Favorited → Back to lesson plans**.
- Shared fixed-size/font tokens prevent the Payload editor from shrinking or recoloring the control.
  The Guide's former footer link moved into its top-right heading.
- Navigation is the fastest correct one per surface: frontend Back uses Next `Link` for bandwidth-saving
  soft navigation; the editor's Back crosses root layouts (a full reload either way), so it stays a
  plain `<a>` rather than routing a guaranteed reload through `next/link` and risking the admin router.
- Password recovery now uses the same top-right control. Close-tab preview guidance is the only
  deliberate exception.
- `docs/DESIGN-user-model-language-2026-07-29.md` is **implemented** and committed as PR
  [#160](https://github.com/james-beep-boop/Lesson3/pull/160) (see the status marker at the top of this
  file): three displayed types — **Teacher**, **Subject-grade administrator**, **Site administrator** —
  with editing access on its own scoped line, resolved once in `lib/accessScopes.ts` and shared by the
  user menu and Manage. Presentation only (no authz/schema/migration). Carried through a four-angle
  `/simplify` pass and a follow-up review that fixed two resolver defects (site-admin consistency,
  disjoint scopes) with resolver-level tests. See the CHANGELOG entry and `docs/DECISIONS.md`.
- Local evidence: TypeScript clean; unit **268/268**; lint **0 errors** / 90 existing warnings;
  `git diff --check` clean. No local app server is available, so visual verification remains a
  post-deploy Rock check at desktop and phone widths.

**▶ COMMITTED — PR [#157](https://github.com/james-beep-boop/Lesson3/pull/157) OPEN, DEPLOY PENDING
(2026-07-28) — calm, plain-language editor + consistent Back buttons.** This completes PR 2 and PR 3 of
`docs/DESIGN-editor-usability-2026-07-25.md`, plus the operator-approved navigation cleanup. Audited
(full read) and carried through a four-angle `/simplify` pass before commit — see the CHANGELOG entry:

- Removed the ~40 repeated grammar descriptions; one accessible **Editing help** modal now owns the
  paragraph/bullet/formatting rules.
- Renamed technical display labels (`META`, `UNIT`, `SLO`, etc.), made Title **Document title**, removed
  internal descriptions, and hid system-numbered inputs. Stored names/data/access are unchanged.
- **Quick preview ↗** / **Formatted PDF ↗** now disclose the new tab. HTML preview tells the user to
  close it to return; deliberately no Back link in preview/PDF, protecting unsaved work.
- Lesson, compare, and editor pages gained prominent top-right **Back to lesson plans** /
  **Back to lesson** secondary buttons; the uncommitted 2026-07-29 follow-up above makes their
  component, placement, typography, and size truly identical and includes the Guide.
- `/guide`, `USER_GUIDE.md`, the design record, DECISIONS, and CHANGELOG moved in step. The old
  637-line changelog is preserved under `docs/archive/`; the new changelog is concise.
- Local evidence: `tsc` clean; unit **267/267**; lint **0 errors** / 90 existing warnings;
  `git diff --check` clean. `payload-types.ts` was regenerated on **Node 22**
  (`/opt/homebrew/opt/node@22/bin`) — the committed file is now byte-clean generator output (an earlier
  hand-sync had left one stray trailing newline, since removed). The Node 25 tsx loader fault only
  blocks `generate:types` on the default toolchain; use Node 22 locally.

**Next for this batch:** merge the PR once the gate is green, deploy (app-level, **no migration**), then
browser-check on the Rock: the **Editing help** modal, the renamed labels, toolbar wrapping at
1280×800, top-right Back placement, both new-tab paths (incl. the trimmed `pdfBusy` status line), and
all three roles.

**Shipped and deployed since (2026-07-20/21):** routing 404s fixed (`/lessons`, `/manage` → #114);
plan-create denied (#119); the destructive e2e fixture + broken PDF pixel gate retired (#120);
VersionsChip composed onto the shared accessible Modal (#121); the forgot-password `res.ok` client
change REVERTED as an enumeration oracle (#122); `/simplify` follow-ups (#123); **the forgot-password
oracle closed server-side by queueing delivery (#124 — carries a migration)**; and the PDF preview
made completion-aware (#125); and **#126 — a P1 correction to #124**: mixed-case/padded addresses
minted a live reset token but queued no email (recovery silently dead). Verified fixed in production.

Since then, all shipped, merged and CI-green: **#128/#129 — the browser e2e suite is a CI gate
(L3-07)**; **#130 — unread messages made reachable so the badge can converge (L3-05)**; **#131 — L3-03
settled**, moving best-effort enqueues off the caller's transaction; **#133 — the forgot-password
TIMING oracle closed** (a fixed response-time floor; byte-identical was not enough); **#135 —
/simplify follow-ups** incl. `enqueueDetached` and the PDF-preview twin bug; **#136 — sharp 0.34→0.35**
(forced major, libvips CVEs); **#138 — the enqueue type check restored + popup-twin tests**; **#139 — an orphaned pre-warm is now a no-op, not a captured failure**; **#141 — CodeRabbit round 3**
(enqueue runtime req-guard, twin test, doc accuracy); and **#142 — a #139 delete-between-reads race fix**.

> **✓ DEPLOYED & RESOLVED (2026-07-22).** Earlier this cycle the Rock rejected SSH (changed host key,
> then publickey denied) — likely a reboot that regenerated host keys — so #137–#142 sat undeployed for
> a stretch. SSH has since recovered (accept the new host key with `-o StrictHostKeyChecking=accept-new`
> on first connect; `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` if auth fails), the operator
> redeployed, and the Rock is verified at `1a1f5bd` with all runtime hardening live. Kept here only as
> the playbook for next time it happens: `cd /srv/lesson3 && git pull && docker compose build app &&
> docker compose up -d app`, then confirm the image was actually rebuilt (`docker inspect lesson3-app-1
> --format '{{.Created}}'`) — a source-string grep of `.next` is unreliable because Next.js minifies.

**✓ SHIPPED & LIVE (2026-07-27) — editor usability batch PR 1, plus three rounds of ops corrections.**
User/reviewer feedback said the editor read as a database form, not a teaching tool. Plan, verdicts and
deferrals: **`docs/DESIGN-editor-usability-2026-07-25.md`**; reasoning and lessons in DECISIONS 2026-07-25
and the two 2026-07-27 entries.

- **#150 — the current-lesson indicator + collapsed-by-default rows.** The jump-nav chip bar already
  existed and only lacked an active state: the chip for where you are is filled (`aria-current`, which is
  also the CSS hook, so accessible and visible state cannot drift), focus beats scroll while typing, and
  Final Explanation / Summary Table are tracked so the last lesson doesn't stay lit. Also carried
  `next` 16.2.6 → 16.2.12 + a postcss override, to clear two HIGH advisories that went red on the gate.
- **#151/#152/#153 — the operator script and the deploy path, corrected three times.** Net result:
  `scripts/clear-editor-collapse-prefs.ts` works and HAS RUN on the Rock (2 of 2 documents cleared,
  verified in the DB, owner relationships intact); the sidecar build is gated on image provenance;
  `gotenberg/Dockerfile` retries the font install and asserts Arial is actually registered; and
  `scripts/test-deploy-sidecar.sh` gives `deploy.sh` its first automated branch cover, in the CI gate.

**Two things a future session should NOT rediscover the hard way** (full versions in DECISIONS 2026-07-27):
1. **`user` is a Local API operation OPTION, not a data field.** `payload-preferences.user` is required and
   its `beforeValidate` hook replaces whatever is in `data` with `req.user`. Two rounds were spent
   concluding "the Local API cannot do this" — and a green CI test was written asserting that false limit,
   which then defended the raw-SQL workaround. When a platform call rejects you, check whether the value
   belongs somewhere other than where you put it before concluding the platform can't do it.
2. **A verification step must not be reachable when the change step failed.** `cd app && <edit>` run from a
   shell already in `app/` silently skipped the edit; the check that followed wasn't chained, ran against
   the unchanged file, and passed. Chain edit-and-check with `&&`, or use absolute paths.

**✓ SHIPPED & LIVE (2026-07-28) — #155: the §6 browser verification, the bug it found, and two more.**
Done against the live Rock in a browser (at the time the dev Mac could not start `next dev` — node hung
in its own bootstrap. **That is no longer true; see the stale-note correction at the top of this file.**
Kept as written for provenance). Target: Chemistry Grade 10 "Chemical
Bonding", version 228 — 13 lessons, ~200k chars of framework prose, so one EXPANDED lesson is ~3350px
against an 860px viewport, which is the shape §6 requires and no smaller fixture reproduces.

- **§6 PASSED:** scroll-spy with two adjacent expanded lessons (132 samples full-document, 0 mismatches,
  0 backwards jumps); FE/ST tracked so the last lesson doesn't stay lit; nested-collapsible (jumping to an
  open lesson opened none of its 5 nested collapsibles, FE none of its 10); focus-beats-scroll;
  collapse-by-default on a previously-used account, which is the half `initCollapsed` cannot do alone and
  confirms the #151 prefs clear reached a real user; mobile 390px (bar still `static`, no Title overlap).
- **§6 FAILED → FIXED: clicking a chip lit its NEIGHBOUR.** `scroll-margin-top: 7rem` (105px) parked jump
  targets 6px below the measured 99px toolbar bottom, so a just-jumped-to header never counted as crossed.
  5 of 6 wrong, then 6 of 6 on a re-run — the one that passed had merely beaten the recompute, so it was
  RACY, not consistently offset. Fixed by reading the margin back out of the DOM; `crossingLine()` now
  lives in `currentSection.ts` with 5 unit cases. **Rule: when a constant must exist in both SCSS and TS,
  have one side READ it, not both DECLARE it** — that seam was even commented "keep in step by hand".
- **Hide-details default INVERTED** (§4d, pulled forward out of PR 2 on operator request): the editor now
  opens with the sidebar collapsed, editing column 853px → 1280px. Done as `body:not(.lp-details-shown)`
  — the class marks SHOWN — because the body class is applied in an effect, so a state-only default would
  paint the sidebar and yank it away on every load.
- **The Edit button is now gated on `isEditorFor`.** It had rendered unconditionally, so a Teacher — or an
  Editor/Subject Admin viewing a subject-grade they hold no grant for — got an Edit button that swapped in
  Save/Cancel while the form stayed locked (measured: 23 of 23 fields still disabled, Save reading "No
  changes to save"). Not a security hole; field-level access held and the server re-gates. The frontend
  lesson page had gated this correctly ALL ALONG (`page.tsx` `canEdit`, with a "Request editing" button for
  viewers) — the admin bar was the one that had drifted. `?edit=1` is now an INTENT, not an authorisation.
- **Role verification COMPLETE** (all three, against live accounts — §6 warns these have previously been
  "verified" under the wrong role): Editor (Biology 10) sees NO META/UNIT in scope ✓ and no Edit
  out of scope ✓; Subject Admin (Biology 10) sees META/UNIT in scope ✓ and neither out of scope ✓;
  Site Admin retains everything ✓.

**PR 2 and PR 3 are now built locally** — see the newest block above. They are not yet committed,
CI-verified, deployed, or browser-verified.

**▶ MERGED (#163 + narrow-editor fixes #165/#166/#167) & DEPLOYED (2026-07-29) — editing is a
wider-screen affordance; 640px or narrower is view-only (operator decision 2026-07-28). One operator-side
visual confirmation of the ~550px editor still PENDING (needs a logged-in session).** Full reasoning:
DECISIONS 2026-07-29 (implementation) + 2026-07-28 (later); spec'd in `SPEC.md` §5.

- **Narrow-editor overlap fixes, all CSS-only, no migration** (found by showing the ≤640px editor at all —
  the Payload admin editor was never made mobile-responsive, the debt DECISIONS 2026-07-28 chose to defer):
  **#165** wraps the "editing needs a wider screen" notice onto its own full-width row (it had collapsed
  into a one-word-per-line column beside the buttons); **#166** hides the in-form jump nav at ≤640px (a
  desktop editing aid, useless when editing is blocked, and it overlapped the fields); **#167** overrides
  Payload's fixed-height `.doc-controls__controls-wrapper` at its mid-break (**≤1024px**, not just 640) so
  the multi-row bar takes natural height instead of overflowing onto the first field — this also covers an
  unmaximised <1024px editing laptop. See DECISIONS 2026-07-29 (Payload doc-controls mid-break).
- At 640px or narrower: the lesson page's **Edit** button, the version editor's **Edit / Save / Cancel**,
  and the `?edit=1` intent are unavailable, replaced by a notice naming the remedy (rotate / widen /
  larger screen). **Delete, Make Official**, previews, Share, messaging, favorites, version history, user
  admin, guide, auth all stay.
- **Behaviour:** new edit intent is neutralised on initial load (a once-on-mount guard in
  `LessonControls` running `editingAvailableAtWidth(window.innerWidth)`); an edit session already underway
  is not cancelled by a resize (the editor CSS hide is gated `:not(--editing)`, so narrowing mid-edit keeps
  Save). The guard *implements* the feature — it is not a work-loss guard (the CSS only ever hides Edit,
  never Save). TS decides the mode; the CSS button↔notice swap is cosmetic.
- **Files:** new `app/src/lib/editingViewport.ts` (constant + pure `editingAvailableAtWidth` + shared
  notice string); `LessonControls/index.tsx` (mount guard, Edit `className`, notice); `custom.scss` +
  frontend `styles.css`; `EditActions.tsx`. Tests: `editingViewport.spec.ts` (predicate) +
  `lessonControlsMountGuard.spec.tsx` (jsdom mount proving the wiring seam at 390px vs 1280px).
- **Evidence:** local tsc clean; unit **298/298**; eslint clean on changed files (one justified
  `react-hooks/set-state-in-effect` inline-disable — the lazy initialiser would read `window` during SSR
  and cause a hydration mismatch); `git diff --check` clean. CI gate green on the PR. **App-level, NO
  migration** (deploy's `migrate` service confirmed nothing pending). Deployed via `scripts/deploy.sh`;
  Rock rebuilt at `549accc` (`2026-07-29T19:04Z`), site healthy. Test lesson used for the operator
  screenshots: Biology Grade 10 "Cell Structure" (Official version), account `ED`.
- **Still to do (operator-side eyeball — needs login, which the assistant can't do):** confirm the
  **~550px** editor reads cleanly top-to-bottom (header · Viewing title · Back ·
  preview/PDF/details/help · then the form, no overlap) — #167 targeted the last known overlap
  (control-bar-over-Document-title); plus **390px** and **1280×800 / ~700px unmaximised** (editable;
  starting an edit then narrowing below 640px keeps Save). ⚑ **The "notice shown / no Edit" wording
  here is PRE-#172 and no longer describes the app**: Edit is now shown at every width and the
  standing notice is gone (see the #172 block at the top). The wiring is pinned by
  `lessonControlsMountGuard.spec.tsx`, so these are visual confirmations, not correctness gates.

⚠ **Remaining browser debt (both operator-side, need a logged-in session):** the #157–#160 editor UI
still wants an eyeball across the three account types; and the narrow-editor visual confirmation above.

**Not in this repo: the iCloud problem — DEFERRED by operator decision 2026-07-28** (still real, still
unmitigated; don't re-raise it as urgent unless asked). All 23 repos live in an iCloud-synced `~/Documents`, and three
Macs share one copy — 1,631 conflict copies, including duplicated `.git/index` files (`index 2` AND
`index 3`, i.e. three-way divergence). `git fsck` would not complete on Lesson3 in 25s, so object-store
integrity is unverified. Migration plan (clone-don't-move, plus the ignored-asset and secrets payloads a
clone does not carry): **`~/Desktop/icloud-git-migration.md`**. Do this before trusting the repo further.

**Remaining queue (nothing else is blocking).** Note the operator has since chosen the 640px mobile work
above as the next feature; item 1 below was the previous "operator-chosen next" and keeps its analysis.
Items 4 (full-codebase review) and 5's iCloud migration were explicitly DEFERRED on 2026-07-28.
1. **~~Unsaved editor PDF-preview latency~~ — CLOSED BY THE OPERATOR 2026-08-05: "much better than
   before and is good enough."** Do not spend time here. The diagnosis below is kept because it is
   accurate and names the LibreOffice floor (~5.5 s for the lessonSequence render) that any future
   complaint will run into — but treat optimisation (a)/(b)/(c) as not wanted unless the operator raises
   it again. Original entry follows as reference.

   **Unsaved editor PDF-preview latency (~10 s) — DIAGNOSED, then CLOSED unoptimised (reference only).**
   Confirmed on the Rock 2026-07-22 by direct measurement, corroborated by GPT's independent read.
   Two edit-page paths, and it's the FIRST that hurts repeatedly:
   - **Unsaved** (editing, form dirty) → `POST …/preview-pdf?doc=<tag>`: generates one DOCX from the
     working copy and converts it synchronously. UNCACHEABLE (content isn't saved), so every
     preview-after-an-edit pays the full cost. This is the recurring pain.
   - **Pristine** (form clean) → `openPreparedPdfInNewTab`: `ensureExportReady`-warms the version then
     serves the fast `GET …/export/doc` (~88 ms warm). Fixable to sub-second by pre-warming.

   **The bottleneck is LibreOffice, not any app route.** Measured on the Rock: converting the ~164 KB
   **lessonSequence** DOCX→PDF is **~5.5 s** with soffice already warm; a small doc is ~0.56 s warm but
   pays a **~1.8–2.5 s cold-start** on the first convert after idle (2487 ms→567 ms; GPT's Gotenberg log
   shows 2.411 s→558 ms identically). DOCX gen ~1.7 s. So a cold lessonSequence preview ≈ 1.7 + ~2 +
   5.5 ≈ **~10 s**; worse when queued (Gotenberg capped **2 CPUs / 1 GB**, `PREVIEW_PDF_MAX_CONCURRENT=2`
   — see the guards). `/export/doc` is serve-only (~88 ms warm, 409 cold); probes that blamed it timed
   the warm-up before the navigation. Hermes's "the delay is the View-as-PDF chooser menu" is wrong —
   that menu is an instant local `versionDeliverables(currentContent())` scan, no network.

   **Honest ceiling:** the ~5.5 s lessonSequence render is the LibreOffice floor and is NOT reducible
   without swapping the renderer, which we will not do (PDF-from-the-approved-DOCX is the invariant).
   So "sub-second" is real for the *pristine* path only; the *unsaved first-render-after-edit* floor
   stays ~5.5 s. (An earlier version of this note over-promised sub-second for both — corrected.)

   **Plan (do in order, measure between):**
   (a) **`--libreoffice-auto-start=true` on Gotenberg** (docker-compose) — removes the ~1.8–2.5 s
   cold-start. Cheapest experiment; try first, benchmark before/after. Trade-off: one stateful soffice
   process serializes conversions (fine for single-preview latency; see guards).
   (b) **Background pre-warm the pristine edit page** — on load / menu-open, fire `ensureExportReady` so
   a pristine click is a ~88 ms serve. Biggest win for that path; bound cost by warming only
   `lessonSequence`.
   (c) **Short-lived in-memory unsaved-preview cache** — key by `{user, versionId, tag, renderVersion,
   hash(effective content)}`, bounded TTL, **in memory** (never persist unsaved teacher work). Makes an
   unchanged re-preview instant; the first preview after any real edit still converts.
   (d) Only then consider deeper conversion/hardware work — LibreOffice is the floor; any option change
   must pass the visual/fidelity checks. No HTML-to-PDF shortcut.

   **Guards (things NOT to do):** don't raise `PREVIEW_PDF_MAX_CONCURRENT` — a single LibreOffice
   serializes, so a higher cap just lengthens the queue, it doesn't speed one preview. A *second*
   Gotenberg instance would help concurrent-user throughput, not single-preview latency.
   **Note:** (a) is a compose/ops change and (b)/(c) are runtime changes — this item, unlike recent
   docs work, needs a deploy.
2. **Edit recovery** (formerly "working drafts") — *the only confirmed silent work-loss path, and the
   data-integrity priority.* **RECONCILED + APPROVED 2026-08-05; ready to implement.** Normative rules
   in SPEC §5/§13, implementation design + the 30-case verification matrix in
   `docs/DESIGN-working-drafts.md` (path kept; the FEATURE is renamed — `draft` is now a reserved word,
   SPEC §13). Read the design doc's §0 first: five provisions of the original draft did not survive
   review of the code. Build in two PRs, server then client, per its §8. Multi-session project.
3. **(small) `emailVersionArtifact.ts` has the same orphan-hard-fail shape** that #139 fixed in
   `generateVersionArtifact` (`generateForVersion` + a version `findByID`). It is not prewarmed today,
   so it cannot orphan yet — but if email artifacts ever get the same prewarm treatment, it wants the
   identical boundary classification. Left as a flagged follow-up, not done in #139.
4. **Sequential full-codebase code review** — a resumable, Pro-plan-budgeted read of the whole source
   for correctness/security/invariants, one small unit at a time. Plan + progress table in
   `docs/CODE-REVIEW-PLAN.md`; findings accumulate in `docs/CODE-REVIEW-FINDINGS.md`. Read-only,
   so it is the ideal thing to run WHILE waiting on human reviewers — it complements them rather than
   racing them, and never dirties the tree.
5. Deferred, in rough value order: catalogue/admin pagination at scale; the recipient roster's
   unbounded read; CI dependency caching; Node 22 → 24; going-public ops (edge rate limiting,
   GlitchTip). Also consider a **scheduled deps-audit job** — four unrelated transitive advisories
   went red on the gate mid-PR this session (js-yaml, fast-uri, immutable, sharp/next).
6. Operator-only cleanup on the Rock: untracked `ingest-data/` and the spent
   `cloudflared-linux-arm64.deb` in `/srv/lesson3`.

**Two things worth carrying forward from #131** (full write-up in `docs/DECISIONS.md`):
- Payload's `jobs.queue` joins the caller's transaction **whenever `req` is passed**. Combined with
  drizzle's `commitTransaction` (a failed commit rolls back *without rethrowing*), a swallowed
  enqueue error can silently discard the primary write. Audit any new `jobs.queue` call for this.
- **A test for a transactional failure must be run against the unfixed code.** #131's first draft
  mocked the enqueue to reject and passed against the bug — a JS throw never touches the database,
  so nothing gets poisoned. Real fault injection means a real failing statement.

The prior context below stands as history. The Official-version cutover is long
done. **As of 2026-06-30 (all pushed + Rock-verified + CI green; verify HEAD with `git log -1`):** the hardening list
(Bucket A ⓪–③, deps overrides, #4, #8, Phase-5 residuals), a full **editing-UX redesign**, the **semver
retry-on-conflict**, the **`vitest` bump**, the **shared Postgres rate limiter**, AND **backlog #9 OPS**
(backups, structured logging, heartbeat, CI) are ALL DONE. The remaining #9 work is **operator setup only**
(keys/OAuth/cron — see `docs/OPS.md`), plus small deferred follow-ups. See "▶ RESUME HERE".

---

## ▶ (2026-07-20) — routing fix deployed; resourceLinks cutover done. SUPERSEDED: the Rock has moved on — see the current-state summary at the top of this file

**Routing 404s fixed (#114).** `https://test.kenyalessons.org/lessons` and `/manage` were 404ing: the
top-nav LABELS ("Lessons", "Manage") aren't routes — the canonical routes are `/` (catalogue) and
`/admin` (Payload manage). Added two config redirects in `app/next.config.ts` (`/lessons` → `/`,
`/manage` → `/admin`; same routing-layer mechanism as the existing `/admin/login` → `/login`;
`source:'/lessons'` is EXACT so `/lessons/[id]` pages are unaffected; 307 temporary). Deployed via
`scripts/deploy.sh` (app-level, NO migration) and verified LIVE on test.kenyalessons.org — `/lessons` →
`/` → 200 catalogue, `/manage` → `/admin` → 200, `/lessons/143` still routes to the lesson page,
`/lessonsX` still 404. **Rock is now on `main` `9a1049a`.** (Live authed API checks: prod uses a Secure
host-scoped cookie, so curl-over-http drops it — use `Authorization: JWT <token>`.)

**The resourceLinks cutover is complete and confirmed in production.** Direct SSH inspection (`david@rock5b`,
`/srv/lesson3`) on 2026-07-20 closed the "unverified" gap the block below described. Full evidence:
`docs/CHANGELOG.md` → "VERIFIED ON THE ROCK 2026-07-20". Summary: Rock on `main` `2db0570`; both
migrations (`185124` → `210359`) applied; lesson row de-flattened to 20 columns + child table present;
42 plans, each Official `1.0.0`, 384 lessons in the Official versions; 1,950 resource rows all
populated with 0 unsafe URLs; app healthy; Teacher DOCX (140 hyperlinks) + PDF export work end to end.
One benign `1.0.1` Not-Official editor draft exists on plan 143 (no row added, Official pointer intact).
**Also this session:** a full 5-agent `/code-review` of #111 (the Subject-Admin duplicate-lesson
resource-preservation fix) found no security/RBAC/CLAUDE.md/correctness issue — verdict posted to
[PR #111](https://github.com/james-beep-boop/Lesson3/pull/111); CodeRabbit had been rate-limited and
never reviewed it, so this is its only substantive review. One non-blocking robustness follow-up noted
(below).

**Likely next work (pick with the user):** the resourceLinks arc no longer has open items, so the
natural priorities are (a) the optional #111 hardening — a reorder/serialization regression test for
the byte-exact duplicate-match in `preserveLessonResourceLinks`, or strip ids inside the function; and
(b) Phase 5 Track B / going-public operator setup (`docs/OPS.md`): public host TLS + reverse proxy,
`SERVER_URL`/`ADMIN_URL` → the public URL (still the Tailscale URL), edge rate limiting, GlitchTip.

**Note — `main` is now a PROTECTED branch (2026-07-19).** Direct `git push origin main` is rejected;
every change (incl. docs) needs a PR + green `gate`. The old direct-to-main allowance is retired.

---

## ▶ Prior block (2026-07-19) — kept for provenance; SUPERSEDED by the Rock verification above

**Outcome:** the child-row fix is MERGED — PR [#108](https://github.com/james-beep-boop/Lesson3/pull/108)
(squash `17da012`), CI gate green, branch deleted. It repairs #107 (`f73abf7`), which had been merged
**on a red CI** (its `test:int` failed with exactly this defect) and deployed, producing the Rock 500s.
Process lesson recorded in DECISIONS: the CI gate only protects `main` when red blocks merge. #108 also
carries the full-audit evidence (local scratch-DB run: migration chain, http 88/88, int 68/68, real-file
upload byte-equal round-trip) and a `/simplify` pass (row-shape drift spec `resourceRowDrift.spec.ts`,
typed conversion; unit now 206). **The Mac dev stack was rebuilt post-cutover** (fresh volumes, full
migration chain, 42-plan corpus ingested: 42/42 Official 1.0.0, 384 lessons, 1920 resource rows;
seeded logins `admin|teacher|editor|subjectadmin@lesson3.local`). The old-corpus local DB was wiped
by user decision.

**Deployment status:** the operator reported that the Rock deployment of current `main` `2db0570`
succeeded. The GitHub `main` gate passed at that SHA. Codex could not independently inspect the Rock
because the private SSH key was not unlocked in its agent, so the migration ledger, Rock-only gates,
smoke tests, and replacement-corpus state remain unverified in this record.

**Post-merge P2 fix included in the reported deployment (#111):** Subject Administrators can now add a
lesson row by duplicating an existing row. The save boundary accepts only resource data exactly present
in the source version (Payload row ids ignored), then restores the server-owned copy; forged/modified
links still fail. Unit/local DB-free gates are green, and the two new HTTP cases passed in GitHub CI;
Rock verification is not recorded.

**Remaining operator verification (skip only steps already completed and evidenced):** confirm the Rock
is running `2db0570` and that the pre-migration backup exists; inspect `payload_migrations` to confirm
`20260719_185124_ares_resource_links_cutover` and `20260719_210359_resource_links_child_rows`; confirm
zero `lesson_plans`, `lesson_bundle_versions`, and lesson rows unless the replacement corpus has already
been uploaded; run DB-dependent int/http/e2e/build gates; smoke-test the
exact Physics 4.2 file that produced the database 500 and verify its stored five-phase rows, then run
DOCX/PDF fidelity against the established Physics 4.1 fixture/oracle; finally upload all 42 replacement
files and verify 42 plans / 42 Official 1.0.0 versions / 384 lessons plus sampled hyperlinks. The
corrective migration aborts if any lesson plans, versions, or lesson rows remain.

**Locked decisions (do not reopen during coding):**

1. Keep `schemaVersion: "1.0.0"` and intentionally re-baseline it. This is the first supported
   production contract after the clean reset, not compatibility with the deleted files. A missing
   `LESSONS[].resourceLinks` is an error, not a legacy mode.
2. `resourceLinks` is required at lesson level with exactly `predict`, `observe`, `explain`, `dqb`, and
   `model`; each bucket has `video`, `reading`, and `fallback_search_url`. Preserve the full upstream
   record, including search metadata/transcript/tier. Validate all nested keys and only permit
   `http`/`https` hyperlinks. A `video` or `reading` may be `null` when ARES found none.
3. Store the map losslessly as system-only native Payload fields: five phase-discriminated child rows
   under each lesson, converted back to the exact external object by the adapter. Do not distribute it
   into `framework[]`; repeated/missing framework phase rows make that transformation lossy. Do not
   flatten all five buckets onto the lesson row; that exceeds PostgreSQL's function-argument ceiling.
   Remove the unused legacy `framework[].resources` seam after verifying the reset left no values that
   require preservation. Existing values are never user-editable; a duplicated new lesson row may reuse
   only an exact resource value already stored in its source version, restored from the server copy.
4. Lesson3 consumes resolved data and never runs the Python recommender or SQLite index.
5. One document format only: current upstream Section C widths `[1520, 3040, 3040, 3040, 3040]`, with
   video/reading links beneath the phase label in the first cell. “Standard/compact” is historical
   rendering terminology, not JSON-schema terminology.
6. Generator target: `markknit/cbe-generation-system` commit
   `742c8a96637377abbec37af32073210b9f87465b`. Keep vendored source byte-pristine; supply stored
   resources through Lesson3-owned glue, never through the upstream Python-spawning loader.

### Original ordered plan and implementation record

Items 1–7 below are implemented and locally verified except for the explicitly Rock-only preflight.
Item 8's deployment step is operator-reported complete; its verification and repopulation status is
not recorded.

1. **Freeze fixtures and pre-flight the empty state.** Add the supplied Physics Grade 10 sub-strand
   4.1 JSON plus its current upstream DOCX output as contract/fidelity fixtures (or document a stable
   test-fixture fetch if repository size policy forbids the DOCX). Inventory all 42 replacement files
   and record the 384-lesson baseline. Before any upload, query the Rock for orphan
   `lesson-plans`/`lesson-bundle-versions`; stop and resolve any remnants that would trigger re-ingest.
2. **Make the JSON contract exact.** Update `ares-contract.schema.json`, contract typing, and
   completeness validation so 1.0.0 requires the full lesson-level map and rejects additional,
   missing, wrong-type, or unsafe-URL values at their precise JSON paths. Add fixtures proving the new
   shape passes and the former shape fails. Keep the upload size/count protections unchanged unless a
   measured corpus file exceeds them (the current files do not).
3. **Model the data natively in Payload.** Reusable system-only resource child rows now live under each
   lesson; Editor/Subject-Admin submissions cannot alter or erase existing values. A duplicated new
   lesson may reuse only an exact resource value already stored in the source version. The old
   `framework[].resources` seam is retired. Payload types and both migrations were generated through
   Payload's offline API and reviewed locally; the corrective migration exists because the first
   flattened model failed the Rock upload smoke test. Its application and database behavior remain
   unverified in this record after the operator-reported deployment.
4. **Carry resources losslessly through every boundary.** Update raw contract types, ingest mapping,
   Payload normalization, adapter/output types, field-split preservation, previews, and exports. Add
   exact deep-equality tests across raw JSON → validated data → Payload snapshot → generator adapter,
   including null resources, all metadata, duplicate framework phases, and malicious URL schemes.
5. **Adopt current upstream rendering.** Re-vendor the three generator library files from the pinned
   commit using the existing vendor script and update provenance. Change only Lesson3-owned bridge code
   so the vendored Section C builder receives `lesson.resourceLinks`. Confirm there is no
   `execSync`, Python, recommender, or SQLite dependency on the runtime path. Match current link text,
   icons/style, first-cell placement, five widths, striping, and page-break behavior.
6. **Invalidate derived artifacts.** Add/bump an explicit generator-render version in DOCX/PDF artifact
   cache keys and bump the HTML-preview render-cache version, because previously cached bytes for an
   unchanged immutable lesson version are no longer valid after the layout change.
7. **Prove contract and fidelity before deployment.** Run lint, TypeScript, unit tests,
   `ingest-extract-check`, `contract-check`, `adapter-fidelity`, production dependency audit, and a
   42/42 corpus validation/round-trip sweep. Compare the generated Physics 4.1 DOCX against the current
   upstream oracle at both semantic and package/XML levels: five columns/widths, hyperlink relationships
   and targets, phase placement, table striping, and page breaks. Any unavoidable byte variance must be
   identified and bounded—not waved through.
8. **Rock verification and repopulation.** Push/merge only after explicit user approval, then deploy via
   the schema-change runbook: backup, pull, generate/review/apply migration, run DB-dependent int/http/e2e
   and build gates, and smoke-test Site-Admin upload plus teacher DOCX/PDF access. Upload the replacement
   corpus only after these pass. With a truly empty plan/version database, every file creates a fresh
   Official 1.0.0; verify counts and sample resource hyperlinks after import.

### Final completion criteria (local criteria met; Rock deploy reported complete; Rock verification/corpus status unrecorded)

- All 42 current JSON files validate and round-trip without dropping or inventing resource data.
- A former-format 1.0.0 file fails with a clear `resourceLinks` error; there is no compatibility branch.
- Resources are system-only and survive editor/admin saves unchanged.
- Generated Section C matches current ARES layout and hyperlink targets with no Python/SQLite execution.
- Cache identities prevent stale pre-cutover DOCX/PDF/preview artifacts.
- Local and Rock gates pass, the database contains only the replacement corpus, and each initial upload
  is Official 1.0.0.

**Corrective child-row local verification after the Rock 500 (2026-07-19):** 42/42 JSON files and
384/384 lessons validate and round-trip; contract 16/16; ingest extraction 25/25; unit 201;
TypeScript clean; DOCX oracle 4/4;
adapter/oracle 6/6; lint 0 errors (87 existing/generated warnings); production audit 0 high/critical
(5 moderate transitive `esbuild` findings, no available fix). The five widths, striping, page breaks,
resource text, and 140 hyperlink targets are checked. `USER_GUIDE.md` and `/guide` now include the
Subject-Administrator duplicated-row workflow delivered in #111. The final review also made migration
rollback data-safe by refusing a populated corpus and made the generator resource bridge throw on
over-read; regression tests cover both over-read and under-read count drift.

---

## ▶ Older resume (2026-07-18) — editor "View as PDF" (accurate formatted preview); MERGED (#104 + #105), app DEPLOY PENDING (NO migration)

**Built the pre-agreed "View as PDF" editor button** (see the "DISCUSSED, NOT BUILT" block further
down), ran a **`/simplify` (4-agent) pass**, then applied **two review rounds** (per-document scope +
concurrency bound; then a perf fix + CodeRabbit + test hermeticity). App-level, **no migration**. Full
reasoning: **DECISIONS 2026-07-18 (latest) — editor "View as PDF"**.

**What changed (16 files under `app/`: 15 modified + new `src/lib/conversionLimit.ts`; + 3 docs
DECISIONS/NEXT-SESSION/USER_GUIDE):**
1. **New endpoint `POST /:id/preview-pdf?doc=<tag>`** (`src/endpoints/previewVersion.ts`) — the PDF twin
   of the unsaved HTML preview: same authz/field boundary (shared `resolveUnsavedEffective`) + shared
   completeness gate (`assertPreviewable`), then `generateDeliverableDocx(data, tag)` → `docxToPdf` →
   **inline PDF**. Validated `?doc` (`parseDeliverableTag`); 404 for a deliverable the plan lacks.
   Registered in `LessonBundleVersions.ts`.
2. **Toolbar control** (`components/LessonControls/index.tsx`) next to Preview — **`View as PDF ▾`
   dropdown** of the present deliverables (`versionDeliverables`), or a plain button when there's one.
   Branches on `useFormModified()`: **pristine** → shared `openPreparedPdfInNewTab` (cached
   `…/export/doc?doc=<tag>&as=pdf`); **unsaved** → shared `postCurrentContentToNewTab('preview-pdf?doc=<tag>')`.
3. **Throttling:** dedicated `previewPdf` rate bucket + a non-blocking in-process **concurrency semaphore**
   (`src/lib/conversionLimit.ts`, default 2 = `jobs.limit`) → **503** when saturated; client `pdfBusy`
   gates both branches. (This path runs Gotenberg IN the request, unlike the async export path.)
4. **HTTP wire tests** — 401 / missing-`?doc` 400 / Teacher 404 / absent-deliverable 404 / structural 422 /
   Editor 200 `application/pdf`; **+ a "more text in → larger PDF" test** proving the unsaved edit reaches
   the PDF without a PDF-text dep (Gotenberg is nondeterministic byte-wise — length is the stable signal).
5. **Shared-helper extractions (`/simplify` + review, behavior-preserving):** `assertPreviewable`;
   `generate{LessonSequence,FinalExplanation,SummaryTable}Docx` + `generateDeliverableDocx`;
   `openPreparedPdfInNewTab` + `postCurrentContentToNewTab`; `deliverableStem` + `DELIVERABLE_LABELS`
   (`DocStrip` reuses the labels); `mimeFor('pdf')` + zero-copy response body.

**Scope:** PER-DOCUMENT (revised from the initial primary-only cut after review — someone editing the
Summary Table shouldn't get a Lesson Sequence PDF).

**Verified** on the local compose stack (Gotenberg live): per-`?doc` 200/400/404; Teacher 404; structural
422; **6 concurrent → exactly 2×200 + 4×503**; big-text overlay → +4651-byte PDF; dropdown lists the
present docs and each item requests the right `?doc`. `tsc` clean; `test:unit` **190**; **lint 0 errors** —
within the CHANGED files the only warnings are in the HTTP test (its existing `(fx.version as any)` style);
the new source files are warning-clean. (Repo-wide lint carries ~79 PRE-EXISTING warnings across unrelated
files — not introduced here.) http/e2e run in CI (can't run the http suite locally — needs the isolated
`lesson3_test` DB). Browser-automation caveat in DECISIONS (form-POST-to-`_blank` → GET in the pane; hits
the shipped Preview button too — not a regression).

**Status: MERGED — PR [#104](https://github.com/james-beep-boop/Lesson3/pull/104) (squash `7a93515`)
+ follow-up [#105](https://github.com/james-beep-boop/Lesson3/pull/105) (squash `dba897c`), both on
`main`; branches deleted.** CI green on both (gate + CodeRabbit). Review rounds applied: CodeRabbit
slot-leak/exhaustive-default; perf + test hermeticity; then #105 = the fresh-on-click document picker
(fixes the stale-`savedDocumentData` menu). **App-code DEPLOY PENDING** — folds into the pending Rock
deploy below, **no migration**. Eyeball after deploy: editor
toolbar shows **View as PDF** (a `▾` menu when the plan has FE/ST; a plain button otherwise); pristine
opens the formatted doc inline; after an edit it reflects the unsaved change; a single-document plan is
one-click, a multi-document plan opens a picker (computed on click, so an admin's unsaved add/remove of a
Final Explanation / Summary Table is reflected).
**Fixed in the second review round:** the request-editing HTTP test now derives its expected recipient set
from live DB state (no longer assumes one Site Admin), so it's hermetic against a populated DB.
**Not fixed (pre-existing, unrelated):** the ≤640px Manage-vs-frontend padding difference.
**Still deferred:** Site-Admin avatar (accent-blue) — see the #102 block below.

---

## ▶ Older resume (2026-07-18, latest) — cross-surface consistency (shared tokens, Manage aligned, Messages header); MERGED (#103), app DEPLOY PENDING (NO migration)

**A UI consistency pass making the Payload admin Manage view read as the same app as the frontend, all
app-level, NO migration — MERGED to `main` via PR #103 (squash `ebbe1ff`; `main` now `ebbe1ff`).** CI
`gate` green (unit/int/http/e2e/`next build`), CodeRabbit pass. Full reasoning: **DECISIONS 2026-07-18
(later) — cross-surface consistency**. Two rounds of external review applied (a `/simplify` pass + a
follow-up findings pass).

**What changed:**
1. **Shared design tokens** — new `app/src/app/app-tokens.scss` (single source: `--app-page-title-size`
   [rem, scale-relative], `--app-content-width` 960px + `--app-content-pad` 20px [px, pixel-identical],
   `--app-accent` #1f5fa8). Imported by the frontend layout AND `@use`d by `custom.scss`; the admin layout
   is Payload-auto-generated so `custom.scss` is the only hook. Kills value drift between the two stylesheets.
2. **Accent single-sourced** — six hardcoded `#1f5fa8` in `custom.scss` now use `var(--app-accent)`;
   supersedes the old "keep in sync by hand" note (button contrast fix unchanged, value-identical).
3. **Manage aligned to the frontend** — 960px column, title at `--app-page-title-size`, left edge matches
   the catalogue (overrode Payload's `Gutter` pad → `--app-content-pad`; dropped a stale `.lp-manage`
   46rem cap).
4. **Back-link** removed on /messages (redundant + mislabeled); kept on the lesson page + `← Back to lesson`.
5. **Messages header** — `New message` button inline with the "Messages" heading (`Composer.tsx`).

**Verified:** `tsc` clean · `test:unit` **190** · sass compiles · both content columns measured
pixel-identical (20px pad / 960px) · admin accent resolves (#1f5fa8, enabled primary = accent). **http/e2e
run in CI** (can't run locally).

**Status: MERGED (PR #103, squash `ebbe1ff`), on `main`, branch deleted. App DEPLOY PENDING** — stacks on
the #102 batch below; **one Rock deploy covers both, no migration**. Post-deploy eyeball: Manage page reads
like the frontend (960px column, big title, left-aligned); Messages has the New-message button inline with
the heading + no back-link; admin primary buttons still app-blue.
**Still deferred (next pickup):** Site-Admin avatar (accent-blue) + preview "View as PDF" — see the block below.

---

## ▶ Older resume (2026-07-18, later) — version edit-view cleanup + type hierarchy; MERGED (#102), app DEPLOY PENDING (NO migration)

**A small polish batch, all app-level, NO migration — MERGED to `main` via PR #102 (squash `aa4dec9`;
`main` now `f58f844`).** CI `gate` green (unit/int/**http**/**e2e**/`next build`), CodeRabbit pass. Also
verified on the local stack (frontend + `/admin`, Site-Admin login): `npx tsc` clean, `test:unit` (190)
+ full `test:int` (68) green, create/duplicate rejection curl-confirmed over the wire (403/403). Full
reasoning: **DECISIONS 2026-07-18 (version edit-view cleanup + type hierarchy)**.

**What changed:**
1. **Version editor: "Create New" + "Duplicate" removed** — both are Payload kebab actions that
contradict SPEC §7 (versions are born only via ingest / re-ingest / save-as-new, all overrideAccess).
Fix = **deny caller-access create** (`lessonBundleVersionCreate` → `() => false`) + `disableDuplicate`.
Reverses the old "direct create is an admin action" note (now denied outright — stronger than the #65
field-strip). New int block pins it; the two superseded semver/sourceVersion field-strip tests removed.
2. **Delete promoted to an explicit red button** in `LessonControls` (view mode, deletable versions
only; server re-gates). Native `.doc-controls__popup` kebab hidden — no three-dots menu remains.
3. **Toolbar hairline spacing** — jump nav now clears the bottom divider (`.lesson-controls-wrap` padding).
4. **Page-title hierarchy** — brand stays 1rem; the two page titles share `--app-page-title-size`
(1.9rem/700; the token was renamed from `--page-title-size` in the later shared-tokens work below);
"Lesson plans" → "Lesson Plans".

**Review follow-ups (GPT pass, all applied — see DECISIONS):** (a) fixed a Delete-eligibility drift —
client `canDelete` now uses `canDeleteVersionDoc` (per-doc form of `deletableVersionsWhere`, single
source; a since-demoted author no longer sees a 403-ing Delete), DB-free unit test added; (b) retired
the obsolete `verify-stage2b-edit.ts` (superseded by the immutable model + automated suites), redirected
the `verify-rbac.ts` pointer; (c) added an HTTP wire test pinning REST create/duplicate → 4xx
(curl-confirmed 403/403 on the running app).

**Status: MERGED (PR #102, squash `aa4dec9`), on `main` `f58f844`, feature branch deleted.** APP-CODE
**DEPLOY PENDING** — one `scripts/deploy.sh` for `main`, **NO migration** (all app-level). Stacks on
top of the 07-17/18 batch below if that Rock deploy hadn't already run. **Eyeball after deploy** (on
`/admin`, a non-Official version): no three-dots kebab; a red **Delete** button (view mode; hidden on
the Official version); jump-nav spacing; on the frontend, "Lesson Plans" (cap P) and the lesson title
now the same size; brand stays small.

**DISCUSSED, NOT BUILT (next pickup, agreed direction):**
- **Site-Admin avatar** — the "SA" avatar can't be told apart from a Subject Admin's. `UserMenu` already
  gets `typeLabel` (the role), so add an `isSiteAdmin`/`--site-admin` modifier and style it **accent-blue
  fill** (rejected red = danger semantics, italic = fiddly, bold = too subtle). Tiny.
- ~~**Preview "View as PDF"**~~ **BUILT 2026-07-18 — see the newest RESUME block at the top.** Design
  as recorded below (primary deliverable; saved→export cache, unsaved→generate+docxToPdf). Original note:
  the flat HTML preview (mammoth, styling dropped) KEEPS its use (fast
  structural check); ADD a **View as PDF** button (the accurate, formatted rendering) **in the editor
  toolbar next to Preview**, NOT on the preview page (that page is a script-free one-shot render with no
  working-copy JSON to re-submit). Saved version → link the existing export PDF (already served inline);
  UNSAVED working copy → reuse the DOCX the preview endpoint already generates (`generateBundleDocx`),
  run through `docxToPdf` (gotenberg, already running). PDF, not HTML — mammoth drops styling by design,
  so faithful HTML is harder than the PDF, which IS the real rendered document. A "Compare from here"
  (fixed-left compare) was considered but is a SEPARATE feature (answers "what changed", not formatting) —
  deferred.

---

## ▶ Older resume (2026-07-18) — 07-17/18 UI batch + no-op guard + email→domain migration; `main` `91194a5` (code `7ed7b19`), app DEPLOYED

**A batch of user-requested UI changes + a save-integrity guard, all on `main` (`7ed7b19`), CI-green,
app-level, NO migration.** Full reasoning: **DECISIONS 2026-07-17 (UI batch + no-op save guard) and
2026-07-18 (review follow-ups)**. Shipped as several direct-to-main commits + one CI-gated PR (#101,
the endpoint change). Every UI item was browser-verified on the local stack.

**What shipped (one deploy covers all of it):**
1. **Password show/hide "eye"** on login / signup / reset (shared `components/PasswordInput`).
2. **Lesson-page download declutter:** the page's Documents line + Supporting-documents disclosure were
   REMOVED (they duplicated the catalogue row); ALL downloads now live in the **Share** menu, which
   gained a **"Download one document"** per-document section. Revises the teacher-first "one-click on
   both surfaces" call — the catalogue row keeps its one-click; the lesson page routes through Share.
3. **Admin button contrast fix:** our unlayered `.btn--style-primary` override beat Payload's `@layer`
   rules even on DISABLED buttons (dark text on app-blue = the illegible Manage "Add"); both states now
   restated (enabled white-on-blue ≈7.5:1, disabled Payload's own gray/dark).
4. **Version editor "Hide details / Show details"** toggles the right sidebar via a body class that
   mirrors Payload's own empty-sidebar collapse recipe. Per-page, shown on open, no persistence.
5. **No-op save guard (PR #101):** a Save with zero edits used to mint a byte-identical version.
   Server 400s on identical content (`comparableContent` + `lib/canonicalJson`, unit- + http-pinned);
   client disables Save on a pristine form (`useFormModified`).
6. **Review follow-ups (07-18):** CodeRabbit `canonicalJson(undefined)` guard; GPT-flagged guide drift
   (lesson-page download wording in the in-app guide + `USER_GUIDE.md`, + stale branding); **a11y:**
   `Modal` focus trap (Tab cycles in-panel) + `FavoriteToggle` surfaces failed toggles (`role=alert`).

**Deliberately NOT changed:** the forgot-password "uniform success" is intentional anti-enumeration
(Payload returns 200 for unknown emails); the reviewer's 5xx-error fix would reintroduce an oracle —
left for a server-side going-public decision. Deferred: a component test of the real form serialization
(`reduceFieldsToValues`) for the no-op boundary; the guide is otherwise current.

**Email — MIGRATED to the domain sender (operator, DONE on the Rock 2026-07-18; CONFIG ONLY, not in
this repo).** Outgoing mail now sends from `notifications@kenyalessons.org` (DreamHost SMTP), not
`clinicvim@gmail.com`. Verified on a live password-reset email: **SPF/DKIM/DMARC all PASS**, inbox
delivery, correct From, and (after fixing a `.env` that was missing `ADMIN_URL` — which had made reset
links render RELATIVE/dead) the reset link is now absolute. The leaked Gmail App Password was revoked;
the Gmail block is commented out in `.env`. Full runbook + the `ADMIN_URL` gotcha: **`docs/OPS.md` →
Email (SMTP + deliverability)**. ⚠️ Going-public note: `ADMIN_URL` is still the **Tailscale** URL
(`rock5b.tail49b05.ts.net`), so email links only open on the tailnet — it (or `SERVER_URL`) must become
the PUBLIC URL before real off-network users.

**DEPLOY (app code) — DONE (2026-07-18):** `main` deployed to the Rock via `scripts/deploy.sh` (last
code `7ed7b19`; HEAD `91194a5` is docs-only on top) — **NO migration** (all app-level). Separate from
the email `.env` change above, which was already live.
**Eyeball on the live Rock:** password eye on the three auth forms; lesson page has NO doc rows (downloads
under Share → Download one document / Download all); Manage "Add" buttons legible enabled+disabled;
editor Hide/Show details; in the editor, Save is disabled until you actually change something.

**Likely next-session work (pick with the user):** Phase 5 Track B / going-public operator setup
(`docs/OPS.md`) is now the natural priority — email is done, so what remains is the public host: TLS +
reverse proxy, `SERVER_URL`/`ADMIN_URL` → public URL, edge rate limiting, GlitchTip. Deferred code work
also stands: the no-op-boundary component test (`reduceFieldsToValues`), plus the older backlog.

---

## ▶ Older resume (2026-07-16, later) — UI audit follow-up: mobile favorite label; `main` `8511228`, DEPLOY PENDING

**A small UI-audit follow-up sits on top of the declutter.** `main` = **`8511228`** (verify
`git log -1`); app-level, **no migration**. Full record: **DECISIONS 2026-07-16 (UI audit)**.
- **Shipped:** the catalogue favorite reveals its label (`☆ Favorite` / `★ Favorited`) at **≤640px
  only**; desktop is unchanged (bare, aligned star). Browser-verified desktop 1280 (alignment spread 0)
  + mobile 390 (44px, labelled, aria-labels intact); no console errors.
- **Deliberately NOT done:** the "cap content width on wide desktop" idea was **rejected** — `.app-main`
  already caps at 960px, so the diagnosis was wrong (DECISIONS has the correction + lesson). Two UI
  items stay on the backlog, unbuilt: mobile **reflow of the wide generated framework tables** (needs a
  prototype + a11y/DOCX-fidelity gate — a design experiment, not a quick fix) and **mobile
  sticky-header height** (action bar + jump nav both pin).
- **DEPLOY:** one `scripts/deploy.sh` for `main` (`8511228`) now covers the declutter **and** this —
  app-level, no migration. Eyeball add: on a phone, catalogue cards show a labelled Favorite control
  (desktop rows stay a bare aligned star).

---

## ▶ Older resume (2026-07-16) — lesson-page + version-editor DECLUTTER; ON `main`, CI green, DEPLOY PENDING

**A UI declutter session (all app-level, no migration), scope agreed via an approved HTML mockup
first.** Shipped **direct to `main` = `81c38e1`** (one commit; verify with `git log -1`), CI-watched
to green (run passed `test:int` + `test:http`, not just the local unit run). Full reasoning:
**DECISIONS 2026-07-15 (declutter redesign)**. Browser-verified on a host dev stack across all four
render branches (editor + teacher lesson pages; version editor view⇄edit; catalogue) with no console
errors; `test:unit` 176/176, typecheck + lint clean. Direct-to-main was appropriate here per the
workflow note below: low-risk, browser-verified UI, no correctness/security surface.

**What shipped (18 files):**
1. **Version editor (`LessonControls` + `custom.scss`):** collapsed to ONE header row —
   `[← Back to lesson]  Viewing:/Editing: <title>  [Official chip] │ [Edit]⇄[Save · Cancel] · [Preview]`.
   Removed the Download button + docx/PDF checkboxes (they exported the SAVED version = identical to
   the lesson page's downloads; only Preview needs the live form). Bold **Viewing:/Editing:** prefix
   replaced the view-mode notice AND Payload's native H1 (hidden for this collection). "Discard Edits"
   → "Cancel". Role-lock read-only chips now key on a new `.lesson-controls-wrap--editing` modifier
   (was the now-removed notice's absence). Collection description shortened to one line.
2. **Lesson page (`page.tsx` + new `ShareMenu.tsx`, `styles.css`):** merged meta line
   (`subject · grade · Version x · Official` + editor-only chip/Compare); one-line
   `Lesson plan [PDF][Word]` + "Supporting documents" disclosure (DocStrip condensed — revises the
   2026-07-13 "detail page keeps full strip" call); new **Share ▾** menu absorbing Download-all zips +
   Email + Message a colleague (deleted `DownloadButtons.tsx` + `EmailDocButton.tsx`). Quieter jump nav.
3. **Catalogue (`styles.css`):** C1 spacing only (row padding, strand gap). Icon-button variant was
   mocked and declined.
4. **`/simplify` (4-agent) follow-ups (same commit):** the email compose form extracted from ShareMenu
   into its own composed **`EmailModal.tsx`**; the `.toolbar-sep` empty-span divider became a
   `border-left` on `.share-wrap`; a stale `DocStrip` docstring fixed. **Deferred (out of diff scope,
   flagged as a background task):** extract a shared `useDisclosure` hook — ShareMenu/UserMenu/
   VersionsChip hand-roll the same outside-click disclosure, and `.share-menu`/`.user-menu__dropdown`
   share a panel shell worth a `.menu-panel` base.
5. Guide page + `USER_GUIDE.md` wording; `lessonControlsSsr.spec.tsx` re-pinned; `payload-types.ts`
   regenerated from the shortened description; `app/.gitignore` ignores the runtime `.artifact-cache/`.

**OPERATOR NEXT — DEPLOY `main` (`81c38e1`) to the Rock.** Usual `scripts/deploy.sh`, **no migration**
(UI markup/CSS + a description string only; `generate:types` unaffected — no schema change). This is
still stacked on top of the 2026-07-14 branding deploy below if that hasn't shipped yet.

**EYEBALL (post-deploy):** lesson page — one meta line, one-line Lesson plan + "Supporting documents"
disclosure, `[Edit]│[Share ▾]` with the Share menu's 4 items + footnote, Email opens the modal; version
editor — one header row, Viewing⇄Editing swap on Edit, Save/Cancel, no Download/checkboxes; catalogue
spacing. To re-eyeball locally see [[local-dev-node22]] (host tooling needs `node@22` on PATH; the
local compose stack + its seed volume were torn down at session end).

---

## (2026-07-14, evening) — branding + UI polish session; ALL on `main`, CI green, DEPLOY PENDING

**A UI/branding polish session, all app-level, NO migration.** `main` = **`83f0c4e`** (verify with
`git log -1`). Four commits, each browser-verified on the local compose stack AND CI-green:
`b5dfd3f` (rename + login link + edit-controls) → `a3373f3` (guide) → `f1fef03` (row redesign) →
`83f0c4e` (/simplify cleanup). Full reasoning: **DECISIONS 2026-07-14 (branding + row redesign)**.

**Workflow note — committed DIRECT TO MAIN this session, at the user's explicit choice.** We discussed
it: the repo is PUBLIC (so GitHub Actions minutes AND CodeRabbit's open-source tier are both free and
unlimited), the CI `gate` fires on `push:` to main as well as on PRs, and for a solo owner shipping
low-risk, already-browser-verified UI changes the only thing the PR flow adds is "CI runs *before*
main moves" + CodeRabbit review. The user accepted that trade for this session. Each push was
CI-watched to green. (Default back to the PR flow for anything with real correctness/security surface.)

**What shipped:**
1. **Rename "Kenya Lesson Plans" → "ARES Lesson Plans"** across every UI + email string (reverses
   #100; `EMAIL_FROM_NAME` env still overrides the sender). Docs (`DECISIONS.md`/this file) left as
   historical record on purpose.
2. **Login splash** — the visible "Sign in" subtitle became "By **ARES Education**" linking
   areseducation.org (new tab). Tab-title "Sign in — …" left alone.
3. **Version-editor control bar moved RIGHT→LEFT** (`custom.scss`, scoped to
   `.collection-edit--lesson-bundle-versions`). Payload injects `beforeDocumentControls` into the
   right-aligned `.doc-controls__controls`; the empty-but-`flex-grow:1` `.doc-controls__content`
   pushed it right, so `flex-grow:0` collapses it and the bar hugs the left, over the main fields.
   Also `.doc-controls__wrapper{height:auto;align-items:flex-start}` — the fixed single-row height
   was clipping/overlapping the taller bar onto the Title field.
4. **Guide accuracy pass** — corrected the stale "editor sees only editable fields" (D3 shows ALL
   fields, non-editable ones marked read-only) + added Preview + an auto-sign-out note.
5. **Library catalogue ROW REDESIGN (Option B, user-chosen).** (a) the lesson name now reads as a
   LINK AT REST (accent colour) — the old neutral-until-hover styling hid that it was clickable; (b)
   the primary Lesson plan PDF/Word moved inline onto the title line → the common row is one line
   (`num · name · N lessons · ★ · PDF · Word`); secondary docs stay folded under "Supporting
   documents". `DocStrip`'s `condensed` mode now renders ONLY that disclosure.
6. **/simplify cleanup** — single-sourced the primary/secondary deliverable split into a new
   dependency-free **`generator/deliverables.ts`** (`PRIMARY_DELIVERABLE` + `secondaryDeliverables`),
   imported by both `SubstrandRow` and `DocStrip`. LESSON: `exportArtifacts.ts` is SERVER-ONLY
   (`node:module`, `jszip`, artifactCache) — client components may only `import type` from it; a
   runtime value import leaks server deps into the client bundle. The new module type-imports
   `DeliverableTag` (erased) so it stays client-safe. Verified by the production build, not just tsc.

**OPERATOR NEXT — DEPLOY `main` (`83f0c4e`) to the Rock.** Usual `scripts/deploy.sh`, **no migration**
(UI strings + CSS/markup only; `generate:types` unaffected — no schema change).

**EYEBALL (post-deploy):** login reads "ARES Lesson Plans" + "By ARES Education" link works; header /
admin brand / a reset-or-welcome email say "ARES Lesson Plans"; a version editor's control bar sits
on the LEFT above the fields (view AND edit modes); the Guide's editor + auto-sign-out wording; and the
catalogue rows — blue clickable names, one-line rows with inline PDF/Word, "Supporting documents"
disclosure, all correct on phone width too.

**Local-dev-only note (NOT the Rock):** to verify the editor layout this session I reset the LOCAL
`admin@example.com` password, then re-randomised it — that local account now has no known password
(reseed or reset if you need local admin). Nothing on the Rock touched.

**QUEUE after deploy (unchanged):** Phase 5 Track B / going-public operator setup (docs/OPS.md) is the
recommended substantive priority; deferred code work + the two future Codex items (#7/#8) still stand.

---

## ▶ Older resume (2026-07-14, later) — Codex mobile/a11y batch (#99) + "Kenya Lesson Plans" rename (#100) MERGED & DEPLOYED

**Two PRs shipped and the operator has DEPLOYED `main` to the Rock (2026-07-14).** `main` = `dc2613f`;
**app-level only, NO migration** (UI strings + CSS/markup). Both were browser-verified on the local
compose stack before merge; CI (gate + CodeRabbit) green on both.

- **#99 — Codex mobile/a11y findings #1–#6** (390×844 pass). Full record + two reusable lessons:
  **DECISIONS 2026-07-13 (Codex mobile/a11y round)**. Fixes: ① version-editor sticky toolbar no longer
  overlaps the Title on a phone (`.doc-controls` drops sticky <640px) + title un-truncates; ② auth
  errors/success get `role=alert`/`role=status` (login/signup/forgot/reset); ③ right-edge fade
  affordance on the overflowing mobile action + jump-nav rows; ④ reworded the "immutable snapshots"
  description + an Official / Not-Official chip in the editor; ⑤ 44px touch targets on auth/message
  links (frontend) AND the Manage buttons incl. the **Site-Admin `DeletePlansPanel`** (admin uses
  explicit `44px`, not `rem` — admin root font is 15px); ⑥ Editors "Remove" → `buttonStyle="error"`.
  **Codex #7 (mobile reading mode) + #8 (catalogue scale prep) were triaged as FUTURE** — on the
  backlog, not built. Lessons: `.doc-header__title` is a DocumentHeader SIBLING (needs `body:has()`,
  not a descendant rule); role-gated surfaces must be verified under the role that renders them.
- **#100 — app renamed "Lesson Plan Repository" → "Kenya Lesson Plans"** across all user-facing
  strings (17 UI spots + 8 email spots — the email brand "ARES Lesson Library" was aligned too, per
  user decision; `EMAIL_FROM_NAME` still overrides the sender). No DECISIONS entry (self-documenting
  rename). Note: the email TEMPLATES now say Kenya Lesson Plans, but the operator's deployed
  `EMAIL_FROM_NAME` env (if set) still wins for the sender line — confirm it during the eyeball.

**OPERATOR EYEBALL (post-deploy, on the live Rock — phone width for the a11y items):** login page +
header read "Kenya Lesson Plans"; trigger a login error (screen reader announces it / `role=alert`
present); a lesson page's sticky toolbar scrolls sideways with a visible right-edge fade; open a
non-Official version in the editor → "Not Official" chip (and an Official one → "Official version");
as Site Admin, the Manage "Delete lesson plans" panel controls feel tappable (~44px); a
password-reset / welcome email reads "Kenya Lesson Plans" (and check the sender name matches your
intent given `EMAIL_FROM_NAME`).

**QUEUE after deploy (pick with the user):** unchanged from the block below — Phase 5 Track B /
going-public operator setup (docs/OPS.md) remains the recommended substantive priority; deferred
code work (messagePing `FOR UPDATE`, local int-test harness + HTML-cache drift test, Manage/roster
pagination at scale, the favorites best-effort savepoint redesign) and the two future Codex items
(#7 mobile reading mode, #8 catalogue scale prep) all stand.

---

## ▶ Older resume (2026-07-14) — DESIGN TRACK + FOLLOW-UPS MERGED; operator deployed once, redeploying `main` HEAD for #96

**The six-PR design track AND its follow-ups are all merged** — D1 #85, D2 #86, D3 #87, D4 #88,
D5 #89, D6 #90 (WCAG AA); review triage #91; `/simplify` pass #92; edit-page floating jump nav +
"Supporting documents" #93; Codex UI/escaping follow-ups #94; Codex review batch #95 (UI/docs) +
#96 (backend: favorites-transaction honesty + upload wire tests); handoff deploy-record #97 (this
block). Build notes: DECISIONS 2026-07-12 (D1–D6) + 2026-07-13 (design-track review + /simplify
follow-ups, #91/#92/#94) + 2026-07-13 (edit-page jump nav) + 2026-07-13 (Codex review batch, #95/#96).
Every PR was browser-verified on the LOCAL compose stack before merge; the http suite (incl. the new
upload tests) runs on CI.

**DEPLOY STATE (2026-07-14):** the operator deployed the Rock once — that deploy carried everything
through **#95** and applied the week's one migration, `20260710_041621_add_email_verification`
(deploy.sh snapshots first). The operator is **redeploying to pick up #96** — **app-level, NO new
migration**. **Redeploy target: `main` HEAD** (currently `7f7568c`, the #97 doc merge; the last
*code* change is `9a21e67`/#96 and everything since is docs-only, so any commit from `9a21e67`
onward is the same runtime). ⚠️ *Fill in on next session: confirm the email-verification migration
applied cleanly on the first deploy, and record any eyeball findings — those are operator-only facts
not yet captured here.*

**OPERATOR EYEBALL (post-redeploy):** the 2026-07-11 block's email-verification items below, PLUS
the design track:
   lesson page sticky toolbar + numbered lesson jumps (desktop AND phone); preview-tab jump nav;
   sticky Guide TOC; branded admin header + blue Save on Manage/version editor; editor toolbar
   Edit⇄Save/Discard swap + "read-only" chips in edit mode; catalogue rows' **"Supporting
   documents"** disclosure + aligned stars; collapsed Messages compose (+ auto-open from "Message a
   colleague"); title-cased message links/preview heading; login page branding; **the version
   editor's floating in-form jump nav (Top · Lessons · FE · ST) + "Edit" from a lesson opening on
   that same lesson (`?lesson=N`).**

**QUEUE after deploy (pick with the user):** Phase 5 Track B / going-public operator setup
(docs/OPS.md) remains the recommended substantive priority. Deferred code work unchanged:
messagePing `FOR UPDATE`, local int-test harness + HTML-cache-version drift test, Manage/roster
pagination at scale. AI summaries stay deliberately unprioritized. **One Codex P2 deferred as a
deliberate redesign, not a quick fix:** `retargetFollowerFavorites` best-effort favorites can't be
truly per-row inside one Postgres transaction (a constraint error poisons it); this session made it
fail honestly instead of false-succeeding, but a savepoint-per-row or post-commit-retarget redesign
to restore true best-effort is a separate task.

---

## ▶ Older resume (2026-07-11) — finish async-export feedback branch; then deploy + verify the email migration

**Live Git state when this handoff was written:** `main` / `origin/main` = `69dcec9` (PR #82,
email verification, MERGED); current pushed branch `codex/export-ux-resilience` = `f9a67a9`, one
commit ahead. The older 2026-07-10 block below is superseded: the email-verification PR/CI/merge are
DONE. What is NOT established by the repository is whether its migration has been deployed on the
Rock.

**Current branch:** hardens the shared async export client. Network failures now reach visible UI
error state; non-OK status polls fail immediately with the server message; and the default client
wait grows from ~90s to ~150s so it cannot time out before Gotenberg's allowed 120s conversion.
`tests/unit/exportClient.spec.ts` covers cold prepare-to-ready, a status HTTP failure, and a failed
final ZIP fetch. Full reasoning: newest DECISIONS entry, "async export feedback".

**Branch review/gates:** manual review found no blocking issue. Local gates are green: lint 0 errors
(70 pre-existing warnings), typecheck clean, unit 159/159. CodeRabbit 0.6.4 is installed but signed
out, so its review is not a green gate. Commit this handoff/decision update on
`codex/export-ux-resilience`; push/open PR/merge only under the normal explicit-user workflow.

**Operator next after merge:** deploy current `main` with `scripts/deploy.sh` (schema change: applies
`20260710_041621_add_email_verification`, snapshot first), then browser-check: existing-user login;
new signup/check-email/unverified-login/verify-link/login; password reset; and one cold export plus
an observable export failure. Record the actual Rock SHA and migration/eyeball outcome here.

**Then pick the next track with the user:** Phase 5 Track B / going-public operator setup is the
recommended substantive priority now that registration is open. Deferred code work remains:
messagePing `FOR UPDATE` concurrency, a local integration-test harness + HTML-cache-version drift
test, and Manage/roster pagination only when scale justifies it. AI summaries remain deliberately
unprioritized.

---

## ▶ RESUME HERE (2026-07-10) — email verification + Codex round done; #79–#81 ARE DEPLOYED; PR → CI → merge → deploy the migration

**The #79–#81 Rock deploy is DONE (user, 2026-07-10).** The email-verification build below then
took a Codex review round — three accepted findings, all fixed pre-PR (full record: DECISIONS
2026-07-10 "email-verification Codex round"): ① email changes are now SITE-ADMIN-ONLY (self-service
change would bypass verification — SPEC §8 amended); ② the verify endpoint is throttled via a
custom endpoint that SHADOWS Payload's native `POST /verify/:id` (new `verifyEmailGlobal` bucket,
300/day; the http 429 test IS the shadowing proof) and the token column is indexed (migration
regenerated offline, same name — now columns + index + backfill); ③ the backfill has an executable
regression test (`tests/int/verifyBackfill.int.spec.ts` runs the real `up()` against the live
schema). Gates: typecheck ✓, unit 156/156 ✓, new files lint-clean, payload-types re-verified
byte-identical. **Next: PR → CI green → merge → Rock deploy** (the deploy applies
`20260710_041621_add_email_verification`; deploy.sh snapshots first). Then the verification
eyeball items below.

## ▶ Older resume (2026-07-09 night) — EMAIL VERIFICATION built (uncommitted; branch/PR next); then deploy #79–#81 + it

**Email verification on signup is BUILT this session** (the queue pick; full record: DECISIONS
2026-07-09 "email verification"). Payload-native `auth.verify`; frontend `/verify-email` page +
check-your-email signup flow + a distinct unverified-login message; `_verified` field access
tightened (create/update Site-Admin-only — Payload's default is ANY authenticated user; wire- and
wiring-pinned); **the week's FIRST migration** `20260710_041621_add_email_verification`, whose
`_verified = true` backfill is LOAD-BEARING (the JWT strategy rejects falsy `_verified` — a plain
column-add would lock out every existing account). **Procedure discovery: migrations AND types
generate OFFLINE on this Mac** (`disableDBConnect` + `payload.db.createMigration` /
`generateTypes`; the payload-types hand-edit verified BYTE-IDENTICAL locally — no Rock step).
Local gates green (typecheck, unit 153/153, lint clean on changed files); int/http are CI's (no
Docker locally — CI's stack-up RUNS the new migration before the http suite, which covers the
verify flow end-to-end). **State: UNCOMMITTED on `main`'s working tree (no-commit rule). Next:
commit on `feat/email-verification`, PR, CI gates, merge.** Deploy carries a migration —
`scripts/deploy.sh` snapshots first, as always. **Eyeball adds:** sign up → check-your-email note
→ emailed link → verified page → sign in works; BEFORE verifying, sign-in says "isn't verified
yet" (not "invalid password"); an existing account still signs in (backfill).

**Prior state (2026-07-09 end of day): everything below is merged; `main` clean at PR #81's merge.
Session arc (all CI-gated, ZERO migrations before the verification one above):**
- **Teacher-first T1–T4** (#72–#76, 2026-07-08) and the **version-browser redesign ①–③**
  (#68 / #77 / **#78**, completed 2026-07-09) — see the Older-resume block below for detail.
- **#79 — catalogue browsing went CLIENT-side** (user-reported ~1s filter clicks on the live Rock;
  DECISIONS 2026-07-09 "catalogue perf"). Chips + search are now in-memory re-renders;
  `?q/&subject/&grade` still shareable via history.replaceState/popstate. SearchBox deleted with
  its spec (its bug class was structural to router-navigation search).
- **#80 — OPEN self-registration + native password reset** (user decisions: open, not invite;
  standard Payload; DECISIONS 2026-07-09 "open registration"). Login page gained Sign up / Forgot
  password; `/signup`, `/forgot-password`, `/reset-password` pages; reset email now links the
  FRONTEND page. Security find shipped with it: `roles`/`assignments` had no create-axis field
  gate — now gated + wire-pinned (hostile signup strips to plain Teacher). Signup caps 3/day/email
  + 100/day global. A /simplify pass was applied (signup folded into the auth-throttle dispatch;
  `usersCollectionCreate` named in access/index.ts; skips recorded).
- **#81 — four review findings on the #77–#80 arc** (DECISIONS 2026-07-09 "browse/panel review
  findings"): panel stars re-fetch on every open; search includes pinned favorites; NaN `?grade=`
  = no filter; popstate clears the pending URL debounce. All pinned (unit + component tests).

**OPERATOR NEXT:**
1. **Rock deploy** — pending: **#79 + #80 + #81** (the user's 2026-07-09 morning deploy carried
   everything through #78). Usual `scripts/deploy.sh`, no migration — UNLESS the email-verification
   PR (above) has merged by then, in which case the deploy also applies its migration (deploy.sh
   snapshots first).
2. **In-browser eyeball** (accumulated list): filter chips + search respond INSTANTLY; sign up a
   fresh account → lands as plain Teacher (no Manage, no version chips); Forgot password
   end-to-end (email links the app's reset page, not /admin); as editor — versions chip/panel on
   multi-version rows + lesson page, toggle a star in the panel then close/reopen (stays correct),
   pinned favorites appear in My favorites AND in search; plus the still-standing T2/T3/T4 items
   in the Older-resume block if not yet checked.

**QUEUE (pick with the user):**
- ~~**Email verification on signup**~~ **BUILT 2026-07-09 night — see the newest RESUME block**
  (and the migration generated LOCALLY, not on the Rock — the recorded procedure improved).
- **Phase 5 Track B** (host-gated: VPS → TLS/proxy → edge rate limiting → GlitchTip → Going-public
  runbook, docs/OPS.md) — now more relevant with open registration.
- Deferred backlog: Manage/roster pagination at corpus scale; payload-jobs prune;
  `test:int:local` harness + HTML-cache-version drift test (Codex 2026-07-06 chips); messagePing
  FOR-UPDATE double-fire; Next 16 `middleware`→`proxy` (ride the next framework bump).
- **AI summaries** stay deliberately unprioritized (purpose conversation first — 2026-07-02).

---

## ▶ Older resume (2026-07-08) — TEACHER-FIRST TRACK is the active arc (design locked; REORDERS ahead of VersionsPanel PR ②/③)

**The user re-prioritized: ~95% of users are Teachers; the teacher experience comes first.** Full
design lock: **DECISIONS 2026-07-08 (teacher-first track)** — read it before touching this arc. The
VersionsPanel PR ②/③ build is POSTPONED (and amended: versions UI becomes Editor+-only) until after
this track.

**Build order (each its own CI-gated PR):**
- ~~**T1 — backend: per-deliverable export + pre-warm**~~ **DONE — PR #72 merged (`0984a37`),
  CI green, 2026-07-08.** `GET /:id/export/doc?doc=<tag>&as=docx|pdf` serves ONE deliverable from
  the artifact cache (PDF inline → opens in browser; DOCX attachment); pre-warm ships as a
  lesson-plans `afterChange` hook on every AUTHENTICATED Official-pointer move (make-official +
  admin repair form) + one explicit ingest call (see the DECISIONS 2026-07-08 item-3 refinement).
  Wire tests per the standing agreement; a /simplify pass was applied post-build. **No migration;
  Rock deploy pending** (fold into the next deploy — the new endpoint is inert until T2's UI).
- ~~**T2 — teacher-first catalogue**~~ **DONE — PR #74 merged (`a97179e`), CI green, 2026-07-08.**
  Per-document strip on rows + lesson page (PDF opens in a new tab, Word downloads), URL-driven
  subject/grade filter chips, versions UI editor-gated, mobile cards, zip demoted, guide copy.
  Build notes + costs: DECISIONS 2026-07-08 (T2 build notes). **No migration. NOT browser-verified
  (no Docker on the build Mac) — the user's in-browser eyeball after the next Rock deploy is the
  outstanding check** (strip both surfaces, PDF new-tab, Word download, chips, mobile cards,
  teacher sees no pills).
- ~~**T3 — "Request editing privileges"**~~ **DONE — PR #75 merged (`1872824`), CI green,
  2026-07-08** (two CI rounds on test-scoping/laziness bugs, feature untouched — DECISIONS T3
  build notes). Server-resolved recipients; messages created as the caller; 1/day/sg throttle;
  wire tests. **No migration; not yet deployed.**
- ~~**T4 — teacher stars track Official**~~ **DONE — PR #76 merged (`f026fcd`), CI green,
  2026-07-08.** Re-point hook on the Official-pointer move; editors keep per-version pinning;
  follower stars survive promote-and-delete-previous; no migration (DECISIONS T4 build notes).
- ~~**THEN (next build)**: VersionsPanel PR ② + ③~~ **DONE 2026-07-09 — PR ② merged as #77;
  PR ③ merged same day (chip+panel on the lesson page, Compare its own button, pills retired).
  The 2026-07-06 version-browser redesign is COMPLETE (①=#68, ②=#77, ③=#78).** Build notes +
  argued deviations: DECISIONS 2026-07-09 (redesign PR ② build notes). Editor+-only throughout;
  no migrations. **Not yet deployed — fold into the next Rock deploy + eyeball** (chip on
  multi-version rows as editor, panel lines/stars, pinned favorites surfacing, lesson-page
  version line, none of it visible as teacher).

~~**BACKLOG (user, 2026-07-08): login page needs "Sign up" + "Forgot password?".**~~ **BUILT
2026-07-09 (open registration per user decision — see the PR + DECISIONS "open registration");
the remaining hardening follow-up is email VERIFICATION (`auth.verify` = a `_verified`
Rock-generated migration).** Original note: Use STANDARD
Payload machinery: `forgot-password`/`reset-password` are native auth operations (REST
`POST /api/users/forgot-password` + `/reset-password`; auth rate limiting from #42 ALREADY covers
forgot-password) — the work is frontend pages + the reset-email template + a sign-up policy
decision (open registration vs invite; new users default to Teacher per SPEC §8 — first-user
bootstrap guard #53 already handles the empty-DB case). Not scheduled yet; next build below.

**THE TEACHER-FIRST TRACK (T1–T4) IS COMPLETE — all four PRs merged 2026-07-08, ZERO migrations.**
**Operator next *(SUPERSEDED — the 2026-07-09 morning deploy carried T3/T4/#77/#78; see the
newest RESUME block for what is pending now)*: ① Rock deploy** — usual
`scripts/deploy.sh`, no migration; **② the in-browser eyeball**: T2
(strip both surfaces, PDF new-tab, Word download, chips, mobile cards, no pills as teacher) +
T3 (Request editing access button → admin inboxes) + T4 (teacher star follows a Make Official).

**Also verified 2026-07-08 (no code change):** Make Official gating already matches the user's intent
at all three layers (button + endpoint enforce `isSubjectAdminFor`, i.e. Site Admin any / Subject
Admin scoped; Editors 403 server-side).

---

## ▶ Older resume (2026-07-07 later) — dup-Edit button FIXED; version-picker window is the next BUILD

**User did an in-browser eyeball of the LIVE Rock (2026-07-07) and flagged two things as missing.**
Investigation (code + history; full write-up: DECISIONS 2026-07-07 (eyeball: dup-Edit + version window)):
neither was a lost deploy. **Item 1 is now FIXED this session; item 2 (the version-picker window) is the
next deliberate BUILD.**

1. **Duplicate top-right "Edit" button on the version editor — FIXED, DEPLOYED, and USER-CONFIRMED
   IN-BROWSER (2026-07-07). DONE.** Merged as **PR #71** (`e87d522`), deployed to the Rock via
   `scripts/deploy.sh`, and the user confirmed the button is gone. Root cause (confirmed three ways —
   compiled-CSS grep on the live Rock, Payload view-tree source, and a live DOM inspect): the hide-rule
   was scoped as a DESCENDANT of `.collection-edit--lesson-bundle-versions`, but Payload renders the
   `.doc-tab` "Edit" tab in `DocumentHeader`, a *preceding sibling* of the edit `View` (see
   `@payloadcms/next` `views/Document/index.js` ~L355) — never a descendant, so the combinator could
   never match. Both prior attempts (`[title='Edit']`, then #67's `[aria-label='Edit']`) failed for THIS
   reason, not the attribute — `<Button>` sets `title` AND `aria-label` to the same "Edit" label, so the
   swap was a no-op. **Fix: re-pointed the rule via the `body:has(.collection-edit--lesson-bundle-versions)
   .doc-tab[aria-label='Edit']` ancestor pattern** (the same one the chrome-strip block uses, proven to
   fire on this view).
2. **The version-picker WINDOW does not exist yet — it was designed, not built. THIS IS THE NEXT BUILD.**
   The 3-PR version-browser redesign (design locked DECISIONS 2026-07-06) is: ① per-version favorites → ②
   `VersionsPanel` + `[N versions ▾]` chip → ③ swap the lesson-page pill bar for the chip+panel. **Only
   PR ① (#68, backend schema) merged.** There is NO `VersionsPanel` component in the tree; PR ②/③ were
   never coded. What ships today is the older inline **pill bar** on the lesson DETAIL page
   (`lessons/[id]/page.tsx` ~L113, only when 2+ versions) — e.g. Biology G10 "Chemicals of life"
   1.0.0 / 1.0.2 appear as pills there, not a popup. **BUILD NEXT: PR ② then PR ③ per the locked design.**

**THEN** the operator items + redesign-continuation context below still stand.

---

## ▶ RESUME HERE (2026-07-07) — review-finding batch merged (#69/#70); then resume the redesign (PR ② below)

**STATE:** a three-item review pass landed via two stacked CI-gated PRs, both merged to `main`
(**#69** `525ac42`, **#70** `3fdb1b6`; verify HEAD with `git log -1`). **App-level only — NO
migration.** Rock deploy is the usual `scripts/deploy.sh` (pull → pre-migration snapshot → compose up)
when convenient.
Full reasoning + a reversal-of-decision note: **DECISIONS 2026-07-07 (review-finding batch)**.
- **#69** — [P2] save-as-new stale-source guard tightened to EXACT equality (`baseMs !== srcMs`),
  closing a forged-future-`updatedAt` bypass (+ wire test). **This REVERSES the 2026-07-06 Codex #2
  "declined" decision** — see the annotated bullet there; the serialization worry was disproven
  (CI-confirmed). Plus [P3] compose `?version=` is now validated (readable + belongs to plan) before
  prefill, mirroring `validateContextLink`.
- **#70** — `/simplify` perf follow-up: compose-context resolution overlaps the inbox/roster batch
  (three serial waves → one); behaviour unchanged.
- **DEFERRED [P3]:** the messagePing zero-unread gate can double-fire under concurrent first-unread
  creates (bounded by the daily ping cap) — stays on the backlog; a fix needs a FOR-UPDATE lock.

**OUTSTANDING (operator):**
1. ~~**Deploy** current `main` to the Rock~~ **DONE 2026-07-07** — the #71 deploy pulled all of `main`,
   so #69/#70 are now live on the Rock too (`e87d522`, no migration).
2. ~~**Rotate the GitHub PAT** used from this Mac on 2026-07-07~~ **DONE 2026-07-08** — the user
   revoked the chat-pasted PAT. A subsequent push from this Mac still succeeded on the
   credential-helper (osxkeychain) token, proving the cached token is a DIFFERENT credential than
   the revoked one — it was never chat-pasted, so no further rotation is needed. (If a chat-visible
   token is ever needed again: fine-grained, Lesson3-only, Contents R/W + Pull requests R/W.)

**THEN: the version-browser redesign resumes — build PR ② (`VersionsPanel` + catalogue chip),** per
the block just below (PR ① / #68 is already merged + deployed).

---

## ▶ Older resume (2026-07-06 late) — redesign PR ① (per-version favorites) — now MERGED as #68; then build PR ②

**STATE:** the version-browser redesign is underway. **PR ① — favorites → per-version — is MERGED as
#68** (`feat/favorites-per-version`). Full build notes + Codex triage:
DECISIONS 2026-07-06 (redesign PR ① built). Once #68 merges: **the deploy has ONE migration**
(`favorites_per_version` — maps favorites to Official versions, ABORTS loudly if any can't map; a
live preflight already showed 0 unmappable rows) — `deploy.sh` snapshots first as usual, no new env.

**THEN build PR ② — `VersionsPanel` + catalogue `[N versions ▾]` chip** (full design in the entry
below + DECISIONS): reusable floating panel, lazy-loads on open (`Version · Author · Created · ★`
per line, author NAME only), ordering **Official-pinned then newest→oldest** (shared sort helper —
today's `findReadableVersions` sorts ascending), chip only when 2+ versions (needs a per-plan version
count next to the catalogue's Official-only fetch), the row star becomes a non-toggle any-version
indicator, per-version toggles live in the panel, "My favorites" becomes a list of versions. **PR ②
also closes PR ①'s documented interim gap** (a favorite on a non-Official version doesn't surface on
the home page yet). Then **PR ③**: lesson-page pill bar → chip+panel, Compare → its own button,
"currently viewing" highlight.

**Follow-up chips flagged (Codex 2026-07-06 triage):** a `test:int:local` one-command harness (recipe
in DECISIONS — note the `NODE_ENV=development` builder-image gotcha) and an HTML-cache-version drift
test. Codex #5 (`.env.example` sync + payload-jobs prune) stays on the deferred backlog.

---

## ▶ Older resume (2026-07-06) — the version-browser DESIGN, as locked (PR ① above implements step ①)

Read **DECISIONS 2026-07-06 (version browser design)** for the complete spec + reasoning; build in the
three-PR order it gives. One-line summary: versions surface through a **reusable floating `VersionsPanel`**
opened by a **`[N versions ▾]` chip** (catalogue row, only when 2+ versions; and on the lesson page,
REPLACING the pill bar). **Favorites become PER-VERSION** (schema change + migration — PR ① of three,
also amends SPEC §10). Every version list orders **Official-pinned then newest→oldest**; the star toggles
inside the panel; Compare relocates to its own lesson-page button (not in the panel). Build order:
① favorites→per-version → ② VersionsPanel + catalogue chip → ③ lesson-page pill→chip swap.

**Everything below the design task is DONE this session — PRs #57–#67, all CI-gated, merged, and
deployed; the Rock is on main `6933380` (verify with `git log -1`), no migrations all session.** After
the #57–#62 arc (see the next section) came a review/audit cleanup run:
- **#63** — /simplify over the #57–#62 arc: `META_IDENTITY_KEYS` single-sourced + a fails-unsafe drift
  guard, per-pair compare-diff cache (`htmlDiffCache.ts`), `findReadableVersions` extraction.
- **#64** — projection-accurate return type for `findReadableVersions` (a `select` cast to the full
  interface lied about unfetched fields). CI needed an empty-commit retrigger — GitHub never fired the
  `pull_request` event.
- **#65** — audit safe wins: `semver` now system-owned on create+update (was create-open → forgeable
  "banana"/"999.0.0") + strict x.y.z validate; two `limit:1000` fan-outs paginated (SubjectGrade delete
  guard was fails-unsafe); `JOBS_AUTORUN_LIMIT`/`GOTENBERG_TIMEOUT_MS` → `positiveIntEnv`.
- **#66** — concurrent first-ingest of one sub-strand can no longer duplicate plans: `lockSubjectGrades`
  (SELECT … FOR UPDATE, PR #50 pattern) + in-transaction re-resolve.
- **#67** — duplicate Edit tab on the version editor: the hide rule targeted `[title='Edit']` but Payload
  renders `aria-label` (dead selector). Swept all custom.scss Payload-internal selectors vs installed
  markup — this was the only broken one.
Full reasoning: DECISIONS 2026-07-06 (audit batch). The in-browser eyeball pass is ongoing (it drove
#57–#67); the version-browser redesign is the next deliberate build.

---

## ▶ Older resume (2026-07-05 night) — eyeball-pass fixes + version compare: PRs #57–#62 ALL merged + deployed

**The user's in-browser eyeball pass started and immediately paid for itself** — it surfaced a
misleading editor affordance, a field-permission redesign, a UI nit, and drove two new features.
All six PRs were CI-gated, merged same-session, and **the Rock is on main `d0078f0`** (one deploy
per merge batch, verified healthy; **no migrations all session** — everything is app-level).
Full reasoning: DECISIONS 2026-07-05 (version compare) + (META identity).

- **#57 + #58** — `sourceVersion` rendered as an editable dropdown over EVERY version (and a direct
  admin create could forge provenance). Now `systemOnly` + `readOnly`, mirroring `author`; int test
  pins the create-path strip, wiring test pins the field-access contract (the update half is
  unreachable behind the immutability hook — pinned as WIRING, deliberately not behaviour; #58 is
  the CodeRabbit follow-up explaining why).
- **#59 META identity is Site-Admin-only** (user decision): `meta.subject`/`grade`/`substrand_id`
  are corruption-REPAIR fields, not curation — subject/grade only label the printed document (the
  `subjectGrade` relationship is the categorization truth) and substrand_id is the re-ingest
  matching key. **SPEC §5 amended.** KEY LESSON (recorded in DECISIONS): field access alone cannot
  enforce version-field rules — save-as-new writes via `overrideAccess` — so enforcement is
  two-layer: `siteAdminOnly` field access (form render + direct writes) AND a Subject-Admin
  carve-out in `applyEditorFieldSplit` (the layer that actually holds). Rest of META stays
  Subject-Admin. Pinned by `metaIdentitySplit.spec.ts` + two wire-level save-as-new cases.
- **#60** — Edit/Make Official buttons missed the export-bar flex gap (wrapper span); now a
  fragment like DownloadButtons.
- **#61** — `meta.subject` input is a dropdown over the live `subjects` taxonomy
  (`SubjectSelectField`; data stays a plain string — generator grammar untouched). Deliberately NO
  server-side validate (would block saves of legacy versions after a taxonomy rename — the split
  restores the stored value into non-Site-Admin saves); a stored value missing from the taxonomy
  renders as a flagged "(not in taxonomy)" option, never blanked.
- **#62 version compare** — `/lessons/{id}/compare`: Payload's compare VIEW is native-versions-only
  and unexported, but its diff ENGINE is public API (`HtmlDiff`,
  `@payloadcms/ui/elements/HTMLDiff/diff`). We diff the two versions' CACHED RENDERED DOCUMENT HTML
  (`renderVersionSectionsCached` — immutable, sanitized) into two panes: removals red left,
  additions green right; pickers navigate via GET; Compare button in the version bar (left of the
  pills, only when >1 version). Engine output contract pinned by `htmlDiffContract.spec.ts` so a
  Payload bump fails fast. Guide sentence added.

**Next:** ① the user's eyeball pass CONTINUES (now including: source-version read-only, META
identity read-only for Subject Admins, subject dropdown for Site Admins, button spacing, Compare) —
findings come back here; ② Phase 5 Track B stays host-gated (next section); ③ deferred backlog
unchanged.

---

## ▶ Older resume (2026-07-05 late) — Phase 5 Track A (host-independent pre-VPS half) MERGED; Track B is host-gated config

**Phase 5 was planned and its host-independent half BUILT this session** (decisions + full detail:
DECISIONS 2026-07-05 (Phase 5)). Standing decisions: **no VPS timeline yet**; error tracker =
**GlitchTip (self-hosted)**; **2h token ratified** for public exposure; Subject-Admin uniqueness =
**grant-path lock** (partial unique index stays deferred; trigger = assignment write paths
multiplying). Shipped via CI-gated PRs, all merged (verify HEAD with `git log -1`):
- **#49 A1** — Gotenberg base pinned by multi-arch index digest (8.34.0/trixie) + font installer
  3.8.1 (Codex #8). Pins fail loudly on upstream movement; re-pin procedure in the Dockerfile.
- **#50 A2** — Subject-Admin grant race closed: `SELECT … FOR UPDATE` on the granted subject-grade
  rows before the demote scan (+ scan pagination, was silently capped at 1000). Codex #3/Bucket A #10.
- **#51 A3** — strict nonce CSP via `src/middleware.ts` (`script-src 'nonce-…' 'strict-dynamic'`,
  documents only, `/api/*` excluded so preview's own CSP survives); admin avatar gravatar→initials
  (CSP + email-hash leak). Browser-verified zero violations on all real routes, both surfaces.
  Accepted caveat: the static 404/error shells load unhydrated (pure text) on direct hits.
- **#52 A4** — env-gated server-side error tracking (`@sentry/node` + instrumentation.ts +
  job-seam capture); inert without `SENTRY_DSN`; no cookies/emails in payloads. OPS.md section added.
- **#53 A5** — `SERVER_URL` is THE public-posture switch: https ⇒ Secure auth cookies (derived);
  set + zero users ⇒ boot REFUSAL (first-register would hand Site Admin to the first visitor —
  proven live; `ALLOW_FIRST_USER_BOOTSTRAP=1` escape hatch). OPS.md **"Going public"** runbook.

**Same-day follow-ups, also all merged + deployed:**
- **#54** — admin-CSP http test title/code mismatch fixed + the genuinely-unauth `/admin` CSP case
  added (review catch; the other review item, htmlSectionsCache coalescing, was ALREADY merged code
  from `0484e85`/#45 — nothing new was adopted).
- **#55** — the version editor's React #418 on `?edit=1` (LessonControls gated initial state on
  `typeof window`; now `useSearchParams()`; SSR regression pin). Built in its own spun-off session.
- **#56** — a SECOND, TZ-dependent #418 that #55 unmasked: `VersionTimestamps` formatted user-local
  on both server (UTC container) and client → mismatch whenever server TZ ≠ browser TZ. Fixed with
  two-pass rendering (deterministic UTC-labelled SSR string → post-hydration local swap via
  `useSyncExternalStore`); `suppressHydrationWarning` was tried and REJECTED by experiment (React 19
  keeps the server text → readers shown UTC times). Browser timezoneId A/B is the proof. Full story
  + lessons: DECISIONS 2026-07-05 (TZ hydration).

**DEPLOYED: the Rock is on main `57f2ef3`** (deploy.sh each merge batch, no migrations, verified
healthy 2026-07-05). The version-editor console is now clean end-to-end.

**Phase 5 remaining = Track B, gated on the host decision:** pick VPS → TLS/reverse proxy → edge
rate limiting at that proxy → deploy GlitchTip + set `SENTRY_DSN` → execute the Going-public
runbook (docs/OPS.md) end-to-end. No code is expected to change for exposure day.

**Still-pending non-code item:** the in-browser eyeball pass (favorites star, messaging/inbox
mark-read POST, email modal, live search, cached lesson pages, login) — unchanged from before.
**Mac-local incidentals** (not on the Rock; irrelevant to other devices): the local compose stack
runs current main and has a throwaway Site Admin (`csp-probe@lesson3.local`) + a minimal
Biology/G10 probe plan — useful as local seed, delete if unwanted. Its local DB carries dev-push
state, so the `migrate` one-shot HANGS on an interactive Payload prompt during `compose up` —
bypass with `docker compose build app && docker compose up -d --no-deps app`.

---

## ▶ Older resume (2026-07-05) — Phases 1–4 + all review/Codex follow-ups MERGED & DEPLOYED; only Phase 5 remains

A full-codebase audit ran 2026-07-04 (no Critical findings) → a five-phase plan; an external Codex
pass ran 2026-07-05 (no Critical). **Read DECISIONS.md 2026-07-04 + 2026-07-05 entries first** — the
audit/plan, the four phases, and the Codex triage all live there. Standing product decisions:
public-VPS exposure trajectory; re-ingest = next-major, **Not Official** (SPEC §7); retention policy
(SPEC §11, prune cron live); tokenExpiration 2h.

**Everything through Phase 4 + all follow-ups is MERGED and DEPLOYED to the Rock (main `8b4236a`,
deployed + verified 2026-07-05).** Shipped this arc via CI-gated PRs #41–#48:
- **#41** CodeRabbit UI follow-ups (Modal/SearchBox/a11y).
- **#42 Phase 1** — auth rate limiting (login + forgot-password), email header strip, preview
  authority pinning, semver projection.
- **#43 Phase 2** — invariant tripwires (extract adversarial suite, prose-whitelist drift test,
  version-immutability colocation + wiring test, taxonomy delete guards, endpoint-test agreement).
- **#44 Phase 3** — lesson-page HTML cache, `scripts/prune-db.sh` + cron, pagination posture.
- **#45** review follow-ups (mobile 44px touch targets, email sanitizer widened, prune has_error fix).
- **#46 Phase 4** — re-ingest as next major, Not Official.
- **#47** Codex safe wins (cache-env fail-fast, stale contract comment, engines pin).
- **#48** Codex #4 — `/messages` read-state moved to a CSRF-safe `POST /api/messages/mark-read`.

**Ops state (Rock):** backups ARE configured, so `scripts/deploy.sh` always takes its pre-migration
snapshot (the `ALLOW_UNBACKED_DEPLOY` fallback is never needed there); the retention prune cron is
installed. Deploys this arc were all no-migration.

**Outstanding non-code item:** the in-browser eyeball pass — favorites star, messaging (incl. the
inbox now that mark-read is a POST: open a message, badge clears on next navigation), email modal,
live search (type then click a lesson fast → you stay on it), cached lesson pages, login. Nice-to-have,
not blocking.

**Next, in order (per the agreed plan — details in DECISIONS 2026-07-04):**
1. ~~**Phase 2 — invariant tripwires**~~ **DONE** (merged; DECISIONS 2026-07-04 (Phase 2)):
   extract.ts adversarial suite + never-executes proof; prose-whitelist drift test + fieldSplit
   authority hardening; version-immutability colocated in `access/versionImmutability.ts` (renamed
   `versionUpdateGrantForFormRenderOnly`) + wiring test; Subject/SubjectGrade delete guards;
   CLAUDE.md endpoint-test working agreement.
2. ~~**Phase 3 — scale prep**~~ **DONE** (merged; DECISIONS 2026-07-04 (Phase 3)): lesson-page HTML
   cache keyed by immutable version id (`generator/htmlSectionsCache.ts`, wired into the lesson page
   + GET preview; UNSAVED preview uncached); `scripts/prune-db.sh` + nightly OPS cron; pagination
   posture assessed = deliberate no-action with documented ~1–2k thresholds. **Deploy note:** new
   `html-sections::v1::…` cache namespace (benign cold start, no migration); the prune cron needs
   adding on the Rock (`crontab -e`, 03:30 — see docs/OPS.md "Retention pruning").
3. ~~**Phase 4 — re-ingest as next major**~~ **DONE** (merged; DECISIONS 2026-07-05 (Phase 4)):
   match `(subjectGrade, META.substrand_id)` → attach as next MAJOR version, **Not Official**
   (pointer NOT moved, title NOT refreshed — admin promotes via Make Official; refined from the
   original auto-Official design on 2026-07-05 sign-off); ambiguous + intra-batch dup → actionable
   pre-flight failure; empty substrand_id → new plan. `nextMajorForPlan` helper; `IngestResult.action`
   reporting; int spec. No migration.
4. **Phase 5 — pre-VPS checklist (NEXT — own planning session when a VPS timeline exists).** Error
   tracking (Sentry/GlitchTip); **strict CSRF via `SERVER_URL` + Secure-cookie check (Codex #1)**;
   **nonce-based CSP with `script-src` (Codex #2)**; first-user bootstrap before exposure;
   edge/proxy rate limiting; a re-look at the 2h token under public exposure; **Subject-Admin
   uniqueness — grant-path transaction-lock or a partial unique index (Codex #3 / Bucket A #10)**;
   **Gotenberg digest pin + font package pin (Codex #8, resolve the digest against the registry)**.
   (Codex #4 — `/messages` read-state off GET — is DONE, shipped 2026-07-05 as `POST
   /api/messages/mark-read`, not deferred.) Host choice (SPEC open decision) shapes several of
   these, so this phase starts with planning, not code. Full Codex triage: DECISIONS 2026-07-05
   (Codex audit).

**The five-phase audit plan is complete through Phase 4; only Phase 5 (pre-public-exposure) remains,
gated on a VPS timeline.** A 2026-07-05 external (Codex) pass found no Critical issues; its 3 safe
Low fixes shipped (env fail-fast, stale contract comment, engines pin), the rest are folded into
Phase 5 above or documented deferrals (#5 preview buffering, #6 export dedupe). The in-browser
eyeball pass (favorites/messaging/email modal/live search/cached lessons) is still the one
outstanding non-code item.

---

## ▶ RESUME HERE (2026-07-03 latest) — the two branches AND the single-document-format collapse ALL landed

The "① land the two in-flight branches, then ② the single-document-format track" work below is **DONE**
— merged to `main` via CI-gated PRs (verify HEAD with `git log -1`): **#29** UI cleanup + mobile pass,
**#30** Codex Med/Low fixes (email authz-before-cap, `/messages` Sec-Fetch-Site guard, ping try/catch),
**#31** the single-document-format collapse (ONE format = the five-column framework, no Resource column;
removed the "Include ARES Resources" checkbox + all standard/compact plumbing; kept `?as=docx|pdf`),
**#32** a `/simplify` follow-up (single owner for the `ExportKind` union). `main` is clean, no worktrees.

**Left to do next session:**
- **Rock deploy** of current `main` (`git pull` + `docker compose up -d --build`). **No DB migration**
  for the collapse (job-input/cache-key only); notes: benign one-time artifact-cache cold-start (keys
  dropped `format`); re-run Rock `generate:types` and confirm byte-identical to the hand-edit of
  `payload-types.ts` (dropped `format` from the two Task*Artifact input schemas).
- **In-browser eyeballs** (still pending): favorites star (PR ①), messaging (badge/inbox/compose/
  "Message a colleague"), and the collapsed download UX (no ARES checkbox; DOCX/PDF only).
- **Deferred/known** (unchanged): Manage/roster pagination at corpus scale (the `/messages` roster +
  inbox both load with `pagination:false`/`limit:100` by design; the inbox now marks read only the
  shown ids, so unshown unread stay unread until pagination lands); export-dedupe scans only the first
  20 pending jobs (documented best-effort; a miss just enqueues one redundant, cache-bounded job); the
  message-ping zero-unread gate is best-effort under concurrent sends (bounded by the per-recipient
  daily ping cap); moderate esbuild/drizzle-kit `audit:all` advisories (below the prod gate).
  **The PR #30 security fixes ARE now pinned** (PR #33: email authz-before-shared-cap, `/messages`
  cross-site mark-read, ping-enqueue-failure), and PR #34's message context links are integrity-checked
  server-side (a linked version must belong to the linked plan; int-covered).

---

## ▶ RESUME HERE (2026-07-03 late) — ① land the two in-flight branches, then ② the SINGLE-DOCUMENT-FORMAT track

Full write-up in `docs/DECISIONS.md` 2026-07-03 (late). Nothing below was committed (no-commit rule).

**① FIRST: get to a clean tree — commit + merge two uncommitted streams.**
- **UI cleanup + mobile pass** — uncommitted on **`main`'s working tree** (8 files: lesson-page clean
  title + `Subject · Grade` context line, styled version-pill selector, mobile touch targets +
  export-bar/compose wrap, `--danger` token + `.inline-error` class, explicit `viewport` export, a
  guide typo fix, and the Manage-page mobile chrome fix in `custom.scss`). Plus `.claude/launch.json`
  gitignored (Codex #5). Verified on a local compose stack (typecheck + unit 51/51; `/admin` pages
  time out `preview_screenshot`, so verified via computed DOM metrics — see the memory note).
- **Codex Med/Low fixes** — uncommitted on branch **`fix/email-authz-msg-hardening`** (git worktree at
  `../Lesson3-codexfix`, off clean `main`; typecheck + unit green): #1 authorize the version BEFORE
  spending shared email caps; #2 `/messages` skips mark-read on `Sec-Fetch-Site: cross-site`; #3
  wrap the `messagePing` enqueue in try/catch; #4 `USER_GUIDE.md` refreshed. **Not yet run:** int/http
  + browser for this branch (needs a rebuild off it; CI will gate the PR). Codex #6/#7 stay deferred.
- **To do:** commit each stream on its own branch, open/merge PRs (CI is the gate), tidy the worktree
  (`git worktree remove ../Lesson3-codexfix` once merged). Reach a clean `main`.

**② THEN: the SINGLE-DOCUMENT-FORMAT track (architectural — decided 2026-07-03 late).** Collapse the
two export formats (`standard` = separate Resource column; `compact` = none) into **ONE** format: the
**ARES-resources-inline** layout with **NO separate Resource column** (today's `compact` table shape).
Remove the **"Include ARES Resources"** checkbox and all standard/compact plumbing; KEEP the
orthogonal `?as=docx|pdf` axis. This deletes real code and simplifies the UX. Resource **links**, when
present, render **inline in the phase rows**, not a column — this
**supersedes** the old 2026-06-09 "add a Resource column" plan. Touchpoints + exact deletion list are
in DECISIONS 2026-07-03 (late); start from `grep -rilE "compact|LessonSequenceFormat|ResourcesToggle|Include ARES" app/src`
(delete `lib/format.ts`, `ResourcesToggle.tsx`; collapse `LessonSequenceFormat` + the `format`
params threaded through the endpoints/jobs/generator/UI). Open detail (confirm when resource data
lands): the precise inline placement of a link within a phase row.

---

## ▶ RESUME HERE (2026-07-03) — §10 features track: ALL THREE PRs SHIPPED (① favorites, ② email-a-doc, ③ messaging)

**Track switch:** production hardening is done; the §10 cross-user features track is active. The
design was decided via structured Q&A BEFORE any code — full record in DECISIONS 2026-07-02 (top
entry). One-line version: build order **favorites → email-a-doc → messaging + notifications**;
notifications = in-app unread badge + a content-free email ping (Jobs Queue); the user directory
relaxes to a **names-only roster for all authenticated users** WITH PR ③ (deliberate reversal of the
2026-07-01 #4 tightening; SPEC amendment rides that PR); **AI summaries unprioritized** (purpose
conversation before build); **Swahili translation DEFERRED** (leaning if built: a parallel
translation record keyed `(version, locale)` — human-reviewable, version-pinned, core untouched).

- **✓ PR ① Favorites — MERGED (#25) + Rock-deployed + live-verified 2026-07-02.** `favorites`
  collection (session-stamped `user` in beforeValidate — spoofed ids overridden; own-only
  read/delete, Site Admin excepted; NO update path; compound unique index; hidden from /admin);
  favorites **cascade on lesson-plan AND user delete** (required rel = NOT NULL col + SET NULL FK →
  23502 without it); star toggle on library rows + the lesson heading; "My favorites" section pinned
  above the catalogue; Guide copy. `tests/int/favorites.int.spec.ts` (6 tests) runs in CI's full
  gate. Migration `20260702_194849_add_favorites` was generated ON THE ROCK (deps image), then
  hand-guarded idempotent; `deploy.sh` snapshotted before applying it. Rock `generate:types` output
  was byte-identical to the hand-written payload-types.ts. Live REST verification: spoofed create
  stamped to the session user, double-favorite → 400, cross-user delete → 403, owner delete → 200.
  **Only the user's in-browser eyeball of the star UI is pending.**
- **✓ PR ② Email-a-doc — MERGED (#26) + Rock-deployed + SMTP-smoke-verified 2026-07-02.**
  `POST /api/lesson-bundle-versions/:id/email` `{to}` (+ export's `?format/?as`): same READ gate as
  export, enqueue-and-202 (contract is QUEUED, not delivered), `emailVersionArtifact` job warms the
  artifact cache like an export then sends the zip via nodemailer with a sender-attributed body.
  Guardrails: 'email' rate bucket = per-user DAILY cap (10/24h default, `RATE_LIMIT_EMAIL_*`),
  checked BEFORE validation (probing spends budget); `lib/emailAddress` validator (no CR/LF → no
  header smuggling); deliberately NO dedupe (re-send is legitimate; the cap bounds it). UI: "Email…"
  button on the lesson export bar. Enum migration `20260702_230926_add_email_task` Rock-generated,
  guarded (down deletes the feature's job rows first). http suite covers 401/400/404/202+job-row/
  429-exhaustion (the 429 test uses invalid bodies — emits no mail). Live smoke: a real send to the
  operator's address logged `emailVersionArtifact sent`; **inbox delivery confirmed by the user.**
  **Hardening follow-up (#27, merged + deployed + live-verified same day):** Codex audit (no
  Critical/High) + /simplify — job input/logs carry `requestedByUserId` (durable egress audit
  trail); `enforceSharedRateLimit` adds `emailRecipient` (20/day per address, pooled across
  senders) + `emailGlobal` (1000/day) caps on the same counter table (all three tiers verified
  counting on live); `npm run typecheck` is the reliable local gate; email job cache path
  simplified + parallelized; recipient regex mirrors Payload's. DECISIONS 2026-07-02 (late).
- **✓ PR ③ Messaging + notifications — MERGED (#28) + Rock-deployed + live-verified 2026-07-03.**
  `messages` collection (flat/no threads; sender session-stamped — spoofed ids overridden; PRIVATE:
  read = sender/recipient only, deliberately NO Site Admin read; NO API update/delete — mark-read is
  a system write by the inbox view, which killed the planned /read endpoint; user deletes cascade
  sent+received). Notifications: content-free `messagePing` email job (nothing sender-controlled in
  the mail, sender id on the job row/logs for audit) gated to fire ONLY when the recipient had zero
  other unread + a per-recipient daily ping budget; per-sender daily `message` create cap (hook-
  thrown 429; new `consumeRateLimit` primitive). Unread badge: AppNav is an async server component
  counting its own unread on BOTH surfaces. `/messages` inbox+compose (bodies inline, viewing marks
  read; names-only picker; lesson page "Message a colleague" hands off ?plan=/?version=). **The
  names-only roster relaxation + SPEC §8 amendment landed here** — with a NEW `assignments` field
  read guard (the old self-only collection gate was implicitly hiding it; see DECISIONS 2026-07-03).
  Migration `20260703_041716_add_messaging` Rock-generated + hand-guarded; Rock `generate:types`
  byte-identical. CI green (3 fix rounds: stale directory-privacy pin now pins the relaxation;
  hasMany fields strip to [] not undefined; default-REST unauth create = 403 not 401). Live-verified
  over REST: unauth 403, spoofed sender stamped, private reads (non-participant admin sees []),
  PATCH/DELETE 403, roster names-only (email/roles/assignments stripped), badge 1→2→cleared by
  inbox view, ping fired for msgs 1+3 but NOT 2 (zero-unread gate proven live), `messagePing sent`
  logged with full attribution. Smoke messages deleted from live afterwards. **Pending: the user's
  in-browser eyeball (badge, inbox, compose, "Message a colleague" link) — plus the still-pending
  favorites star eyeball from PR ①.**
- **▶ NEXT: the §10 track is COMPLETE.** Options for the next session, in rough priority: ① the
  two pending in-browser eyeballs (above); ② **AI summaries** — deliberately unprioritized until a
  purpose/placement conversation with the user happens BEFORE any build (DECISIONS 2026-07-02);
  ③ deferred backlog (Manage/browse pagination at corpus scale, payload-jobs prune, esbuild
  advisories when upstream moves, operator OPS setup in docs/OPS.md if still unfinished);
  ④ Swahili translation stays DEFERRED pending real demand.

---

## ▶ Older resume (2026-07-01) — edit-UX + PDF-fidelity resolved; items ①/③ done, ② authored-not-run

**Shipped this session (all merged to `origin/main` + Rock-deployed; verify HEAD with `git log -1`).
Full reasoning in `docs/DECISIONS.md` 2026-07-01.**
- **① gate confirmed green** on HEAD — CI runs the full gate (unit + lint + audit + contract + int + http).
- **Edit-UX (#6, #10).** The lesson-page "Edit" button now deep-links `?edit=1` so the admin version
  editor lands **unlocked** (it loads read-only by default — which read as "no edit rights"); a
  locked-state notice covers anyone who arrives without the intent. Follow-up **#10: all admin-only
  fields are now HIDDEN from Editors** — generalized the existing META/UNIT `structureCondition` into
  one `adminOnly()` wrapper (`fields/lessonContent.ts`). This also closed a trap where structure /
  answer-key fields *looked* editable but had their edits silently dropped on save by the field-split
  whitelist. (Editor UI verification is the user's, in-app as `editor@lesson3.local`.)
- **PDF fidelity (#8, #9) — item ③ resolved, but NOT as originally scoped.** A pixel-vs-Word gate is
  unworkable cross-engine (LibreOffice vs Word paginate/lay tables out differently → per-page diffs
  stay ~50%+ even when faithful). The visible table-row-height gap traced to fonts: the DOCX call
  **Arial** everywhere and stock Gotenberg substituted Liberation Sans. Fix: **Gotenberg now builds
  real Arial** (`gotenberg/Dockerfile` + `ttf-mscorefonts-installer`), deployed + Rock-verified — the
  gap closes to a minor residual (LibreOffice's vs Word's table-layout algorithm, unfixable by fonts).
  `requireTool` in the gate script was also fixed (#8, ENOENT-only) so the script runs at all. **Key
  reframing:** the **DOCX opened in Word is the faithful, primary deliverable and is already perfect**;
  the **PDF is a secondary LibreOffice artifact**; the preview is mammoth-HTML (styling dropped) — so
  "very good" PDF suffices and pixel-parity-with-Word is overkill.

### ▶ ACTIVE TRACK (2026-07-01 late) — the IA redesign, 5 PRs

**The user called out the core UX failure** (three near-identical lesson lists going three places;
data model leaking into UX) and a full redesign was decided via structured Q&A — see DECISIONS
2026-07-01 (late) for the complete design. One-line version: **ONE library (`/`), the lesson page as
the sole hub/gateway to editing, and Manage as a single role-scoped functions page** (Editor: my saved
versions; Subject Admin: + scope deletes + Editors-promotion widget; Site Admin: + upload/repair/
delete-plans/curriculum/people). Admin catalogue + versions list + "bundle" wording all go away;
editor page gets stripped chrome + "← Back to lesson"; mobile is reading-first.

Build order (each: CI green → Rock deploy → user eyeball):
1. **✓ ① Authorship + delete scoping — DONE** (#13, merged + Rock-deployed, migration applied).
2. **② The Manage page** — rebuild the dashboard as stacked role-scoped sections (incl. Upload move,
   delete/repair panels, Editors widget). *(shipped 2026-07-01 — see the PR)*
3. **③ Remove redundant surfaces** — *(shipped 2026-07-01 — see the PR)*. Checkpoint ANSWERED:
   `admin.hidden` DOES block document routes (verified in @payloadcms/next views/Document — only
   internal drawers pass `overrideEntityVisibility`), so the collections stay non-hidden; their LIST
   routes redirect to Manage (`RedirectToManage`) and the "Lesson plans" nav group is CSS-hidden
   (`[id='nav-group-Lesson plans']`). Catalogue + VersionTitleCell deleted; versions relabelled
   "Lesson plan version"; the obsolete adminCatalogue e2e spec replaced by `manage.e2e.spec.ts`
   (5 tests, authored-not-run — covers Codex #7's ask).
4. **④ Strip editor chrome** + "← Back to lesson" — *(shipped 2026-07-01 — see the PR)*. The version
   editor hides Payload's nav sidebar/hamburger/app-header (breadcrumbs) via a `body:has()` rule
   scoped to `.collection-edit--lesson-bundle-versions` (class names verified against installed
   payload/next); the shared `.lp-admin-header` AppNav stays. `LessonControls` gains
   "← Back to lesson" → `/lessons/{planId}?version={id}`.
5. **⑤ Mobile reading pass + Guide copy** — *(shipped 2026-07-01 — see the PR)*. 640px blocks:
   library rows wrap, lesson heading stacks, generated tables keep min-width and scroll inside
   .doc-preview, Manage rows/search/picker wrap. Guide rewritten for the new IA (three-places primer;
   Editors: edit-from-lesson → save-as-new-version → My saved versions; Subject Admins: Make Official
   + Manage candidates/Editors; Site Admins: everything-on-Manage). Editor form stays desktop-oriented
   by decision.

**THE IA REDESIGN TRACK IS COMPLETE (①–⑤ all merged + Rock-deployed).** Remaining loose ends live in
the deferred list below + the two authored-not-run Playwright specs (manage / adminCatalogue→replaced).

**Deferred (Codex rounds 1–2, see DECISIONS 2026-07-02):** Manage pagination at corpus scale;
dev-only esbuild advisories (upstream-gated). ~~Playwright run~~ — **DONE 2026-07-02: manage.e2e
6/6 GREEN from the Mac against the live Rock** (tunnel procedure in DECISIONS), incl. the new
editor-shell smoke. ~~Editors-widget PATCH race~~ — FIXED (narrow assign/unassign-editor endpoints,
required expectedUpdatedAt); ~~make-official optional guard~~ — now mandatory; ~~lesson page
100-version cap~~ — pagination: false. Both Codex production-blocker lists are now fully closed
except pagination-at-scale (corpus-gated by definition).

### ▶ Older list (pre-redesign status, still true)

1. **✓ Confirm the full gate is green on current HEAD — DONE.** CI runs the full gate on every push.
2. **② admin-catalogue e2e — AUTHORED, NOT RUN.** `app/tests/e2e/adminCatalogue.e2e.spec.ts` (#7) is
   written + type-checked + `playwright test --list` 4/4 (clean title / no shouty "GRADE N:", the "No
   Official version" row, the `v{semver}` badge, Site-Admin per-ID delete). But Playwright is dev-only
   and needs a running app + a seedable DB (`E2E_BASE_URL` + `DATABASE_URI`) — **run it against a stack**
   (Rock or local compose; instructions in the spec header). This is the **highest-value remaining item.**
3. **③/④ formal PDF fidelity gate + CI probes — REFRAMED / PARKED.** Pixel-vs-Word is abandoned
   (unworkable cross-engine — see DECISIONS 2026-07-01). If an automated PDF gate is ever wanted, the
   only workable form is a **same-engine regression** (freeze the Arial LibreOffice output as golden,
   diff future output vs it) — parked as *optional*, since the DOCX-in-Word path is already faithful and
   the PDF is a convenience artifact. The 3 Word `.oracle.pdf` + DOCX are staged on the Rock at
   `/srv/lesson3/out/ares-demo`. (`requireTool` is fixed so the existing script runs; Arial is deployed.)
4. **✓ Editor "Admin only" follow-up — DONE** (#10: hidden, not labelled).
5. **⑤ low-value cleanup, opportunistically** (unchanged, not gating): the transactional rollback
   fault-injection test, durable cross-deploy log archival, dev-only `esbuild`/`audit:all` advisories.

**Critical path now: run ② against a stack.** Then optionally the same-engine regression gate. The
other major track available anytime is **§10 cross-user features** (email-a-doc, messaging +
notifications, favorites, Swahili translation, AI summaries) — all ordinary Payload
collections/endpoints/hooks + the live Jobs Queue; none touches the generator/versioning core.

**State: verify with `git log -1 --oneline` — don't trust a pinned hash in prose. Prior baseline was
`df88935`/`f4d73ee`; the admin-redesign batch (`cbec573`/`25b4875`) is pushed + Rock-verified on top.**
Latest work: a Codex review of the ops layer — 8 fixes applied (restore identifier validation, heartbeat
2xx/3xx-only, deploy refuses unbacked, CI `contract-check` probe, fail-fast rate-limit env, direct
`drizzle-orm` dep, guarded int cleanup), 2 deferred (forced-rollback test, O(n) semver). See DECISIONS
2026-06-30 (eve).
Worked from the **home Mac mini M4**: GitHub push works from Bash here (osxkeychain token cached); Rock SSH
works after `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`. **GitHub Actions is now the canonical gate**
(`.github/workflows/ci.yml`, ~3.5 min, runs unit+lint+audit+int+http on a full compose stack); last run
green. Local/Rock gate also green: **test:unit 39/39, test:int 18/18, test:http 22/22, audit:prod GREEN**.
Seeded logins for UI checks are in the assistant's private memory (NOT the repo).

**✓ Done 2026-06-30 — backlog #9 OPS (all four), CI-verified (see DECISIONS 2026-06-30 + `docs/OPS.md`):**
- **Backups** (`fdba73f`,`f905869`) — `pg_dump`→`age`→`rclone` to Google Drive; `scripts/{backup,restore,deploy}.sh`;
  `daily/`(30d)+`premigrate/`(90d); `deploy.sh` snapshots before migrate. Pipeline verified end-to-end on
  the Rock (restore → lesson_plans=13). `age`+`rclone` installed to `~/bin` on the Rock.
- **Structured logging** (`5544114`) — pino JSON, env `LOG_LEVEL`, export-job failures logged w/ context,
  Docker json-file rotation. NOT Sentry (on-box, simpler). Confirmed live.
- **Heartbeat** (`7c3e72a`) — push/dead-man's-switch: `backup-db.sh` + `scripts/heartbeat.sh` ping
  Healthchecks-style URLs only when healthy (right for the Tailscale-only box). All branches tested.
- **CI** (`a631c1a`+fixes) — GH Actions mirrors the Rock procedure (compose up → gate via deps image).
  Debugging it caught a REAL latent bug: `rate_limit_counters` was invisible to Payload `push` →
  registered it via `postgresAdapter.beforeSchemaInit` (`471bb03`); `test:int` now builds an EMPTY
  `lesson3_test` via push (not pre-migrate, `f63e8b8`) and runs spec files sequentially
  (`fileParallelism:false`, `f4d73ee`). See the push-vs-migrate lesson in DECISIONS 2026-06-30.

**▶ OPERATOR SETUP still needed to ACTIVATE backups/monitoring (you, one-time — all in `docs/OPS.md`):**
generate the `age` key on your Mac (+ give me/the repo the public recipient); `rclone` Drive OAuth; create
two Healthchecks.io checks; add `BACKUP_AGE_RECIPIENT`/`BACKUP_RCLONE_REMOTE`/`HEALTHCHECK_*` to the Rock
`.env`; install the backup + heartbeat crons. Until then `deploy.sh` just warns and skips the snapshot.

**✓ Done this session (2026-06-29 late), Rock-verified:**
- **Shared Postgres-backed rate limiter** (`ed2fd6b`) — `lib/rateLimit.ts` was an in-memory per-process
  window (each replica its own count → budget multiplied under scaling). Moved to a SHARED store: a new
  `rate_limit_counters` table (migration `20260629_213000`), one row per `(bucket, user)` reused via an
  atomic `INSERT … ON CONFLICT DO UPDATE`. **Postgres, not Redis** (single-runtime, no new infra). Changed
  from a sliding log to a **fixed-window counter** (deliberate, documented — ~2× boundary slack is
  immaterial for an abuse guard, keeps the shared path one atomic statement). `enforceUserRateLimit` is now
  async; the 3 export/preview call sites await it. Int-covered (`tests/int/rateLimit.int.spec.ts`: budget
  enforced → 429+Retry-After, per-user isolation, 401 unauth). **Ops gotcha (cost time):** `npx payload
  migrate` against `lesson3_test` HUNG (open pg pool, never exited) — applied the `CREATE TABLE` + a
  `payload_migrations` row to `lesson3_test` via `psql` directly instead. See DECISIONS 2026-06-29 (late).
- **Semver retry-on-conflict** (`eaec3ed`) — `POST /:id/save-as-new` now retries (bounded to 4) when two
  concurrent saves on one plan race for the same next patch and hit the unique `lessonPlan_semver_idx`.
  Each retry is its OWN transaction (kill → recompute the semver against freshly-committed state → retry),
  because the conflict poisons the Postgres transaction. `isSemverConflict` (in `lib/semver.ts`) is
  deliberately NARROW — matches ONLY `lessonPlan_semver_idx` (via the pg error's `.constraint`, the
  drizzle-wrapped `.cause.constraint`, or the index name in the message), never a bare `23505`/generic
  "duplicate key value", so an unrelated uniqueness bug surfaces immediately. Unit-pinned
  (`tests/unit/semverConflict.spec.ts`). Integrity was always safe; this just turns a rare 500 into a
  transparent retry. **Still open (Codex):** a failure-path/rollback test for the transactional
  save-as-new/make-official (forcing the 2nd step to fail) — needs a fault-injection seam + the Rock;
  tracked as a follow-up, not built (didn't want a test-only hook in production code).
- **`vitest` 4.0.18 → 4.1.9** (`2599bb2`) — clears the dev-only critical advisory (GHSA-5xrq-8626-4rwp,
  the Vitest UI server; we only run `vitest run`, never `--ui`). `audit:prod` stays GREEN; the 5 remaining
  moderate esbuild/drizzle-kit advisories are transitive with no upstream fix, below the prod gate.

**✓ Done this session (2026-06-28 → 06-29), all Rock-verified:**
- **② Dependency advisories** (`8e80e17`): scoped npm `overrides` (`undici@7.28.0`, `postcss@8.5.16`,
  `nodemailer@9.0.1`) — no forward framework bump exists. `audit:prod` GREEN. Overrides are TEMPORARY
  (remove when upstream catches up — exit conditions in DECISIONS 2026-06-28 "late").
- **③ Preview CSP override** (`d45bdb9`): `next.config` baseline CSP now excludes the preview path
  (negative-lookahead) so the endpoint's strict `default-src 'none'` survives; curl + e2e verified.
- **Phase-5 residuals**: export-status readiness is version-scoped (Codex #4); in-flight export **dedupe**
  (Codex #5). **#4 optimistic concurrency** (now folded into save-as-new). **#8 browse**: `pagination:false`.
- **Review follow-ups**: per-run fixture `MARK`, `test:rock` script, `audit:all`, upload Content-Length
  guard, nav unification (one `AppNav` + avatar dropdown across both surfaces).
- **Editing-UX redesign (the big one):**
  - *Stage 1 (admin edit view):* "Semver"→"Version" label; META/UNIT hidden for non-editors; API tab
    Site-Admin-only; Last Modified/Created moved to the sidebar.
  - *Stage 2/2b (versioning model — supersedes the old fork-on-open working-copy model):* versions are
    **immutable to authenticated users** (`lessonBundleVersionUpdate: () => false`); the one control bar
    `LessonControls` (Edit·Preview·Save·Discard·Download·☑docx ☐PDF ☐ARES) drives it. **Save** = a NEW
    candidate via `POST /:id/save-as-new` (never publishes; optional **atomic delete-source**). **Make
    Official** (admin only) moves the pointer (optional **atomic delete-previous**). Both endpoints are
    **transactional** (initTransaction/commit/kill); stale-base guard is mandatory (400/409). Public
    lesson-page **Edit** now links to the admin editor (no fork); `/fork` retired. Dead beforeChange
    hooks removed. Full HTTP coverage. See DECISIONS 2026-06-29 entries.

**▶ LEFT TO DO:**

*Production hardening is essentially complete — what remains is operator setup (above) + small deferred
follow-ups. The next big decision is which TRACK to take (see "The chosen track" below): cross-user §10
features, or the formal PDF fidelity gate, or stay on residual hardening.*

Deferred follow-ups (small, non-blocking — pick off opportunistically):
- **Durable cross-deploy log archival** — container logs rotate but reset on `up --build`; ship to a
  file/volume if post-mortem history across deploys is wanted (DECISIONS 2026-06-30).
- **Transactional rollback test** (Codex, Medium): `save-as-new`/`make-official` are happy-path covered
  but not on a forced 2nd-step failure. Needs a fault-injection seam + the Rock; not built (didn't want a
  test-only hook in prod code).
- **`payload-jobs` cleanup** (completed rows kept for failure visibility — add periodic prune) and
  **orphaned `rate_limit_counters` rows** for deleted users (bounded, harmless).
- **5 moderate esbuild/drizzle-kit advisories** (`fixAvailable:false`, below the prod gate) — bump when
  upstream catches up. **`actions/checkout` Node-20 deprecation** warning in CI (cosmetic; bump later).
- **Fidelity probes in CI** (Codex Med, partial): `contract-check` is now in CI; `ingest-extract-check` /
  `format2-check` / `adapter-fidelity` need the stakeholder oracle DOCX (`ARES_DEMO_PATH`, not in repo)
  staged in CI — pairs with the PDF fidelity gate below.
- **O(n) semver allocation** (Codex Low): `nextSemverForPlan` reads all of a plan's versions for max+1 —
  fine now, revisit with a counter row/sequence only at scale.
- **PDF fidelity gate** (audit #12) — see "In-flight follow-ups".

**Rock `test:int` procedure CHANGED (DECISIONS 2026-06-30):** do NOT pre-migrate `lesson3_test` anymore —
drop+recreate it EMPTY and let push build it (matches CI; pre-migrate + push now conflict). CI is the
canonical gate regardless.

**✓ Latest (2026-06-28, this session): item ① — endpoint/authz e2e (`test:http`) — DONE, Rock-verified.**
Commits `059b18d` (suite) + `847fdd7` (fixes). New `tests/http/endpoints.http.spec.ts` +
`vitest.http.config.mts` + `test:http` drive the RUNNING app over HTTP (graphql-404, preview auth/read/
edit gates + CSP, export DOCX+PDF end-to-end read-gated, Bucket-A invariants over the wire); stale
`tests/e2e/frontend.e2e.spec.ts` removed. **`test:http` 13/13** on the Rock. Distinct run procedure from
`test:int` (hits live `lesson3` + `E2E_BASE_URL=http://app:3000`; see DECISIONS 2026-06-28 top entry).
The e2e surfaced a **real Low finding: the next.config `/:path*` CSP overrides the preview endpoint's
strict `default-src 'none'` CSP** (preview loses its intended strict policy; sanitized HTML so low-risk)
→ tracked in the follow-ups below. **Next: item ②.**

**✓ Earlier this session: Bucket A item ⓪ — create-path Official-pointer gap — DONE, deployed +
Rock-verified.** Commits `68fc706` (hook + specs) + `ca826f1` (spec cleanup-order fix).
`validateOfficialVersionPointer` now also rejects `officialVersion` on an authenticated create; the
`#2` int spec is rebuilt two-phase + a create-guard spec added. `test:int` **15/15** on the Rock, a
sanity-flip fails only the new spec (gate has teeth), app rebuilt (migrate clean), graphql still 404.
Full write-up in DECISIONS.md 2026-06-28 (top entry). **Next: item ①.**

**Earlier this day (prior session):**

**What this session did:**
- **Pushed** the 4-commit hardening batch (`68677ae..a97d596`: GraphQL off, preview sanitize+headers,
  int harness, docs) — it had been stuck unpushed on the laptop for credential reasons.
- **Deployed on the Rock** (`git pull` → `docker compose up -d --build`; migrate had nothing pending;
  app healthy). Host `npm ci` is NOT needed/used — `node_modules` is root-owned and the image installs
  deps internally from the lockfile (which already has `dompurify`).
- **Verified the hardening:** `POST /api/graphql` → 404, `GET /api/graphql-playground` → 404; security
  headers all present (nosniff / X-Frame-Options:DENY / Referrer-Policy / DNS-prefetch off / non-script
  CSP); `next build` clean; `test:unit` **33/33** (incl. `sanitizeHtml` keeping tables, stripping
  script).
- **Got `test:int` actually running for the first time ever** — it had never executed anywhere with a
  DB. Fixed 3 real bugs (committed): `vitest.config.mts` `jsdom`→`node`; fixture phase
  `'Predict'`→`'Predict Phase'`; `access.int.spec.ts` now resubmits the working copy's real rows (with
  ids) instead of an id-less fresh bundle. **`test:int` 9/9 green**, and a **sanity-flip** (kill the
  immutability guard) flips only the matching test red — the gate has teeth. Full write-up + the **Rock
  test-DB procedure** (isolated `lesson3_test` + temp `test.env` swap) in DECISIONS.md 2026-06-27.

**✓ Bucket A — server-side invariant hardening — DONE, deployed + Rock-verified (2026-06-28).**
Commits `0caf341` (hooks/helper) + `fb72cec` (unique-index migration). The product invariants are now
enforced as collection hooks + a DB constraint, not just in the workflow paths:
- **#2** `validateOfficialVersionPointer` rejects an AUTHENTICATED update that clears `officialVersion`
  to null; the system/`overrideAccess` path (ingest, roundtrip cleanup, fixture teardown) stays exempt.
  *(Follow-up: this covered only the UPDATE path — the CREATE-path sibling gap is item ⓪ below.)*
- **#3a** new `enforceVersionPlanConsistency` — a version's `subjectGrade` must equal its plan's.
- **#3b** `semver` is server-immutable (field `access.update: () => false`), not just UI `readOnly`.
- **#4** fork uses `nextSemverForPlan` (next free patch across the plan) + a **unique
  `(lessonPlan, semver)` index** (`lessonPlan_semver_idx`, migration
  `20260628_154237_add_version_semver_unique`, idempotent up/down). Pre-applied cleanup: deleted the
  two non-Official `1.0.1` verifier-cruft working copies on plan 10 (versions 23, 26) so the index
  could build — corpus now has zero `(plan, semver)` dups. **`test:int` 14/14** (4 new invariant specs
  + the unique-index regression). Migration applied to live `lesson3` AND `lesson3_test`.
- **#10 DEFERRED** (lowest): DB-level uniqueness for subject-admin-per-grade — the hook fan-out
  (`autoDemotePriorSubjectAdmins`) still handles it; a partial unique constraint needs a representation
  change, out of scope for this batch. Revisit if concurrent promotions become a real risk.

**Next — continue the hardening order:**

- **✓ ⓪ Bucket A follow-up — create-path Official-pointer gap — DONE (2026-06-28).** Closed +
  deployed + Rock-verified (commits `68fc706` + `ca826f1`). `validateOfficialVersionPointer` rejects
  `officialVersion` on an authenticated create; system/`overrideAccess` exempt. `#2` int spec rebuilt
  two-phase, create-guard spec added, `test:int` **15/15**, sanity-flip proven. See DECISIONS 2026-06-28.
- **✓ ① endpoint/authz e2e — DONE (2026-06-28).** New `tests/http/endpoints.http.spec.ts` +
  `vitest.http.config.mts` + `test:http` (commits `059b18d` + `847fdd7`): graphql-404, preview
  auth/read/edit gates + CSP, export DOCX+PDF end-to-end (read-gated, no Official gate), Bucket-A
  invariants over HTTP. Stale `frontend.e2e.spec.ts` removed. **`test:http` 13/13** on the Rock (hits
  live `lesson3` + `E2E_BASE_URL=http://app:3000` — second run procedure, see DECISIONS 2026-06-28).
- **✓ ② dependency advisories (#1) — DONE (2026-06-28).** Commit `8e80e17`, Rock-verified. The
  anticipated framework bump doesn't exist (Payload 3.85.1 latest stable + pins undici exact `7.24.4`;
  Next 16.2.9 still ships vulnerable `postcss@8.4.31`), so the fix is scoped npm `overrides`
  (`undici@7.28.0`, `postcss@8.5.16`, `nodemailer@9.0.1`) — no schema change. **`audit:prod` GREEN**;
  **test:int 15/15** + **test:http 13/13**; nodemailer-9 boot + sendMail smoke OK. Overrides are
  TEMPORARY (remove each when upstream catches up). Remaining audit noise is below the high gate: 5
  moderate esbuild/drizzle-kit build-toolchain advisories + a **dev-only** vitest critical. See DECISIONS
  2026-06-28 "late".
- **✓ ③ preview CSP override (Low) — DONE (2026-06-28).** Commits `d45bdb9` + `5ad774f`, Rock-verified.
  `next.config.ts` `headers()` split into two rules: non-CSP baseline on `/:path*` (incl. preview) +
  baseline CSP on a negative-lookahead source that EXCLUDES `…/:id/preview`, so the endpoint's own
  `default-src 'none'` Response CSP survives uncontested (also added `frame-ancestors 'none'` to
  `PREVIEW_HEADERS`). **curl-verified** on the Rock (baseline CSP on `/login` + sibling `…/export`,
  absent on `…/preview` which still keeps `X-Frame-Options: DENY`) and **test:http 13/13** with the
  tightened assertion. See DECISIONS 2026-06-28 "late".

**Codex audit note (2026-06-27 eve):** 11 findings, 7/10. Bucket A (#2/#3/#4; #10 deferred) is now
DONE (above). Bucket B just re-confirms the existing backlog (#1, #6, #7, #8, #9). #5 export-job dedupe
is real → in the Phase-5 residuals. Corrections: the "local test runner broken (esbuild)" is an
env/platform artifact, not a defect — `test:int` 14/14 + `test:unit` 33/33 are green on the Rock; #11
upload-buffering is Site-Admin-only (Low) — **now closed 2026-06-28: Content-Length pre-parse 413 guard
in `uploadBundles` (matches the `previewParse` idiom).**

**Codex re-review (2026-06-28, 7.5/10) — reconciled (see DECISIONS "late").** #1 concurrency "bypass"
DOWNGRADED to Low + reframed: Payload's **native document locking** (`lockDocuments` default-on; verified
live) is the primary admin-UI concurrency guard, and `enforceVersionConcurrency` is data-layer
defense-in-depth (intentionally not mandatory). #6 upload guard DONE; #7 added `audit:all`
(visibility, non-gating). Already tracked: #2 export-dedupe atomicity (scale follow-up), #3 shared limiter
(remaining residual), #4 subject-admin uniqueness (= Bucket A #10 deferred), #5 browse (= #8 trade-off),
#8 lint warnings (known hygiene).

---

## ▶ Track context — Production Hardening (the backlog below is the work)

The **Official-version model cutover is COMPLETE and Rock-verified** (origin/main `1959daf`,
2026-06-25) — it is the stable foundation the hardening work builds on (the in-progress work is the
hardening backlog, NOT the cutover; see "⚠ RESUME HERE"). The product model it implements:

- A lesson plan has many retained immutable versions; exactly one is **Official** at a time, globally.
- Upload/import creates version `1.0.0` and makes that exact snapshot Official immediately.
- **SUPERSEDED by the Stage 2 editing model (2026-06-29, DECISIONS):** editing no longer forks a mutable
  working copy on open. ALL saved versions are immutable to authenticated users (`update: () => false`);
  **Edit** opens the version read-only, **Save** creates a NEW candidate via `POST /:id/save-as-new`
  (never moves the Official pointer; optional atomic delete-source), and a Subject/Site Admin **Make
  Official** moves the pointer (optional atomic delete-previous). Only system/`overrideAccess` paths +
  those endpoints write.
- Teachers can view/export all versions; Official is a default/trust marker, not an access/export gate.

**`lesson-plans` + immutable `lesson-bundle-versions` are now the ONLY representation** — the legacy
`lesson-bundles` collection and its entire bundle path are gone, in code AND in the DB (drop migration
`20260625_125532_drop_lesson_bundles` applied; 0 bundle tables remain). The full stage history (1 →
2a → 2b → 2b-finish → 3) is in `docs/CHANGELOG.md`; the reasoning + the collection-drop migration
gotchas are in `docs/DECISIONS.md` (2026-06-25 + 2026-06-24 entries).

**Last Rock verification (2026-06-25):** roundtrip-regression **3/3 byte-identical**, `verify-rbac`
**7/7** (now People/Curriculum RBAC only — lesson-content RBAC lives in `verify-stage2b-edit`),
`verify-stage2b-edit` **13/13**, `verify-stage2b-preview` **7/7**, `verify-stage2-export` DOCX+PDF;
app healthy on the new schema.

**Small non-blocking follow-ups left by the cutover** (do opportunistically, not gating):
- ~~Unit test for `parsePreviewCandidate`'s 400/413 cases~~ — **DONE 2026-06-26**
  (`tests/unit/parsePreviewCandidate.spec.ts`, runs under `test:unit`; also added a Content-Length
  pre-parse guard test).
- The DB-less fidelity scripts need `-e ARES_DEMO_PATH=/ares-demo -v /srv/lesson3/out/ares-demo:/ares-demo`
  to run in-container on the Rock — worth baking into a Rock verify helper (see DECISIONS 2026-06-25).
- `ingest-data/` is untracked on the Rock — confirm it's meant to be gitignored.

---

## Where things stand (origin/main `1959daf`, all DEPLOYED + Rock-verified 2026-06-25)

**Phases 0–5 are done, two UX batches shipped, and the Official-version cutover is COMPLETE and live:
the teacher path (Stage 2a) and admin editing (Stage 2b) run on `lesson-plans` +
`lesson-bundle-versions`, the admin Preview/Export controls run on versions (Stage 2b-finish), and the
legacy `lesson-bundles` collection + its entire bundle path are deleted in code AND in the DB
(Stage 3).** Everything below is live on the Rock (the deploy/verification box — see "Rock"):

- **Upload/import** — safe static extraction of ARES `.js`/`.json` (parse-never-execute), one
  all-or-nothing transaction, **contract drift is a HARD gate**. Dev CLI + Site-Admin-only web upload
  (`POST /api/lesson-plans/upload`; panel above the Lesson Plans list).
  New writes create `LessonPlan` + `LessonBundleVersion 1.0.0` and set the Official pointer.
- **Data model + versioning** — `lesson-plans` owns stable identity + `officialVersion`;
  `lesson-bundle-versions` owns immutable structured snapshots (META, UNIT, LESSONS[],
  FINAL_EXPLANATION, SUMMARY_TABLE) — the content fields live in `fields/lessonContent.ts`.
  `20260624_221905_official_version_model` created the DB schema; the 13 legacy bundles were backfilled
  (Stage 1); `20260625_125532_drop_lesson_bundles` dropped the legacy collection. These are now the
  ONLY representation — the `lesson-bundles` collection and its bundle path are gone in code and DB.
- **RBAC** — Site Admin / Subject Admin / Editor / Teacher, field-level. Lesson-content RBAC (Editor
  prose vs admin structure/answer-keys, version immutability, read scoping) is covered by
  `verify-stage2b-edit`; the slimmed `verify-rbac` now covers only People/Curriculum rules
  (SubjectGrade displayName, ≤1-subject-admin auto-demote, password/assignment guards).
- **"The App"** (`app/src/app/(frontend)`) — the role-aware frontend ALL roles log into. Teachers
  live here only (excluded from `/admin`, redirected home). Has browse → view → preview → export.
- **UI / admin redesign (2026-06-23)** — the shared **Lesson Plans** browse page is now strand-first:
  subject-grade → strand → sub-strand in curriculum order (by `meta.substrand_id`, dotted-numeric),
  four-step type scale, lesson counts, ink titles, server-side `?q=` search; pure server component +
  `src/lib/substrand.ts` (DB-free unit suite, `test:unit`). The Payload **dashboard** boxes are
  replaced by a quiet, role-aware landing (`src/components/AdminDashboard`, `views.dashboard` override),
  and the nav groups are renamed/reordered to **Lesson plans / Curriculum / People**. The redundant
  Lesson-Bundles "META > Title Doc" list column is gone. Lesson Plans page + dashboard verified live;
  see DECISIONS 2026-06-23.
- **UX batch (2026-06-24) — deployed on the Rock** (DECISIONS 2026-06-24): **one login**
  (`/admin/login` → frontend `/login` via a `next.config` redirect; everyone lands on `/`); a
  **consistent top-right user menu** on both surfaces (username · Admin/Lessons · logout · initials
  avatar) with **one logout** (Payload's nav logout hidden via `admin.components.header` + custom.scss);
  a single **"Include ARES Resources" checkbox** replacing Standard/Compact across the teacher view +
  admin export/preview (`lib/format.ts` is the one mapping); admin font scale-up + an SVG nav glyph.
- **§5 editing/preview** — admin editor with array row labels, working-copy HTML preview, **live
  unsaved-edit preview** (`POST /api/lesson-bundle-versions/:id/preview`, edit-gated), teacher "Include
  ARES Resources" toggle.
  **Browser smoke-test ALL PASS** (2026-06-22).
- **§9 export (version path)** — DOCX **and PDF** on versions
  (`GET/POST /api/lesson-bundle-versions/:id/export?format=standard|compact&as=docx|pdf`), READ-access-
  gated, NO published gate (every retained version is exportable). PDF = the generated DOCX converted by
  a **Gotenberg sidecar** via the `docxToPdf(buffer)` seam. Stage 2a moved this to versions and Stage 3
  deleted the legacy `/api/lesson-bundles/:id/export` path.
- **§9/§11 async export (Phase 5) — readiness #1 closed. Live + verified 2026-06-23.** Export is
  two-phase: warm → `200` zip; cold → enqueue the `generateVersionArtifact` **Jobs Queue** task + `202`
  + a status URL (`GET …/export/status?jobId=`). An **artifact cache** (content-addressed by the
  immutable `versionScope`, on a `lesson3_artifact_cache` named volume) makes repeats free; a **per-user
  rate limit** (`429 + Retry-After`) guards export + preview; the queue `autoRun` `limit` caps concurrent
  heavy conversions. Frontend follows the 202 → poll → download handshake. See DECISIONS 2026-06-23.
  *(Stage 3 deleted the bundle-path `generateArtifact` job and dropped its task-slug enum value.)*
- **Corpus** = the 13 originally-published bundles (10 Biology + 3 Math, Grade 10), backfilled (Stage 1)
  into `lesson-plans` + Official 1.0.0 `lesson-bundle-versions` — verified lossless. The versions are
  now the ONLY representation (the legacy bundles are gone in code and DB). DB as of the Stage 3 deploy:
  13 plans / 14 versions (one extra working version from verifier runs — harmless).

**The Rock is an explicit NON-PRODUCTION verification environment** — not production-ready (see the
readiness backlog). It is the only place with a DB; `test:int` and `next build` only run there.

---

## The chosen track — Production hardening (IN PROGRESS) — and the alternatives

**Production hardening is the chosen, active track** (2026-06-27), being worked top-down in this agreed
order: GraphQL (done) → preview sanitize+CSP (done) → Bucket A invariants + ⓪ (done) → endpoint/authz
e2e (done) → **#1 dependency advisories (next; deliberate upgrade)**. The two alternatives below are NOT being pursued now — recorded
so a future session knows they exist.

1. **Production hardening** — *the active track.* The audit (2026-06-23) refined the backlog below;
   work it top-down. *Shifts the system from "validated" to "deployable for real."*
2. **Cross-user "The App" features (§10)** — the other major track. Email-a-doc, internal messaging +
   notifications, favorites, translation (Swahili), AI (summaries). All ordinary Payload
   collections/endpoints/hooks + the **now-live Jobs Queue**; none touches the generator/versioning
   core. SPEC §10. *Pick this for forward product progress instead of hardening.*
3. ~~**Finish PDF (§9)**~~ — **CLOSED 2026-07-20.** The one remaining item was the formal PDF fidelity
   gate, now RETIRED as broken + methodologically abandoned (see in-flight follow-ups). PDF conversion
   itself is proven and exercised in CI; DOCX remains the authoritative layout deliverable.

## In-flight follow-ups (small, already scoped)

- ~~**Formal PDF fidelity gate**~~ **RETIRED 2026-07-20 — do not attempt to run or restage it.**
  `app/scripts/pdf-fidelity-check.ts` is DELETED. Two independent reasons: its Word-vs-LibreOffice
  pixel comparison was already documented as an abandoned methodology (different engines legitimately
  differ), and its parser was broken — it stripped non-numerics from ImageMagick's `compare -metric AE`
  stderr, concatenating the absolute count and the normalised fraction (`1234 (0.0188)` → `12340.0188`)
  and producing impossible percentages. Any "0/3 failure" it reported was an artefact, never a
  product-fidelity result. **DOCX remains the authoritative layout deliverable**, and it IS gated
  (`fidelity-spike` 4/4, `adapter-fidelity` 6/6, plus real Gotenberg conversion exercised in CI). If a
  PDF regression gate is ever wanted, it must be **same-engine** (compare our own Gotenberg output
  across builds), not Word-vs-LibreOffice. See DECISIONS 2026-07-20.
- **Row-label doubling** (cosmetic) — lesson rows read "Lesson 1 — Lesson 1 — …" because `RowLabel`
  prepends `Lesson N —` while the stored `title` already begins with its own. Fix in
  `components/RowLabel` (strip a leading `Lesson N —` for the lessons array, or drop its prefix).
- **chem_1_4 → 14th bundle** — blocked on Mark coercing its `LESSONS[].number` from string to integer
  upstream. When fixed: re-pull `upstream`, stage into `out/ares-data`, ingest (the hard gate admits it).
- **No-op publish semver bump** — superseded by the Official pointer model. Moving Official should
  update only `LessonPlan.officialVersion`, not create or bump a version.
- **Phase 5 residuals (small):** completed `payload-jobs` rows are kept (no auto-delete) for failure
  visibility → add periodic cleanup; the `…/export/status` endpoint is unthrottled (cheap, but a
  generous limiter could be added); the `429` rate-limit was deployed but not yet eyeballed under a
  burst (covered by the int-test work in readiness #6). The per-user limiter is **in-memory /
  per-process** — fine on the single-box Rock; must move to a shared store if ever horizontally scaled.
  **~~Export-job dedupe (Codex #5)~~ — DONE 2026-06-28 (`e6f52bd`).** `findPendingExportJob` coalesces a
  cold `POST /:id/export` onto an already in-flight job for the same `{versionId, format, kind}` instead
  of enqueuing a duplicate (the artifact cache already makes *completed* repeats free; this closes the
  in-flight window). test:http 14/14 (a repeated cold prepare returns the same jobId).
  **~~Export-status `jobId` binding (Codex re-review #4)~~ — RESOLVED 2026-06-28 (`c044e4a`).** Made the
  contract explicit (the sanctioned 2nd option): status readiness is VERSION/spec-scoped, the `jobId`
  binds only the not-ready diagnostics (a stray jobId 404s only on an uncached version). Bind-first (the
  1st option) was tried and reverted — it 404s the NORMAL poll because completed `payload-jobs` rows are
  pruned the moment a fast job finishes. See DECISIONS 2026-06-28 "late". test:http 13/13.

## Production-readiness backlog (the Rock is NOT production)

**Do not soften this:** Codex (2026-06-22) found **no current Critical/High *exploitable application
bug***, but that is NOT "production-ready." The system must not serve real users / sensitive data at
scale until ALL of these land:

**External audit (GPT-5.5, 2026-06-23) — Phase-5 items already resolved (see DECISIONS):** the Payload
**jobs surface was open by default** (run endpoint `() => true`; collection fell back to any-auth-user)
→ **locked down** (`jobs.access` + `jobsCollectionOverrides`, `5b58b41`); and three async-export
correctness bugs — temp-file race, manifest-only readiness, stale-`lockVersion` stuck poll — **fixed**
(`8bede30`). **Audit #3 — CLOSED + Rock-verified 2026-06-24 (`9c9a701`):** the GET `/export` enqueue
(not idempotent / CSRF) was split — GET is now serve-only (warm → 200 zip; cold → 409, never enqueues),
and a new **POST `/export`** is the only state-changing op (CSRF-guarded by the SameSite=Lax cookie).
Verified end-to-end on the Rock (cold POST → 202 → poll → 200 zip; cold GET → 409; unauth POST → 401).
The numbered items below are the remaining hardening backlog.

1. **~~Heavy generation is synchronous + unthrottled~~ — CLOSED (Phase 5, 2026-06-23).** Fixed with
   the **Jobs Queue + per-user rate-limit + artifact cache** (deployed + verified live). Heavy
   conversion no longer ties up an app worker (cold → `202` + enqueue, bounded by the queue `limit`);
   repeats are free (cache); per-user `429` guards export + preview. Residuals tracked in the
   follow-ups above (jobs cleanup, status-endpoint limiter, per-process limiter caveat) — none blocking.
2. **~~Dependency advisories~~ — CLOSED 2026-06-28 (`8e80e17`).** The prod HIGHs (`undici`×7,
   `nodemailer`) + the `postcss` moderate are cleared via scoped npm `overrides` (`undici@7.28.0`,
   `postcss@8.5.16`, `nodemailer@9.0.1`) — NOT a framework bump, because Payload 3.85.1 is already latest
   stable (pins undici exact 7.24.4) and Next still ships vulnerable postcss. `audit:prod` GREEN,
   Rock-verified (test:int 15/15, test:http 13/13). Overrides are temporary — remove when upstream
   catches up (exit conditions in DECISIONS 2026-06-28 "late"). Below the high gate, still open: 5
   moderate esbuild/drizzle-kit build-toolchain advisories + a dev-only vitest critical (`vitest run`, no
   UI server; not in prod image) — bump opportunistically.
3. **~~CSP + HTML-sanitization posture~~ — LARGELY CLOSED 2026-06-26.** Mammoth preview HTML is now
   sanitized at the single seam (`docxToSections` → `sanitizePreviewHtml`, DOMPurify+jsdom), and
   baseline security headers (nosniff, X-Frame-Options, Referrer-Policy, + a non-script CSP:
   object-src/base-uri/frame-ancestors/form-action) are set globally in `next.config.ts`. See DECISIONS
   2026-06-26. **Still open:** a strict nonce-based `script-src` CSP (deferred — needs Next hydration
   nonce plumbing); a review of CSRF posture beyond the SameSite=Lax cookie. **~~Preview CSP override~~ —
   CLOSED 2026-06-28 (item ③, `d45bdb9`+`5ad774f`):** the `/:path*` baseline CSP now excludes the preview
   path (negative-lookahead source), so the endpoint's strict `default-src 'none'` survives; curl- +
   test:http-verified on the Rock.
4. **~~Optimistic concurrency~~ — DONE 2026-06-28 (`699bd9f`).** The premise changed: there's no
   `lockVersion` anymore (versions are immutable; only working copies mutate). `enforceVersionConcurrency`
   (beforeChange, before the field-split) treats the edit path's resubmitted `updatedAt` as the client's
   base and rejects a stale overwrite (409); authenticated updates only, system/`overrideAccess` exempt,
   skipped when no base is supplied. **test:int 17/17** (stale rejected, current allowed, system exempt).
   Caveat: confirming the native admin form sends `updatedAt` (vs a hidden field) is a small follow-up —
   see DECISIONS 2026-06-28 "late".
5. **FE/ST deliverable model — CLOSED 2026-06-26 (option a).** Single-document sub-strands are
   legitimate: a missing FINAL_EXPLANATION / SUMMARY_TABLE is valid content, not incomplete data, so
   the deliverable check stays informational and must never become a hard gate. The always-present
   LessonSequence remains hard-gated by `validateGeneratable`. The typed `notApplicable` state
   (option b) is deferred (no functional gain today). SPEC §3 amended; see DECISIONS.md 2026-06-26.
6. **Tests** — the auth+role fixture harness EXISTS and runs at two layers: Local-API `test:int`
   (`tests/int/access.int.spec.ts`, **15/15** on the Rock 2026-06-28, sanity-flip proven) AND the new
   over-the-wire `test:http` (`tests/http/endpoints.http.spec.ts`, **13/13** on the Rock 2026-06-28 —
   preview/export/PDF/authz + `POST /api/graphql → 404`; closed the old item-#4 e2e gap and removed the
   stale `frontend.e2e.spec.ts`). **Still open:** both suites need a Rock-specific DB/URL procedure (see
   DECISIONS 2026-06-27 + 2026-06-28) — `test:int` an isolated `lesson3_test` + `test.env` swap,
   `test:http` the live `lesson3` + `E2E_BASE_URL` — bake BOTH into a one-command helper. PDF fidelity
   gate in CI (see above). Playwright `tests/e2e/` (browser, localhost:3000) is dev-only, not in the
   Rock flow. **Gate definition (Codex re-review #7, 2026-06-28):** the canonical verification gate is
   **`test:unit` + `test:int` + `test:http`**; the default `npm test` is the scaffold
   `test:int && test:e2e` and OMITS `test:http` (can't merge them — `test:http` needs the running
   container while Playwright `test:e2e` needs a dev server, so no single chain is runnable). A real CI
   runner that stands up app+DB then runs all three is the proper fix; until then run the three
   explicitly (see DECISIONS 2026-06-28 for the deps-image commands).
7. **~~Disable/gate unused GraphQL + GraphQL Playground~~ — CLOSED 2026-06-26.** `graphQL.disable: true`
   in `payload.config.ts` AND both generated `api/graphql*` route files deleted (the POST handler
   ignores the flag at runtime, so deletion is what actually 404s the endpoints). Rock build confirms
   `/api/graphql` + `/api/graphql-playground` are gone. See DECISIONS 2026-06-26. *(Add a `POST
   /api/graphql → 404` e2e assertion as a regression guard — folded into the endpoint-coverage work.)*
8. **~~Lesson browse hard-limits at `limit: 200`~~ — DONE 2026-06-28 (`3dfb01f`).** Both browse finds
   (`(frontend)/page.tsx`) now use `pagination: false` so the WHOLE corpus renders — no silent
   truncation past 200. It's a grouped curriculum catalogue (subject-grade → strand → sub-strand), so
   completeness + the existing `?q=` search is the discoverability model rather than paginating (which
   would fragment strands across pages). Light id/meta projection → cheap for the expected hundreds;
   revisit with lazy-load/virtualize only at thousands.
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
  *(The Phase 5 `payload-jobs` migration and the 2026-06-24 Official-version migration were generated
  + committed this way; both are now on `main`.)*
- *Push from the Rock:* the Rock is normally pull-only (no git push credential, no `gh`, no SSH key).
  When the Rock must push (e.g. it generated types/migration), push once over HTTPS with a short-lived
  fine-grained PAT: `git push "https://<user>:<TOKEN>@github.com/<owner>/Lesson3.git" <branch>`.

**Artifact cache (Phase 5):** generated DOCX/PDF bytes are cached on a **`lesson3_artifact_cache`
named volume** at `ARTIFACT_CACHE_DIR=/var/cache/lesson3`. **Two deploy gotchas (see DECISIONS
2026-06-23):** a fresh named volume mounts **root-owned** but the app runs as `nextjs` (uid 1001) —
the Dockerfile now pre-creates + `chown`s the dir, but if you ever wipe the volume confirm it's
writable; and **`ARTIFACT_CACHE_DIR` must be set in `.env`** (then `up -d --force-recreate app`) or
the cache silently falls back to the non-writable `/app/.artifact-cache` and every export job fails
with `EACCES` (stuck at `202`). The job error names the exact failing path — that tells you which.

**Env** (`.env` on the Rock; `app/.env.example` documents all): `DATABASE_URI`, `PAYLOAD_SECRET`,
`ADMIN_URL`, optional `SERVER_URL` (leave EMPTY on internal/plain-HTTP — strict CSRF bounces some
browsers), SMTP_*, `GOTENBERG_URL=http://gotenberg:3000`, `GOTENBERG_TIMEOUT_MS=120000`,
`ARTIFACT_CACHE_DIR=/var/cache/lesson3` (Phase 5; required), optional `ARTIFACT_CACHE_MAX_BYTES`,
`RATE_LIMIT_*`, `JOBS_AUTORUN_CRON`/`JOBS_AUTORUN_LIMIT`.

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

- **ARES resource data — RESOLVED 2026-07-19.** The replacement JSON corpus now includes mandatory
  lesson-level `resourceLinks`, and current upstream code establishes their exact inline placement
  beneath the phase label. Follow the newest RESUME plan; do not revive the Python recommender or a
  separate Resource column.
- **ARES contract baseline — RESOLVED 2026-07-19.** The new JSON artifacts are the definitive Lesson3
  production interchange contract, intentionally re-baselined as schema 1.0.0.
- Corpus is expected to grow from 13 to dozens→hundreds (Chemistry/Physics incoming) — informs the
  pagination item and any browse/search work.
