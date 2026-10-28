# Two reusable codebase review workflows

Use these separately or together. They answer different questions. Keeping these instructions does
not start another audit, authorize live testing, or approve fixes, merges, releases or deployments.
Confirm the scope and existing authorizations before each run.

| Workflow | Main question | Best time to use it |
|---|---|---|
| Correctness and testing | Does the system behave correctly, enforce its rules and recover safely? | Before a significant release, after changes to permissions or stored data, or when checking operational reliability. |
| Whole-codebase simplification | Can the same behaviour be easier to understand and maintain? Is logic in the right place? | Periodically, after many small PRs have accumulated. |

Neither replaces ordinary PR review or the project's required tests. A simplification pass is not
a security audit. Passing tests alone does not prove a system correct.

## Common preparation and evidence

1. Read `AGENTS.md`, `CLAUDE.md`, relevant `SPEC.md` sections and recent relevant decisions.
2. Agree an immutable source baseline: a release tag and its full commit SHA, or a full commit SHA.
   Record it once. Use current source paths and commands rather than copying old assumptions.
3. Use a clean, isolated checkout. Record tool/runtime versions and baseline check results.
   Follow the current dependency-container instructions and machine map.
4. Account for every tracked file with an assigned review unit or an explicit exclusion and reason.
   Keep generated, vendored and historical material distinct from handwritten source.
5. Split reading into bounded units by responsibility, with their callers and relevant tests.
   Save progress after each file or test group so interrupted work can resume.
6. Keep confirmed findings separate from leads, known tradeoffs and deferred work. Cite source,
   concrete conditions, expected/actual behaviour and the evidence supporting each claim.
7. Put fixes in small separate PRs against current main. Recheck affected source since the baseline.
   Follow current regression-test rules; prove a bug-fix test fails before fixing the bug.
8. Obtain independent review before merging fixes, following the operator's current instructions.
   A prior run's merge permission or machine access is not a standing grant for another run.

Keep the main-tree summary short. Store bulky sanitized evidence on a named evidence branch and
link to its full commit SHA. Keep credentials, private operational details and raw sensitive logs
outside the repository. Record pass, fail, not run and blocked honestly; do not equate them.

## Workflow A — correctness and testing

Use the [audit handbook](audit/audit_plan.md) and [chunk catalog](audit/catalog.md) as the detailed
method. Their dated status, account allocation and prior-run approvals are historical context;
record fresh run state separately. The older [sequential review plan](CODE-REVIEW-PLAN.md) is useful
background, rather than a second checklist to execute in parallel.

- Establish baseline lint, formatting, types, unit, integration, HTTP, browser, build and fidelity
  evidence as applicable. Record unavailable environments and exactly what remains untested.
- Build the endpoint/role/action matrix from the current specification. Exercise denied requests
  as well as allowed ones, including proof that permission checks precede writes.
- Test integrity and failure paths: immutable versions, Official changes, transaction/lock races,
  queues, hostile ingest data, backup/restore, interrupted operations and update compatibility.
- Trace complete flows across modules. Check boundaries between browser, endpoint, access rules,
  hooks, database, background work and generated documents.
- Include source review, dependency/configuration checks, accessibility, operations and performance
  where the catalog calls for them. Traditional tests are one source of evidence, not the whole audit.
- Use disposable targets for fixture-writing or destructive tests. Live deployment confirmation is
  separately authorized and labelled; local results do not establish deployed behaviour.
- Follow the handbook's independent Claude/Codex review tiers. Reviewers inspect the source and
  reproduce claims where feasible. Preserve disputed or unverified findings as such.

Completion means every assigned chunk has evidence or an explicit gap, findings have dispositions,
and remaining runtime/hardware checks are stated. It does not mean every finding has been fixed.

## Workflow B — whole-codebase simplification

Review four perspectives. Project conventions constrain all four.

| Perspective | What to look for | Evidence required |
|---|---|---|
| Reuse | Duplicate logic, drifted copies, existing helpers callers should use. | Both implementations and callers; compare permissions, transactions, errors, ordering and null handling. |
| Simplicity | Unnecessary branches, awkward abstractions, redundant state, unused implementations. | Trace data and callers; identify the behaviour each proposed removal must preserve. |
| Efficiency | Repeated queries, calculations or loading; avoidable work for a concrete request or job. | Input size and before/after work counts. Distinguish measurements from estimates. |
| Altitude | Policy or logic owned by the wrong layer; local decisions that belong in a shared boundary. | Name the current owner, intended owner and affected callers. Preserve browser/server, access, transaction and lock boundaries. |

Run a mechanical first pass before reading packets: duplication detection, unused-symbol analysis
and a shared-helper inventory. Pin tools outside application dependencies and record exact commands.
Start from [app/knip.json](../app/knip.json), then verify its entry points against the new baseline.
Include framework routes, Payload registrations, migrations, CLIs, tests and dynamic loaders.

**Dead-code completion rule:** dispose of every tool hit. Distinguish unused outward exports and
types from unused implementations. Verify callers and dynamic registrations. Use temporary
unreachable-file and unused-export controls to prove the scan detects them, then remove the controls.
An unconfigured scan, or dismissing its output in bulk, does not complete the dead-code audit.

Use bounded packets with the relevant tests, mechanical leads and helper inventory attached.
Review the four perspectives independently when parallel review is authorized. Sequential review
is also possible; record which perspectives each packet received. Run a pilot before expanding.
Use a capable model for coordination, complex altitude decisions and verification; smaller models
can handle bounded searches and documentation checks if pilot spot-checks show reliable results.
Do not hard-code a previous run's model availability, budget or concurrency.

After packet review, reconcile cross-packet duplication and trace shared flows. Verify every candidate
against source before choosing fixes. Similar-looking code alone does not justify combining it.
Preserve behaviour and safeguards. Record unrelated bugs separately; do not hide feature changes
inside cleanup. A packet with no worthwhile changes is a valid result.

The [v1.10 summary](simplification/2026-10-28-c8d8f3d2/README.md) records the completed example and
its limits. The [mechanical-check record](simplification/2026-10-28-c8d8f3d2/first-pass/README.md)
records the dead-code correction. The full original plan and packet evidence are preserved at
[evidence commit bf9b8d92](https://github.com/james-beep-boop/Lesson3/tree/bf9b8d92669f4f0c3b8daab62c50043eb38cdb50/docs).
Those are evidence from one run; do not inherit their approvals or completion counts.

## Starting a future run

Copy one of these requests and fill in the baseline and scope:

> Run the correctness-and-testing workflow in docs/AUDIT-WORKFLOWS.md against [tag/full SHA].
> Scope: [whole codebase or named areas]. Start with a baseline and coverage plan. State the
> disposable runtime environment and unresolved prerequisites. Follow the audit handbook and
> catalog; retain findings and evidence separately from fixes. Leave fix PRs for independent review.

> Run the whole-codebase simplification workflow in docs/AUDIT-WORKFLOWS.md against [tag/full SHA].
> Review reuse, simplicity, efficiency and altitude, with project conventions throughout. Configure
> and prove the mechanical scans, then pilot bounded packets before scaling up. State coverage and
> limitations. Propose small behaviour-preserving fixes and leave PRs for independent review.

For either run, record whether fixing is authorized, who reviews, whether merging is authorized and
what operations are allowed. Do not infer release or deployment permission from review permission.
