# Current audit coverage register

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. Sole auditor: Codex. This register covers every chunk in the current catalog progress table. No exclusions. Historical report existence does not close current-source checks.

| Chunk | Requirement group | Current evidence / next action |
|---|---|---|
| C00 | Environment, parity, baseline | In progress: C00-baseline-current.md and scans/current-baseline.md; finish outstanding suites, component map, known issues and CLI/parity checks |
| C01 | Reseed drill + mail capture | Setup proof passed: C01-current-target.md; namespace/marker/reset/reseed/restore, eight verified logins, unverified refusal, captured mail and lock contention verified |
| C10 | Run all scans | Partial: all/prod npm advisory scans recorded; remaining scan commands and pinned tool smoke tests pending |
| C11 | Triage: dependencies | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C12 | Triage: dead code + duplication | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C13 | Triage: lint/types/complexity | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C14 | Triage: CSS static | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C15 | Triage: secrets/shell/Docker/CI | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C20 | Audit harness + surface inventory | Partial: C20-current-surface.md and scans/surface-current.md inventory actual sanitized config/routes; role login/API harness ready; Chromium/WebKit role/XHR crawl pending |
| C21 | Expected permission matrix | Partial: scans/rbac-expected-current.md rechecks current SPEC/decisions and selected policy rows; full field/endpoint expansion and no-op administrator premise pending |
| C22 | Actual permission matrix | Partial: C22-current-native.md;70 privacy/GraphQL observations,194 corrected native checks and9 immutability follow-up attempts; snapshots equal; full matrix pending |
| C23 | Auth flows | Partial: C23-current-auth.md; default targeted/global budgets and timing/lockout reproduced;3 known findings accepted(M/L/L); other auth/session/recovery cases pending |
| C24 | Discussions/messages/favorites/recovery | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C30 | Version write-path analysis | Partial: C30-current-save.md;118 real save checks,8 candidates cleaned; all write paths/concurrency/recovery/Combine reconciliation pending |
| C31 | Immutability attack run | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C40 | Ingest code review | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C41 | Malicious upload corpus | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C42 | Export fidelity + robustness | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.1 | Authorization core | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.2 | Ingest & upload boundary | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.3 | Auth, account & admin endpoints | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.4 | Export & data endpoints | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.5 | Social, recovery & settings endpoints | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.6a/b… | Collections + hooks | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.7 | Jobs & queue | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.8 | Generator & fidelity | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.9a/b/c | lib/ utilities | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.10 | Frontend server & wiring | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.11a–f | Components & client | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.12 | Fields & editor grammar | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.13 | Config & wiring | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.14 | Migrations spot-check + upgrade drill | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C60 | Visual consistency crawl | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C61 | Accessibility | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C62 | Performance + load | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C63 | Functional bug hunt | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C70 | Deployment + ops | Partial: C70-ops.md;95 mock/lock checks,104 real-stack restore checks and updater transactions passed; F-C70-001 full fault consequence/recheck pending |
| C71 | Docs drift | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C72 | Test-suite quality | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C80 | Cross-cutting reconciliation | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C81 | Vertical-flow pass | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C82 | Blind cross-model review | Independent cross-family blind pass waived by direct operator instruction; replace with a labelled sole-auditor missed-issue sweep; not yet run |
| C83 | Synthesis + change sweep + roadmap | Working SUMMARY.md and FINDINGS.md published; accepted known auth findings M/L/L; restore candidate separate; remaining coverage and final remote-main sweep pending |

## Completion gates

- Finish every mandatory catalog check or record a concrete unresolved check and qualified scope; never label an unrun check covered.
- Maintain per-file source/test evidence in the manifest and per-component purpose, dependencies, invariants and observed behavior. Split large source groups into bounded ranges.
- Preserve exact source/fixture/tool versions and command exit statuses. Keep raw runtime data privately and sanitized reproduction evidence with each candidate.
- Keep impact severity, evidence maturity/confidence, known status, review/recheck status and fix disposition separate.
- Run existing suites once per baseline; repeat only for a specific failure, changed condition or reliability concern.
- Prove reset/restore and mail capture before the first attack wave; serialize live target work and stop load on failed health/monitoring.
- Recheck each finding independently within the sole-auditor constraint, retain counterevidence, and keep incomplete candidates outside accepted totals.
- Complete endpoint/authz, role/action, invariant/test and environment matrices and end-to-end vertical-flow checks.
- Compare the immutable audit source with separately observed final remote main; reopen changed covered areas.
- Publish a self-contained final summary with accepted priorities and severity rationale, reproduction/test evidence, environment/revisions, unresolved/withdrawn/fixed items and next actions.
- Persist a private checkpoint and live process handles after each bounded group. Actual remaining subscription allowance is unknown unless the platform reports it.
