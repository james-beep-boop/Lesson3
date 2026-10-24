# Lesson3 audit operating handbook

**Status:** C00 qualified baseline; C01 ready; C20 inventory complete; C21/C22/C84 in progress; two unreviewed candidates; author/review pilot pending. Revised 2026-10-24.
Read this handbook plus only your assigned section of [the chunk catalog](catalog.md).
The [current cycle](cycle-2026-10-24.md) records the immutable baseline, execution stages and deferred checks.
Machine identities, access details, account status and raw evidence belong in private operations notes
outside Git. Public documentation uses roles: coordinator, author-a, author-b, heavy-worker, test-target.

## Purpose and authority

Audit the complete codebase and exercised system: authorization, integrity, ingest/export, logic,
dependencies, accessibility, performance, operations and documentation. Live/destructive testing
remains required scope; static review alone is a partial audit.
The audit also assesses maintainability and architecture, not only defects: identify simplifications,
unnecessary abstraction, duplicated responsibilities, awkward boundaries and better data/control flow.
Deliver concrete improvement proposals with benefits, tradeoffs and preservation/validation criteria;
clean scanner output or the absence of bugs does not complete this part of the audit.
Follow direct user instructions and existing authorizations. This handbook neither grants new access
nor revokes an existing approval. Record approved targets/operations privately; do not ask repeatedly
for routine work already authorized. Publishing documentation does not launch the audit.
Read applicable `CLAUDE.md`, `AGENTS.md` and relevant specification/decisions before execution.

## Budget and allocation

The allocation uses two Claude accounts (one Team and one Pro) and one ChatGPT Plus account.
Do not call the OpenAI subscription Pro or apply Pro-specific limits to it.
Check the actual authenticated account/workspace, included allowance and reset signals privately.
For Plus, plan for five-hour limits and possible weekly limits; use actual account reset signals.
Subscription prices do not establish capacity; do not assume either provider has more.
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
Audit tools live in a separate pinned tool environment outside the checkout (its own manifest and
lockfile, exact versions recorded); never add them to the product lockfile. A tool that must resolve
from the app (e.g. a Vitest coverage provider matching the pinned `vitest`) runs in a throwaway copy
whose lockfile change is discarded. The pilot smoke-tests every scan command before C10 relies on it.

Prefer the faster heavy-worker for builds, scans, unit/integration/HTTP/browser suites, fidelity checks
and an isolated full-stack target. Keep coordination and report review on the coordinator. Each writer
or reviewer uses its own checkout; shared compute does not mean a shared mutable test database.
Measure the worker's available resources and other workloads before setting caps. Use the pinned
container runtime even when the host Node major differs; a CLI being installed does not prove account
authentication or allowance. Deterministic tests need no additional model session or paid API.

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

The shared deployment host is for deployment parity and bounded hardware-specific checks, with a
separate disposable stack wherever fixtures are written. Heavy-worker performance is evidence for
that worker only; report hardware, caps and competing load with every performance result. Load on the
shared service host needs its own agreed window and limits. Build a separate audit stack rather than
resetting an existing development/probe stack whose ownership and purpose have not been reconciled.

## Staged acceptance

Proceed now with the application audit, container-stack initialization, synthetic-data upgrade and
restore drills, and cross-family review. A spare clean machine is not a prerequisite for this stage.
Fresh-machine installation following the school runbook, replacement-machine recovery acceptance,
and any unavailable architecture coverage remain required but deferred until suitable hardware is
available (operator estimate: about two weeks, not a deadline or an automation).

The cycle keeps each deferral's scope, prerequisite, owner role and acceptance evidence. A fresh
database or container stack on an existing worker does not satisfy a clean-machine installation or
replacement-machine recovery check. Container restore drills do not complete the separately paused
recovery-kit implementation. Report an interim application-audit milestone with these qualifications;
claim full completion only after required deferred checks and review are finished.

## First execution wave

Phase numbers group work; they are not a sequence that finishes every scan before any attack.
Run in this order, with the matching source review alongside each step:

1. C00 baseline, then C01 setup/reset proof on the approved target.
2. C20 surface inventory and C21 expected permission matrix (with C5.1).
3. C22–C24 authorization, C30–C31 versioning and C40–C41 ingest attacks (with C5.2, C5.12).
4. C82 blind pass (Codex, separate session; see Opposite-family review) runs in this wave.

