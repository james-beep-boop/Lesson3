# Sequential full-codebase code review — Pro-plan-budgeted

**Purpose.** A thorough, in-depth read of the whole Lesson3 codebase for correctness, security, and
adherence to the project's own invariants — structured so it can be done **one small unit at a time**,
**sequentially**, and **resumed across sessions**. It is deliberately shaped for the **$20/month Claude
Pro plan**: no unit needs the whole codebase in context at once, and running into a token/context limit
mid-way is harmless — you finish the current unit, append its findings to the ledger, and the next
session picks up at the next unit.

This is **not** the old "five-phase audit plan" (that was build-time hardening, complete through Phase 4,
recorded in `DECISIONS.md`). Nor is it `ARES-canonical-json-audit.md` (the JSON corpus). This is a
standing, repeatable **code** review of the shipped source.

> **Status:** not started. See the progress table at the bottom — update it after every unit.

---

## Why sequential (the plan's whole point)

A single "review everything" pass blows the context budget and, worse, loses all its work if it dies
mid-way. Instead:

- **One unit per session (or per part-session).** Each unit is ~500–1,500 LOC of source plus its tests
  — small enough to read closely and still have room to write findings.
- **Read-only.** A review unit does not edit code. It produces *findings*. Fixes are separate, later
  PRs so a review session can't half-apply a change and leave the tree dirty (the failure mode we hit
  before). Small, obviously-safe fixes may be spun off as their own PR *after* the unit is recorded —
  never folded into the review pass.
- **Verify before recording.** Every finding is checked against the actual code (grep/read the cited
  lines) before it goes in the ledger. No speculation, no "this might" — if it isn't confirmed at a
  `file:line`, it doesn't get written as a finding. A hunch worth chasing goes under "leads to verify",
  not "findings".
- **Inline, not fanned-out.** Do the reading yourself in the session. Do **not** spawn parallel review
  subagents for this — that is the fastest way to burn the Pro budget. (`/simplify`'s 4-agent fan-out is
  for a small diff, not a whole-module read.)
- **Append-only ledger.** Findings live in `docs/CODE-REVIEW-FINDINGS.md` (create on first finding),
  newest unit on top, each finding tagged with unit, severity, and `file:line`. The progress table here
  records which units are done. Losing a session mid-unit costs at most that one unit's re-read.

## What each unit checks (the lens)

For every file in a unit, in this order of stakes:

1. **Security / authorization.** Does access control actually gate before any `overrideAccess: true`
   write? (SPEC §5, `CLAUDE.md` authorization model.) Every custom endpoint should have wire-level
   401/403/404 tests — confirm they exist and actually exercise the gate. Look for enumeration oracles,
   timing side-channels, missing rate limits, PII in logs/URLs, CSRF posture on state-changing routes.
2. **Correctness & invariants.** The project's non-negotiables: **byte-fidelity** (the editor grammar
   stays a subset of the generator's input grammar); **whole-bundle immutable versioning** (first =
   1.0.0, one Official pointer, snapshots never mutated); **structured JSON as native fields**, never a
   blob; **never `require()` an uploaded `.js`**. Plus ordinary correctness: transaction handling (the
   L3-03 class — a swallowed error must not discard a write), null/undefined, race conditions,
   error-vs-benign-no-op classification.
