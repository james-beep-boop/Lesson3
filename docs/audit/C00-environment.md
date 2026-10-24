# C00 — Baseline and environment

## Chunk contract

- **Owner:** coordinator (Codex); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Mandatory checks:** immutable source on the heavy-worker; tracked-file manifest and component
  scaffold; bounded baseline static/unit/integration/HTTP/browser/build checks; ingest/fidelity and
  RBAC probes with fixture provenance; dependency audit outcomes; target setup and deferred gaps.
- **Artifacts:** this report, `manifest.md`, `components.md`, `known.md`, `scans/baseline.md`,
  `scans/test-results.md`; private runtime/configuration/log evidence outside Git.
- **Exclusions:** D01–D03 remain deferred as recorded in the cycle; unavailable oracle fixtures or
  account prerequisites must be named as gaps, never passed. No product edits or live fixtures.
- **Exit:** all mandatory checks have an outcome and next action for gaps; source/target evidence and
  provisional ownership are recorded. C00 does not establish full audit coverage or peer acceptance.

## Progress — 2026-10-24

Execution started. A separate heavy-worker checkout is at the pinned SHA with no tracked product
changes. The exact pinned Node container starts successfully. Existing stacks were inventoried and
left alone; the audit has its own image/volume namespace. The unmodified dependency wrapper is invoked
through an external Docker naming shim to prevent replacement of its shared image tag or cleanup of
another session's dependency volumes. This harness adaptation is recorded privately with its source.

`manifest.md` inventories all 867 baseline tracked files. `review-units.md` fixes 44 source ranges
covering 304 files/48,550 physical lines, at most 1,500 lines per unit. Actor assignment remains
pending; every file remains pending review evidence. `components.md` is an intended-boundary
scaffold, not a completed source review.
Builds/migrations, static checks, unit/integration/HTTP suites and RBAC CLI have run; see the scan records
for exact counts and qualifications. The browser run's offline-only expectations were exercised in a
matched no-SMTP complement. CLI diagnostic/oracle drift and dependency advisories remain explicit leads.

Linux ARM64 runtime was exercised on the worker. This cycle has not run an amd64 runtime or a clean
installation/recovery on either architecture; D01–D03 retain those distinctions from prior CI evidence.

No author or reviewer session has been dispatched. Account authentication/allowance and the bounded
cross-family pilot are separate from deterministic test execution. C82 remains unexposed to this
cycle's findings.

## Resume point

C01 is ready for eligible runtime chunks. The user clarified the Team/Pro allocation; author identities
were checked and allowance snapshots supplied privately. C00 remains open for final actor assignment
and subscription-only execution controls before dispatch. C20 static inventory has started; the next wave is C20/C21 with
the relevant source review, plus fresh blind C82 before finding validation; then the bounded
author/reviewer pilot. Command outcomes and CLI qualifications above are evidence, not accepted
findings. Refresh current-config oracle acceptance under C42 and triage the advisory/test-maintenance
leads through their assigned chunks. D01–D03 remain required deferred work.

One maintainability lead for C84 is already concrete: the deps helper's shared image tag and global
obsolete-volume inventory needed an external namespace shim for simultaneous isolated checkouts.
Assess an opt-in namespace with preserved defaults against keeping the current helper; do not
auto-refactor it during the audit. Any change to deletion/isolation behavior needs the full integrity
review tier and a test proving another checkout's resources survive.