Remaining scans (C10–C15), cleanup analysis and Phases 5–7 stay in scope and fill capacity, but never
delay steps 1–3. If no target is ready, run the source-only parts of steps 2–3 (C21, C30, C40, C5.1,
C5.2) and record the runtime parts as blocked with an exact next action, not as covered.

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
Record four independent fields: impact severity; evidence scope and confidence; new vs previously
known (with pointer); and review status/fix disposition. A known issue can still be a serious live
risk, and a locally reproduced defect is confirmed without deployment reproduction.
Expected behavior comes from current policy (SPEC, DECISIONS, design docs at the audit base), not
from older audit notes or assumptions; re-check a catalog premise against current source before
testing it, and correct the catalog rather than filing a finding against a stale premise.
Run existing suites once per relevant baseline; record pass/fail/not-run and reasons/gaps.
Rerun for a concrete repro, changed conditions or reliability concern, not to fill session time.
Use privacy-reviewed snippets; raw sensitive artifacts remain outside repository and public CI logs.
Retain unverified ideas as leads; separate candidate/review status from evidence maturity/fix disposition.
Templates, prior-work references, exclusions and the progress table are in the catalog.
Keep improvement proposals distinct from defect claims. Each proposal cites the current code and
cost, sketches a simpler alternative, names the invariants it must preserve and its validation, and
states why the gain justifies migration/review risk. Architectural proposals compare keeping the
current design with at least one concrete alternative; fewer lines or abstractions alone is no proof
of improvement. Reuse existing intended behavior unless a proposal explicitly requires a product
decision. Record an evidence-backed keep-as-is outcome where complexity is justified.

## Opposite-family review

Apply these user-selected tiers; security/integrity scope overrides the severity label:

- **Critical/High and every security/integrity claim:** author → opposite-family critique → original
  author recheck. Verdict per ID: confirm, amend, reject, insufficient-evidence or duplicate, with
  reasons/evidence. Author retains, revises, withdraws or records unresolved after checking objections.
- **Medium, outside those topics:** one opposite-family review pass. Return amendments/objections to
  the author for correction or an evidence-based response; unchanged confirmations need no extra round.
- **Low/Info, outside those topics:** batch review with sampling. Record batch scope, selection rule,
  selected IDs and outcomes. Cover differing categories/components; avoid author-selected easy examples.
  A materially incorrect sampled claim triggers wider review of the affected batch/pattern.
  Label unsampled items author-verified/unreviewed; never count them as cross-family confirmed.
- **Raw mechanical tool output:** retain reproducible observations without a model review cycle.
  A semantic claim about dead code, impact, reachability, severity or a fix enters the tiers above.

Reviewer independently opens relevant source/guards/callers/tests and reproduces where feasible.
Claude-origin claims receive Codex review; Codex-origin claims receive Claude review.
For disputed retentions, permit at most one targeted reviewer follow-up; then preserve unresolved
status. Agreement alone proves nothing; no majority vote, automatic capitulation or endless debate.
Only accepted claims enter confirmed totals/roadmap; list author-verified/unreviewed observations,
withdrawals, duplicates and unresolved claims separately. Evidence maturity remains a separate field.
Every accepted High/Critical needs a runnable repro spec against the unfixed baseline; reviewer may
run it remotely in a separate isolated checkout/stack within approved limits.
C82 independently searches for missed issues; new claims receive their own IDs and the same tiers.
Keep C82 genuinely blind: it runs in a fresh Codex session, in a clone at the audit base SHA with no
`docs/audit/findings/**` or review/response files, given only source, specification and assignment.
Schedule it before Codex reviews any finding in its scope. Seal its report (commit or hash it and
record that in the progress table) before any comparison; later edits go in a separate addendum.

## Completion and handoff

Stop when required coverage, existing-suite outcomes, review/response and report criteria are met,
or the user stops work. Required coverage is per chunk: before starting, the executor writes a short
chunk contract at the top of its report (mandatory checks, evidence artifacts, allowed exclusions with
reasons, exit condition); the coordinator accepts or amends it. Where exhaustive combinations are
impractical, record the selection rule and the omitted cases. LOC is a sizing aid only; judge coverage
by the invariants checked and the boundaries actually exercised. Quota/prerequisite pauses preserve state; time alone grants no authorization.
Essential unrun checks/unresolved evidence mean qualified or partial completion, never silently clean.
Final index/summary must be self-contained: revisions/environment/exclusions, component understanding,
accepted prioritized findings/repros, test results/gaps, risk rationale, withdrawals/unresolved and
next actions; plus a reviewed simplification/architecture assessment and PR-sized improvement roadmap.
Preserve original report/critique/response versions and dependencies for reproduction.
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
Tiered review is selected to protect reviewer capacity while retaining full challenge for serious
and security/integrity claims. The pilot must record review effort and outcomes by tier; do not infer
accuracy from agreement or withdrawal rates alone.
The current cycle selects a heavy-worker-first execution layout; exact isolated target setup still
needs C00–C01 proof. Unattended automation remains a later decision; this update launches no tests.
Optional calibration uses known bugs and decoy non-bugs in an authorized throwaway copy; it measures
false positives/misses on those examples, not the overall audit accuracy.

## Session prompt

    Read audit_plan.md and your assigned catalog section, pinned source rules and relevant known issues.
    Assignment <ID>; role <role>; source SHA <sha>; approved scope <scope>; private config supplied separately.
    Verify before recording candidates. Persist component/coverage notes and sanitized evidence per file/test.
    Return owned artifacts, review status, exact resume point and blockers. Follow the assigned review tier.
    Continue eligible assigned work within allowance/scope; checkpoint at limits and stop at completion.
