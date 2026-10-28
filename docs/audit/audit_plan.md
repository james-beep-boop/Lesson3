# Lesson3 audit operating handbook

**Status:** planning; audit execution has not started. Revised 2026-10-22.
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

## Model allocation — cheap execution, strong judgment

Use **Haiku or Luna by default for bounded testing work**, after a pilot establishes that the
chosen model handles that task reliably. Use **Sol 6.1 or a stronger Claude model** for coordination,
test design, difficult investigation and consequential review. These are allocation defaults,
not claims that the models are interchangeable or guaranteed cheapest on every account. Verify
availability and allowance at the start of the run; record exact model/version and reasoning setting.
This allocation supersedes the older sequential plan's Sonnet/Opus defaults for this workflow.

| Work | Default allocation |
|---|---|
| Execute established suites; collect exit status, logs and artifacts | Deterministic scripts first. Haiku/Luna for bounded execution and summaries when needed. |
| Inventory files/endpoints; check documentation against a named implementation | Haiku/Luna with source citations and explicit scope. |
| Implement straightforward tests from an approved scenario and expected result; reproduce a specified defect | Haiku/Luna, within the audit's allowed test paths and disposable target. |
| Decide expected behaviour, missing scenarios, assertions and coverage priorities | Sol 6.1 or stronger Claude model, using the specification and source. |
| Investigate authorization, transaction races, data loss, recovery and cross-module failures | Strong model leads; Haiku/Luna may execute precisely specified checks. |
| Reconcile findings, assess impact and independently review important claims | Strong model, with the opposite-family review tiers below. |

Do not spend model calls repeatedly running deterministic commands or rereading unchanged logs.
A worker brief names the source SHA, relevant rules/files, fixture/target, allowed operations,
scenario, expected result, required assertions, evidence to retain and stopping conditions.
For example, an unauthorized-write test must assert both the denial response and unchanged data;
checking only the response does not establish that authorization preceded the write.

Workers escalate ambiguous requirements, unexpected writes/results, framework uncertainty and
failures crossing module boundaries. They preserve the evidence rather than weaken assertions,
change expected behaviour, reset a target or broaden their assignment to obtain a pass.
The strong coordinator resolves the question before dependent testing continues.

Pilot representative easy and difficult assignments before scaling up. Compare cheap-model work
with independent strong-model checks against the same baseline, including known defects and cases
expected to be clean. Check test validity, missed conditions, reproducibility and review/rework effort.
Retain the cheaper allocation only where it meets the required quality; escalate task classes that
do not. Do not promise a saving or set an arbitrary cheap-model percentage before measuring.

During the run, independently sample work reported **clean**, not just reported findings. Record
the selection rule, sampled scope and results. A missed material issue triggers wider checking of
that task class. Existing review tiers still apply to findings; this sampling additionally checks
for omissions. Count worker, coordination, review and rework costs together, or label cost unknown
when counters are unavailable. Cheaper execution does not establish adequate test design or coverage.

This split can run sequentially within the account/session limits above. It does not authorize
parallel subagents, additional paid capacity, new target access or product-code edits.

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
Tiered review is selected to protect reviewer capacity while retaining full challenge for serious
and security/integrity claims. The pilot must record review effort and outcomes by tier; do not infer
accuracy from agreement or withdrawal rates alone.
Exact test-target setup and unattended automation remain planning decisions; this update launches neither.
Optional calibration uses known bugs and decoy non-bugs in an authorized throwaway copy; it measures
false positives/misses on those examples, not the overall audit accuracy.

## Session prompt

    Read audit_plan.md and your assigned catalog section, pinned source rules and relevant known issues.
    Assignment <ID>; role <role>; source SHA <sha>; approved scope <scope>; private config supplied separately.
    Verify before recording candidates. Persist component/coverage notes and sanitized evidence per file/test.
    Return owned artifacts, review status, exact resume point and blockers. Follow the assigned review tier.
    Continue eligible assigned work within allowance/scope; checkpoint at limits and stop at completion.
