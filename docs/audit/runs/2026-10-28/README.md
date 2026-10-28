# Correctness audit — 2026-10-28

**Status: wrapped up early at the operator’s request; partial audit, ready for Claude’s review.**

Start with [the results and handoff](REPORT.md). No whole-codebase completion claim.

- Source baseline: `6e75a173e822e4c4be42821b0a4af48ca457bd36` (main after #482).
- Execution rules: reviewed PR #483, head `9f85afc7c4f948c1da504c77a74c53ac1fa964b7`, plus the operator’s audit-only instruction.
- Scope: the correctness/testing handbook and catalog. No fixes, fix PRs, tag, release or deployment.
- Outputs: sanitized findings, evidence, reproduction tests, independent review and final report.
- Runtime: a new disposable local stack; existing stacks and live installations are excluded from fixture writes.
- Coordination and interpretation: Codex Sol 6.1. Scripts execute deterministic suites without model calls. Model-specific pilot/review evidence will be recorded; no savings claimed.

[Progress](progress.md) and [tracked-file manifest](manifest.csv) distinguish pending reading from actual coverage. Existing tests do not count as reading all source. Raw logs and target secrets remain outside the checkout.

Opposite-family reviews are recorded per finding. The supplemental omission check is sealed and reconciled separately; its late scheduling/model deviation does not satisfy strict C82. See method-limitations.md. Hardware/deployment-only checks remain separate from local coverage.

#483 merged after all four CI checks passed as `e9d3819539ada6cc9aadef2c84cd1794f419a3fd`. The main-change sweep contains only the reviewed audit-method documents; no product/runtime change from the fixed source. #484 remains the draft release-preparation PR. No tag or release created.

Priority accepted findings: [F-C31-001](findings/F-C31-001.md), omitted administrator-only UNIT content in a teacher save; [F-C40-001](findings/F-C40-001.md), padded identity creates duplicate plans. [F-C63-003](findings/F-C63-003.md), text lost while logout waits, is also Medium and reproduced in both browsers. [F-C63-004](findings/F-C63-004.md) records the conditional real-expiry failure and successful-capture controls, with causation limits. Lower-impact observations and unresolved leads have separate files; remaining source review and runtime work are unfinished at the operator-directed stop.
