# Current audit coverage register

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. Sole auditor: Codex. This register covers every chunk in the current catalog progress table. No exclusions. Historical report existence does not close current-source checks.

| Chunk | Requirement group | Current evidence / next action |
|---|---|---|
| C00 | Environment, parity, baseline | In progress: C00-baseline-current.md and scans/current-baseline.md; finish outstanding suites, component map, known issues and CLI/parity checks |
| C01 | Reseed drill + mail capture | Setup proof passed: C01-current-target.md; namespace/marker/reset/reseed/restore, eight verified logins, unverified refusal, captured mail and lock contention verified |
| C10 | Run all scans | Partial: npm audit all/prod, npm outdated/ls, suppression/action/shell inventories recorded in scans/static-current.md; knip/jscpd/gitleaks/shellcheck/hadolint/stylelint and coverage tools unavailable |
| C11 | Triage: dependencies | Partial: 14 release-age entries and npm ls peer/resolution problems recorded; esbuild advisory triage remains in current-baseline; reachability and clean-install comparison pending |
| C12 | Triage: dead code + duplication | Pending: knip/jscpd unavailable; no semantic conclusion from text inventory |
| C13 | Triage: lint/types/complexity | Partial: production lint/typecheck pass; strict report-only lint, suppressions and complexity triage pending |
| C14 | Triage: CSS static | Pending: stylelint/CSS inventory tool unavailable; manual token/selector review pending |
| C15 | Triage: secrets/shell/Docker/CI | Partial: 14 workflow actions SHA-pinned and shell cleanup inventory recorded; gitleaks/shellcheck/hadolint unavailable, full history/config triage pending |
| C20 | Audit harness + surface inventory | Partial: C20-current-surface.md and scans/surface-current.md inventory actual sanitized config/routes; role login/API harness ready; Chromium/WebKit role/XHR crawl pending |
| C21 | Expected permission matrix | Partial: scans/rbac-expected-current.md rechecks current SPEC/decisions and selected policy rows; full field/endpoint expansion and no-op administrator premise pending |
| C22 | Actual permission matrix | Partial: C22-current-native.md;70 privacy/GraphQL observations,194 corrected native checks,9 immutability follow-up attempts and23 current auth/favorites wire checks; snapshots equal; full matrix pending |
| C23 | Auth flows | Partial: C23-current-auth.md; default targeted/global budgets and timing/lockout reproduced;3 known findings accepted(M/L/L);23 auth/favorites and10 user-search wire checks passed; no-SMTP/revoked-session/signup and deployment-parity cases pending |
| C24 | Discussions/messages/favorites/recovery | Partial: C24-current-discussions.md and C24-favorites-current.md; discussions HTTP suite 30/30, message-reference suite 12/12, favorites integration 15/15, recovery access integration 8/8 and recovery HTTP suite 35/35 passed for thread/reply, privacy, participation, forum-off, mark-read/pin/redaction, lesson references, authority waits, favorite ownership/cascades, closed recovery collection access/cascades, seven-operation recovery gates, owner-only capture/CAS, stale-token refusal, metadata cleanup, unsaved counts and Combine context; broader discussions/recovery/deployment catalog remains pending |
| C30 | Version write-path analysis | Partial: C30-current-save.md;118 real save checks,8 candidates cleaned; all write paths/concurrency/recovery/Combine reconciliation pending |
| C31 | Immutability attack run | Partial: C31-current-races.md and C31-personal-versions-current.md; two controlled HTTP save races, observed two blocked backends each, 19 pending-authority lock-wait cases, 8 native version-authority cases, 18 native editing-lock cases, fresh-versus-600-second stale-lock expiry, 35 recovery HTTP cases, 31 Combine-save/lock-wait cases, 9 save-as-new recovery cases, 18 Combine-preview cases, 5 Make Official write cases, 3 deleteSource cases, a 10-attempt deletion/fingerprint ledger probe, 1 current integration plan-lock guard and 6 personal-version projection cases; an attempted two-writer Official barrier was inconclusive and is not counted; unique monotonic semvers and correct authors; historical-row comparisons, persisted before/after vectors and cleanup passed; all-path/concurrent Official sweep remains pending |
| C40 | Ingest code review | Partial: C40-current-ingest.md; 20 full source files reviewed, selected tests read, standalone contract gate16/16, real CLI ingest entry point import/cleanup, honest and chunked body ceilings returned 413/400 on upload/preview/save-as-new; public proxy posture and dependency/fault/concurrency/sink checks pending |
| C41 | Malicious upload corpus | Partial: C41-current-corpus.md and C41-null-resources-current.md;54 files/26 groups,35 web requests,8 null-resource fidelity cases,29 static-extractor cases, one real CLI ingest import/cleanup, honest and chunked body ceilings, Chromium preview and DOCX/Mailpit sink checks passed; monitored205MiB expansion rejected; approved-taxonomy commit and actual PostgreSQL write-fault rollback passed; full CLI corpus, public proxy, editor/PDF/WebKit/concurrency checks pending |
| C42 | Export fidelity + robustness | Partial: focused export endpoint selection 6/6 passed for DOCX/PDF jobs, auth gates, poll binding and deduplication; broader export fidelity/robustness remains pending |
| C5.1 | Authorization core | Pending current-baseline execution; follow the complete catalog contract, including named invariants and exit criteria |
| C5.2 | Ingest & upload boundary | Partial: nullResources wire suite 8/8 passed for null/partial resource upload, read, save-as-new and DOCX preservation; broader ingest/upload boundary remains pending |
| C5.3 | Auth, account & admin endpoints | Partial: current firstUserBootstrap 4/4, user-assignment 22/22, subjectAdminHandover 3/3, user-admin-actions 36/36 and assignmentProvenance 3/3 integration suites passed for bootstrap, D6a assignment/admin gates, reset links, account state, caller-authority changes while waiting and server-stamped grant provenance; broader admin/account endpoint and source review remains pending |
| C5.4 | Export & data endpoints | Partial: worldwideIds 5/5, teacherKey 12/12, personalVersions 6/6 and focused export endpoint 6/6 suites passed for UID uniqueness/visibility/immutability, teacher-key role gates, DOCX/PDF archives, personal-version projections, job binding and deduplication; broader export/data endpoint review remains pending |
| C5.5 | Social, recovery & settings endpoints | Partial: C5-settings-current.md and C5-user-assignments-current.md; systemSettings 26/26 and userAssignments 22/22 passed, including advisory-lock freshness and authority waits; broader social/recovery/settings/deployment catalog pending |
| C5.6a/b… | Collections + hooks | Partial: subjectGrades wire suite 13/13 passed for invalid/boundary grade validation and derived-name invariants; broader collections/hooks review remains pending |
| C5.7 | Jobs & queue | Partial: jobStatsGlobal wire suite 10/10 passed for global read/write role gates and rejected-write immutability; broader jobs/queue review remains pending |
| C5.8 | Generator & fidelity | Partial: teacherKey wire suite 12/12 passed for DOCX/PDF archive names, exemplar isolation, attribution and role gates; broader generator/fidelity review remains pending |
| C5.9a/b/c | lib/ utilities | Partial: assignmentProvenance integration 3/3 passed for grant-stamp persistence and relationship-depth cap; broader lib/utility review remains pending |
| C5.10 | Frontend server & wiring | Partial: firstUserBootstrap 4/4 and serverTime 5/5 wire suites passed for empty-install setup, one-shot registration, post-bootstrap login-page state and server-clock response; broader frontend server/wiring review remains pending |
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
| C72 | Test-suite quality | Partial: current focused HTTP suites now include apiErrorMessages 3/3 with concrete 409/403/404 error-contract assertions; full test-quality review remains pending |
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
