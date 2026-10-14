# Lesson3 audit operating handbook

**Status:** planning; audit execution has not started. Revised 2026-10-14.
Read this handbook plus only your assigned section of [the chunk catalog](catalog.md).
Machine identities, access details, account status and raw evidence belong in private operations notes
outside Git. Public documentation uses roles: coordinator, author-a, author-b, heavy-worker, test-target.

## Purpose and authority

Audit the complete codebase and exercised system: authorization, integrity, ingest/export, logic,
dependencies, accessibility, performance, operations and documentation. Live/destructive testing
remains required scope; static review alone is a partial audit.
Follow direct user instructions and existing authorizations. This handbook neither grants new access
nor revokes an existing approval. Record approved targets/operations privately; do not ask repeatedly
for routine work already authorized. Publishing documentation does not launch the audit.
Read applicable `CLAUDE.md`, `AGENTS.md` and relevant specification/decisions before execution.

## Budget and allocation

The user reports three $20/month subscriptions: two Claude Pro accounts and one ChatGPT Plus account.
Do not call the OpenAI subscription Pro or apply Pro-specific limits to it.
Check the actual authenticated account/workspace, included allowance and reset signals privately.
For Plus, plan for five-hour limits and possible weekly limits; use actual account reset signals.
Equal prices do not imply equal capacity; do not assume either provider has more.
Initial user preference: both Claude accounts author most findings; Codex reviews them and returns
critiques to the original author. Codex-origin exceptions receive Claude review.
Measure original-audit, review and response costs in a small pilot before increasing backlog.
Two author streams feed one reviewer: cap queued work by review capacity; account count alone
does not establish a throughput ratio.
Use official subscription authentication; disable paid fallback/top-ups and reject API-billing
credentials/configuration. Never purchase credits, switch to API billing or evade account limits.
At quota, persist exact resume state and pause that account; eligible independent work can continue.
Keep one model session per account, no subagent fan-out, and reserve allowance for review/responses.
[OpenAI pricing](https://learn.chatgpt.com/docs/pricing) lists Plus at $20/month; actual limits vary.

## Execution boundaries and runtime

No product-code, tracked dependency/configuration, existing-test or vendor edits. Planned outputs:
`docs/audit/**` and isolated `app/tests/audit/**`; tool installation/setup needs its authorized scope.
Keep tools, corpora, browser sessions, raw logs, credentials and operational notes outside checkout.
Use checkout-local `.git/info/exclude` for any permitted local cache; do not edit tracked `.gitignore`.
Use the project's pinned Node 24 environment and `scripts/in-deps.sh` for its dependency container.
Keep heavy builds/tests off a memory-constrained coordinator. A reviewer may execute repros remotely
in its own isolated heavy-worker checkout; it need not run them on its laptop.
Source-read access, package installation, runtime availability and authenticated clients are separate
prerequisites. SSH success alone proves none of the latter.

## Targets, isolation and prerequisites

Prefer an approved disposable full stack for destructive runtime checks, with synthetic accounts/mail
capture, isolated data and measured reset. Resolve target/setup at C00–C01; then run eligible C22–C24,
C31 and C41 promptly. Do not postpone them behind an indefinite source-only stage.
Use a later approved shared-site pass for deployment parity, proxy/body limits, headers and delivery.
Existing CI proves a native ARM production-image build and a separate full-stack check job;
it does not prove the complete stack has passed on a particular private ARM host.
Before first reset/load test, verify exact stack/volume identity, ownership, reset/restore and resource
caps. Shared-host deployments need dedicated owner-only output/config directories and separate
checkouts, Compose project names, volumes, networks and loopback-only or unpublished ports.
A unique Compose project alone does not isolate fixed ports, host bind mounts or global image tags.
Inspect resolved configuration before launch; preserve unrelated users/services and credentials.
Serialize all live work against one shared target. A reset/load run holds an atomic target-local
`mkdir` lock with run/owner metadata until all other live work is excluded; unknown stale locks
require process/outcome reconciliation. C01 implements acquisition/release for the approved target.
Set finite request/concurrency/time caps; health or monitoring failure stops load before access is lost.
Never send mail outside operator-controlled recipients/capture, or retry an uncertain mutation blindly.
Private target/account readiness is recorded privately, not as a public checklist of weaknesses.

## Small coordination and sessions

Keep one local clone per executor at the same source SHA. No shared mutable checkout/Drive sync.
Assign fixed chunks; one writer per report/status/review/response. Coordinator alone edits global
assignments/index/summary. Use existing private authenticated file transfer for sanitized handoffs;
publish temporary uploads by same-filesystem rename, and mark a packet ready last.
Keep local copies/checkpoints until acknowledged. No database, full SSH mesh or failover is required.
Start with operator-started bounded sessions; unattended automation remains a later measured decision.
Within an assignment, pursue the next concrete high-value lead; route cross-owner leads instead of
taking another worker's job. Persist after each file/range/test group; do not loop indefinitely.
Do not start a new original chunk when its review backlog is full. Revisit caps after the pilot.

## Evidence, understanding and reports

Record purpose, dependencies/entry points, intended invariants/trust boundaries, observed state and
source/test coverage per major component; coordinator consolidates `components.md` from chunk notes.
Build `manifest.md` from every tracked file: owner/chunk, covered status or explicit exclusion.
Generated/vendor exclusions still need provenance/drift/advisory/trust-boundary checks; review custom
migrations and lockfile resolution. Intention, a source reference or tool warning alone proves no bug.
Separate source-confirmed, locally reproduced, deployment-reproduced and pending evidence.
Each candidate needs ID, exact source/deployment SHA, scenario/preconditions, cited code, sanitized
repro/command/exit status, environment/fixture versions, expected/actual and impact/severity rationale.
Run existing suites once per relevant baseline; record pass/fail/not-run and reasons/gaps.
Rerun for a concrete repro, changed conditions or reliability concern, not to fill session time.
Use privacy-reviewed snippets; raw sensitive artifacts remain outside repository and public CI logs.
Retain unverified ideas as leads; separate candidate/review status from evidence maturity/fix disposition.
Templates, prior-work references, exclusions and the progress table are in the catalog.

## Opposite-family review

Preserve the user's every-finding review requirement until they explicitly choose another policy.
Claude candidate → Codex critique → original Claude recheck; reverse families for Codex-origin claims.
Reviewer independently opens relevant source/guards/callers/tests and reproduces where feasible.
Verdict per ID: confirm, amend, reject, insufficient-evidence or duplicate, with reasons/evidence.
Author responds per ID: retain, revise, withdraw, duplicate or unresolved after checking the objection.
Unchanged confirmed claims need brief acknowledgement. Revised/disputed retentions get at most one
targeted reviewer follow-up; no majority vote, confident capitulation or endless debate.
Only accepted claims enter confirmed totals/roadmap; keep withdrawals/duplicates/unresolved visible.
Batch routine findings into one review/response table with per-ID outcomes; do not silently sample.
Rerunning a scanner proves its output recurs, not semantic validity, reachability or severity.
Every accepted High/Critical needs a runnable repro spec against the unfixed baseline.
Reviewer can run that spec remotely in a separate isolated checkout/stack within approved limits.
C82 is a separately blind search for missed issues, not a replacement for finding validation.
New reviewer-discovered claims get their own ID and opposite-family review.

## Completion and handoff

Stop when required coverage, existing-suite outcomes, review/response and report criteria are met,
or the user stops work. Quota/prerequisite pauses preserve state; time alone grants no authorization.
Essential unrun checks/unresolved evidence mean qualified or partial completion, never silently clean.
Final index/summary must be self-contained: revisions/environment/exclusions, component understanding,
accepted prioritized findings/repros, test results/gaps, risk rationale, withdrawals/unresolved and
next actions. Preserve original report/critique/response versions and dependencies for reproduction.
Compare the audit base with a separately recorded current main SHA before finalizing; reopen changed
covered areas in an identified follow-up sweep. Do not confuse audit-branch HEAD with current main.
Existing Git publication permissions remain scoped: no future audit-output commit/push without a
direct user request; no history rewrite or deployment is implied. Do not put private ops into a PR.

## Why this design and what remains open

Fixed ownership and compact handoffs reduce coordination work and recurring model context.
Separate semantic findings from scanner output; cross-family challenge targets false positives,
while a blind pass targets omissions. Agreement alone proves neither correctness nor completeness.
A disposable stack can exercise app behavior without making shared infrastructure a prerequisite;
deployment-specific claims still need their own evidence. Setup failures are not product defects.
Pilot account costs rather than infer them from names or prices. Preserve the user-selected
allocation initially; change it from measured capacity, not an assumed higher OpenAI tier.
Private operations notes retain machine/readiness details. Removing them here does not erase Git
history, old PR diffs or cached copies; any history remediation requires a separate decision.
Review tiers/sampling, planted-bug calibration, exact test-target approval and unattended automation
remain proposals for user/Claude review; publishing this cleanup does not approve or execute them.
Proposed tiers: full cycles for Critical/High and all security/integrity claims, one cross-family pass
for Medium, sampled batch review for Low/Info. Unsampled claims must remain explicitly unreviewed;
scanner observations need no model cycle unless interpreted as defects. Widen review if samples fail.
Optional calibration uses known bugs and decoy non-bugs in an authorized throwaway copy; it measures
false positives/misses on those examples, not the overall audit accuracy.

## Session prompt

    Read audit_plan.md and your assigned catalog section, pinned source rules and relevant known issues.
    Assignment <ID>; role <role>; source SHA <sha>; approved scope <scope>; private config supplied separately.
    Verify before recording candidates. Persist component/coverage notes and sanitized evidence per file/test.
    Return owned artifacts, review status, exact resume point and blockers. Follow the opposite-family cycle.
    Continue eligible assigned work within allowance/scope; checkpoint at limits and stop at completion.
