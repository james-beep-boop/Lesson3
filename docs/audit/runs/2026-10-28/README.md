# Correctness audit — 2026-10-28

**Status: in progress; not a completed audit.**

- Source baseline: `6e75a173e822e4c4be42821b0a4af48ca457bd36` (main after #482).
- Execution rules: reviewed PR #483, head `9f85afc7c4f948c1da504c77a74c53ac1fa964b7`, plus the operator’s audit-only instruction.
- Scope: the correctness/testing handbook and catalog. No fixes, fix PRs, tag, release or deployment.
- Outputs: sanitized findings, evidence, reproduction tests, independent review and final report.
- Runtime: a new disposable local stack; existing stacks and live installations are excluded from fixture writes.
- Coordination and interpretation: Codex Sol 6.1. Scripts execute deterministic suites without model calls. Model-specific pilot/review evidence will be recorded; no savings claimed.

[Progress](progress.md) and [tracked-file manifest](manifest.csv) distinguish pending reading from actual coverage. Existing tests do not count as reading all source. Raw logs and target secrets remain outside the checkout.

The opposite-family review and fresh blind pass remain required and pending. Findings are author-verified until the required review is recorded. Hardware/deployment-only checks will be reported separately if their prerequisites are unavailable.

#483 merged after all four CI checks passed as `e9d3819539ada6cc9aadef2c84cd1794f419a3fd`. The main-change sweep contains only the reviewed audit-method documents; no product/runtime change from the fixed source. #484 remains the draft release-preparation PR. No tag or release created.

One candidate is locally reproduced: [F-C40-001](findings/F-C40-001.md), padded sub-strand identity creates duplicate plans on re-import. Required author response remains pending.
