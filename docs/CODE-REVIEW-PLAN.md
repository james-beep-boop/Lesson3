# Sequential full-codebase code review — Pro-plan-budgeted

**Purpose.** A thorough, in-depth read of the whole Lesson3 codebase for correctness, security, and
adherence to the project's own invariants — structured so it can be done **one small unit at a time**,
**sequentially**, and **resumed across sessions**. Shaped for the **$20/month Claude Pro plan**: no unit
needs the whole codebase in context at once, and a token/context/usage limit mid-review costs at most
the current unit's un-recorded work (progress is persisted per *file*, not per unit — see Operating
rules).

This is **not** the old "five-phase audit plan" (build-time hardening, done through Phase 4, in
`DECISIONS.md`), nor `ARES-canonical-json-audit.md` (the JSON corpus). This is a standing, repeatable
**code** review of the shipped source.

> Revised 2026-07-22 after a review-of-the-review (recorded pros/cons in that session). Posture is
> deliberately **lean**: enough rigor to make "whole codebase" defensible and resumable, not so much
> bookkeeping that recording competes with reviewing.

> **Status:** not started. See the progress table at the bottom — update it after every unit.

---

## Why sequential (the plan's whole point)

A single "review everything" pass blows the context budget and loses its work if it dies mid-way.
Instead: one small unit per session, read-only on product code, findings persisted incrementally, and a
progress table so the next session resumes at the next unit.

## Operating rules

- **One unit per session (or part-session).** Each unit is a bounded set of files (~500–1,500 LOC of
  source) plus the tests and scripts that belong to it — small enough to read closely with room to
  record.
- **Product-code read-only.** A review unit never edits `app/src/**` (or any shipped code). It produces
  *findings*. Fixes are separate, later PRs so a review session can't half-apply a change and leave the
  tree dirty. Small obviously-safe fixes may be spun off as their own PR *after* the unit is recorded —
  never folded into the review pass.
- **Audit-doc writes and all git ops require an explicit go-ahead.** Editing the findings file / this
  plan, committing, pushing, or opening a PR are done only when the operator says so — consistent with
  `CLAUDE.md`'s "never commit or push without an explicit request." Default cadence: work on **one audit
  branch**, accumulate findings there, and open **one findings PR** at the end (or at natural
  checkpoints the operator approves) — **not** a docs PR after every unit.
- **Persist after each FILE.** Append a file's findings (or an explicit "clean") to the findings file as
  you finish that file, not only at unit end. This is what makes a hard usage stop mid-unit survivable —
  you lose at most the file in hand. (Hitting a limit is *inconvenient*, not harmless; per-file
  persistence is the mitigation.)
- **Verify before recording.** Every finding is confirmed at its `file:line` (grep/read the cited lines)
  before it goes in the ledger. No speculation. A hunch worth chasing goes under "leads to verify", not
  "findings".
- **Inline, no subagents.** Do the reading yourself, in-session. Do **not** spawn parallel review agents
  for this — that is the fastest way to burn the Pro budget. (`/simplify`'s fan-out is for a small diff,
  not a whole-module read.) Avoid unnecessary web/connector calls too.

## Budget & model discipline (Pro plan)

Pro has both ~5-hour session windows and weekly limits, shared across Claude and Claude Code; model,
effort, conversation length, and tool use all draw it down.

- **`/usage` before starting a unit** — don't open a big unit with little headroom.
- **Fresh conversation per unit** — keeps context (and cost) bounded; carry state via the findings file
  + progress table, not a long thread.
- **Sonnet for the normal read; Opus only for hard adjudication and the final synthesis** (Units 14–15).
- **Pre-split the big units** (5, 10) at their marked points *before* you start, rather than discovering
  the limit mid-read.
- **Keep billing on-plan:** if the budget must stay strictly $20, ensure Claude Code is authenticating
  through the Pro plan and **not** an `ANTHROPIC_API_KEY` (which bills the API separately); disable usage
  credits if you want a hard stop instead of overage.

## Commit baselining (kept light)

- Record the **cycle base SHA** once when the review starts, and each unit's `HEAD` SHA in the progress
  table.
- A solo review run while the tree is frozen (e.g. waiting on human reviewers) barely churns, so the
  full "reopen every completed unit whose files changed" ritual is usually moot. Instead: at the **end**,
  run one `git diff <cycle-base>..HEAD --stat` sweep; **only** reopen a completed unit if that sweep
  shows its files actually changed. If you *do* review during active development, record each unit's SHA
  and reopen on real change.

---

## Unit 0 — baseline & manifest (do this first)