3. **Robustness.** Failure paths, retries, rate-limit bounds, unbounded reads/pagination at scale.
4. **Clarity / drift.** Comments that contradict the code (we've hit several); stale references.

Cross-reference `SPEC.md` for any architectural judgement and `DECISIONS.md` for why something is the
way it is *before* flagging it — many "smells" are documented deliberate choices.

## How to run one unit (the loop)

1. Open this file, pick the next `pending` unit from the table.
2. Mark it `in-progress` (commit that one-line change, so a crash leaves a breadcrumb).
3. Read every file in the unit's scope, plus the tests that cover them. Use `grep`/`Read` on bounded
   ranges; don't slurp whole giant files if you only need a function.
4. For each candidate finding: verify at the cited `file:line`, then append to
   `docs/CODE-REVIEW-FINDINGS.md` under a `## Unit N — <name> (<date>)` heading, with severity
   (Critical / High / Medium / Low / Nit) and a one-line failure scenario.
5. Mark the unit `done` in the table with the date and a finding count. Commit (docs-only PR — `main` is
   protected).
6. Stop, or continue to the next unit if budget remains. Never leave a unit half-recorded.

Fixes: after a unit is recorded, triage its findings. Critical/High → their own fix PR with a
regression test (the standing rule from `CLAUDE.md`). Medium/Low → batch or defer; note the decision in
the ledger. The review pass itself stays read-only.

---

## The unit sequence (risk-first)

Ordered so the highest-stakes surface is reviewed first — if the review is only ever partly done, the
most important parts are covered.

| # | Unit | Scope (files) | ~LOC | Why here / focus |
|---|------|---------------|------|------------------|
| 1 | **Authorization core** | `src/access/*` (bundle, versioning, versionImmutability, index) | ~390 | The whole RBAC model in one place. Per-subject-grade scoping, field-level perms, version immutability. Highest stakes. |
| 2 | **Auth & account endpoints** | `src/endpoints/`: forgotPassword, verifyEmail, requestEditing, userAssignments, markMessagesRead, respond | ~600 | Unauthenticated / account-lifecycle surface. Enumeration + timing oracles (we've fixed two here — confirm no third), rate limits, the endpoint-shadowing trust. |
| 3 | **Export & data endpoints** | `src/endpoints/`: exportVersion, exportAuth, emailVersion, versionEdit, uploadBundles, preview*, parseFormat | ~1,100 | `overrideAccess`-after-caller-access pattern; the ingest path (never execute uploaded `.js`); export authz + rate limits. Confirm each has 401/403/404 tests. |
| 4 | **Collections + hooks** | `src/collections/*` + `src/hooks/*` | ~2,000 | Data model + lifecycle. Sender-stamping, official-pointer moves, field split, versioning hooks, auth rate limit. Split into 4a (collections) / 4b (hooks) if a session runs short. |
| 5 | **Jobs & queue** | `src/jobs/*` + `src/lib/enqueue.ts` | ~560 | The L3-03 transaction/orphan class we've been hardening. Confirm the invariants hold and the recently-added tests pin them. |
| 6 | **Generator & fidelity** | `src/generator/*` (adapter, index, exportArtifacts, docxToPdf, caches, renderVersion, generateForVersion) | ~950 | Byte-fidelity is the product. Adapter grammar subset, cache scoping/invalidation, pdf conversion. Cross-ref the fidelity scripts. |
| 7 | **lib/ utilities** | `src/lib/*` (rateLimit, sanitizeHtml, session, readBundle, semver, canonicalJson, env, errorTracking, …) | ~1,240 | Shared primitives — a bug here is systemic. sanitizeHtml allowlist, session/expiry, rate-limiter correctness, canonical JSON stability. |
| 8 | **Frontend — data & server** | `src/app/(frontend)/` server components + `(payload)` wiring: lessons/[id], messages, the read-access wrappers | ~1,400 | Server-side reads under caller access, the export client driver, SSR data flow. Split by route group if needed. |
| 9 | **Frontend — auth pages & client** | `src/app/(frontend)/`: login, signup, verify-email, forgot/reset-password, guide + client components/forms | ~1,300 | Client-side auth flows, form submission/CSRF, the preview/PDF client paths. |
| 10 | **Fields & editor grammar** | `src/fields/*` | ~450 | The editable-field definitions. The grammar-subset invariant (plain strings, `\n`=para, `- `=bullet, no inline markup; `phase` controlled). |
| 11 | **Migrations (spot-check)** | `src/migrations/*` — the **hand-edited** ones (data migrations, custom `down()`) | ~2,280 (but mostly generated) | Don't read generated schema line-by-line. Focus: data migrations, enum-narrowing `down()` (the delete-before-cast pattern), anything non-generated. |
| 12 | **Test adequacy** | `tests/**` | ~7,470 | Not correctness — *coverage*. Do the authz tests actually gate (not vacuous)? Are the load-bearing invariants pinned with tests that fail against the unfixed code? Gaps → new-test tickets. |

**Sizing note.** Units 4, 8, 9 are the largest; each has a documented split point. Units 1, 5, 10 are
small and could be paired in one session if budget allows. Aim for one unit per sitting; pairing is a
bonus, never a requirement.

---

## Progress

Update after every unit. `date` = when completed. `findings` = count appended to the ledger.

| # | Unit | Status | Date | Findings |
|---|------|--------|------|----------|
| 1 | Authorization core | pending | — | — |
| 2 | Auth & account endpoints | pending | — | — |
| 3 | Export & data endpoints | pending | — | — |
| 4 | Collections + hooks | pending | — | — |
| 5 | Jobs & queue | pending | — | — |
| 6 | Generator & fidelity | pending | — | — |
| 7 | lib/ utilities | pending | — | — |
| 8 | Frontend — data & server | pending | — | — |
| 9 | Frontend — auth pages & client | pending | — | — |
| 10 | Fields & editor grammar | pending | — | — |
| 11 | Migrations (spot-check) | pending | — | — |
| 12 | Test adequacy | pending | — | — |

_When all 12 are `done`, the codebase has had one full sequential pass. Re-baseline (reset to pending)
only after a substantial feature lands — e.g. working drafts — reviewing just the changed units._
