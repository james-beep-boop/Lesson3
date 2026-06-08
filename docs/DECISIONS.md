# Decisions & Lessons

Durable, team-visible record of decisions made during the build and lessons learned
from corrections. Committed to git (unlike the assistant's private cross-session memory).

- **SPEC.md** remains canonical for *architecture and domain rules*. This file is for
  build-time decisions and corrections that don't rise to the level of spec changes.
- **Newest entries on top.** Each entry: date, one-line title, then the decision/lesson
  and the reasoning. When a correction teaches a general rule, capture the rule, not just
  the incident.

---

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