The step that makes "whole codebase" defensible and every later unit reproducible.

1. **Coverage manifest.** Enumerate every tracked file (`git ls-files`) and map each to exactly one unit
   below, or to an explicit exclusion class: **generated** (Payload types, generated migrations),
   **vendored** (`src/generator/vendor/**`), or **config-noise** (lockfiles, `.gitignore`-adjacent).
   Generated/vendored files get "fidelity-check only" (spot-check they weren't hand-edited), not a
   line-by-line read. Write the manifest as a table in `docs/CODE-REVIEW-FINDINGS.md` under `## Unit 0`.
   The completion claim at the bottom of this plan is only defensible once this manifest exists and every
   file is accounted for.
2. **Baseline evidence.** Record the cycle base SHA and dirty-tree status, then run the standard gates
   once and note the result in one line each (ran → pass/fail, or couldn't-run → why):
   `tsc --noEmit`, `eslint`, `test:unit`, the contract/extraction/adapter-fidelity scripts, and
   `audit:prod`. DB/Rock/HTTP/browser evidence (int suite, migrations, live checks) is recorded
   separately and labelled as such — it needs the Rock/compose Postgres, not the DB-free local run.

Keep it to those two artifacts. No formal multi-state evidence taxonomy — a one-line "ran X → Y" per
gate is enough signal for a solo pass.

---

## The unit sequence (risk-first)

Ordered so the highest-stakes surface is covered first. **Tests and scripts are assigned to their owning
unit** (read a file's tests when you read the file) — there is no separate "read all the tests" unit.

| # | Unit | Scope (source + its tests/scripts) | ~LOC | Focus |
|---|------|-----------------------------------|------|-------|
| 1 | **Authorization core** | `src/access/*`; `scripts/verify-rbac.ts`; access.int tests | ~390 | The whole RBAC model. Per-subject-grade scoping, field-level perms, version immutability. Highest stakes. |
| 2 | **Ingest & upload boundary** | `src/ingest/*`; `endpoints/uploadBundles.ts`, `parseFormat.ts`, `previewParse.ts`; `scripts/ingest-extract-check.ts`, `contract-check.ts`, `contract-drift.ts`, `corpus-resource-check.ts`; ingest tests | ~1,600 | **Never `require()`/execute an uploaded `.js`.** Extraction `.js`→JSON, contract validation, upload authz. A prime attack surface. |
| 3 | **Auth & account endpoints** | `endpoints/`: forgotPassword, verifyEmail, requestEditing, userAssignments, markMessagesRead, respond; their http tests | ~600 | Unauthenticated / account-lifecycle surface. Enumeration + timing oracles (two fixed — confirm no third), rate limits, endpoint-shadowing trust. |
| 4 | **Export & data endpoints** | `endpoints/`: exportVersion, exportAuth, emailVersion, versionEdit, previewVersion, previewShared; their http tests | ~1,100 | `overrideAccess`-after-caller-access pattern; export authz + rate limits. Confirm each has 401/403/404 tests that actually gate. |
| 5 | **Collections + hooks** *(split 5a collections / 5b hooks)* | `src/collections/*` + `src/hooks/*`; their int tests | ~2,000 | Data model + lifecycle. Sender-stamping, Official-pointer moves, field split, versioning hooks, auth rate limit. |
| 6 | **Jobs & queue** | `src/jobs/*` + `src/lib/enqueue.ts`; bestEffortEnqueue + job tests | ~560 | The L3-03 transaction/orphan class. Confirm invariants hold and the recent tests pin them (fail against unfixed code). |
| 7 | **Generator & fidelity** | `src/generator/*` (excl. `vendor/`); `scripts/adapter-fidelity.ts`, `roundtrip-regression.ts`, `fidelity-spike.ts`, `verify-stage2-export.ts`; fidelity/adapter tests | ~950 | **Byte-fidelity is the product.** Adapter grammar subset, cache scoping/invalidation, pdf conversion. |
| 8 | **lib/ utilities** | `src/lib/*`; their unit tests | ~1,240 | Shared primitives — a bug here is systemic. sanitizeHtml allowlist, session/expiry, rate-limiter correctness, canonical-JSON stability. |
| 9 | **Frontend — server & wiring** | `src/app/(frontend)` server components, `(payload)` wiring, `src/middleware.ts`, `src/instrumentation.ts`; page/SSR tests | ~1,600 | Server-side reads under caller access, request wiring, telemetry init, the SSR data flow. |
| 10 | **Frontend — components & client** *(split 10a admin/upload / 10b export/session/misc)* | `src/components/*`; client-component tests | ~2,820 | Admin, upload, session, and export UI. Client-side auth flows, form/CSRF posture, the preview/PDF client paths. The largest area — split. |
| 11 | **Fields & editor grammar** | `src/fields/*` | ~450 | The editable-field definitions and the grammar-subset invariant (plain strings, `\n`=para, `- `=bullet, no inline markup; `phase` controlled). |
| 12 | **Config, wiring & ops** | `app/payload.config.ts`, `next.config.ts`, `eslint.config.mjs`, `vitest.setup.ts`, `playwright.config.ts`; `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`; `scripts/seed-users.ts` | ~600 | The central Payload wiring (jobs config, collection/access registration), the CI gate, the build/deploy surface. A misconfig here is a systemic hole. |
| 13 | **Migrations (spot-check)** | `src/migrations/*` — the **hand-edited** ones only (data migrations, custom `down()`) | (mostly generated) | Don't read generated schema line-by-line. Focus: data migrations, enum-narrowing `down()` (delete-before-cast), anything non-generated. |
| 14 | **Cross-cutting reconciliation** | (synthesis over units 1–13's findings + the tests already read) | — | Compact matrices, not a re-read: endpoint→authz-test matrix; role/action matrix; invariant→test matrix; CI-vs-local/Rock/browser coverage; **tests that would still pass against the known-bad implementation**. |
| 15 | **Vertical-flow pass** (capstone; Opus) | (trace whole flows across modules) | — | Boundary failures unit-by-unit misses. Trace: signup/login/recovery; upload→validate→store→export; edit→immutable version→Official pointer; export/email→queue→artifact; (session-expiry→working-draft recovery once that feature exists). |

**Sizing.** Units 5 and 10 are the large ones and carry pre-marked split points; split them *before*
starting. Units 1, 6, 11 are small and may be paired in one session if budget allows. Aim for one unit
per sitting; pairing is a bonus, never required.

---

## Findings — format & location

Findings live in **`docs/CODE-REVIEW-FINDINGS.md`** (create on first write). **Per-unit sections,
appended in chronological order** (Unit 0 first, newest at the bottom) — so "append-only" and reading
order agree. Each finding is one compact entry:

```
[F-<unit>.<n>] <severity>  <file>:<line>
  scenario:       one line — concrete input/state → wrong outcome
  classification:  live-risk | known-planned | future
  disposition:    (filled at triage) fix-PR #… | deferred | won't-fix — reason
```

- **severity:** Critical / High / Medium / Low / Nit.
- **classification** is the field that earns its keep: `live-risk` (real, currently exploitable/broken),
  `known-planned` (already on the roadmap — e.g. working-drafts, the `emailVersionArtifact` no-op — record
  once, don't re-flag), `future` (only matters at a scale/exposure we're not at).
- Keep it to those lines. No cycle-SHA/exploitability/remediation fields per finding — the unit's SHA is
  in the progress table, and remediation is decided at triage, not during the read.

**Triage (separate from the read):** after a unit is recorded, `live-risk` Critical/High → its own fix PR
with a regression test (the `CLAUDE.md` standing rule). Everything else → set `disposition` and move on.

---

## Progress

Update after every unit. `SHA` = `HEAD` when the unit was reviewed. `findings` = count appended.

| # | Unit | Status | SHA | Date | Findings |
|---|------|--------|-----|------|----------|
| 0 | Baseline & manifest | pending | — | — | — |
| 1 | Authorization core | pending | — | — | — |
| 2 | Ingest & upload boundary | pending | — | — | — |
| 3 | Auth & account endpoints | pending | — | — | — |
| 4 | Export & data endpoints | pending | — | — | — |
| 5 | Collections + hooks | pending | — | — | — |
| 6 | Jobs & queue | pending | — | — | — |
| 7 | Generator & fidelity | pending | — | — | — |
| 8 | lib/ utilities | pending | — | — | — |
| 9 | Frontend — server & wiring | pending | — | — | — |
| 10 | Frontend — components & client | pending | — | — | — |
| 11 | Fields & editor grammar | pending | — | — | — |
| 12 | Config, wiring & ops | pending | — | — | — |
| 13 | Migrations (spot-check) | pending | — | — | — |
| 14 | Cross-cutting reconciliation | pending | — | — | — |
| 15 | Vertical-flow pass | pending | — | — | — |

_A full pass = Units 0–15 `done` **and** the Unit 0 manifest accounts for every tracked file, **and** the
final `git diff <cycle-base>..HEAD` sweep reopened nothing. Re-baseline (reset to pending) only after a
substantial feature lands — e.g. working drafts — reviewing just the changed units._
