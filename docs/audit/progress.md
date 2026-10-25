# Current audit coverage register

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. Sole auditor: Codex. This register covers every chunk in the current catalog progress table. No exclusions. Historical report existence does not close current-source checks.

| Chunk | Requirement group | Current evidence / next action |
|---|---|---|
| C00 | Environment, parity, baseline | Closed with qualified scope: baseline, source/release parity, manifest and target readiness recorded; unavailable tools and deployment parity remain explicit gaps. |
| C01 | Reseed drill + mail capture | Setup proof passed: C01-current-target.md; namespace/marker/reset/reseed/restore, eight verified logins, unverified refusal, captured mail and lock contention verified |
| C10 | Run all scans | Closed with qualified scope: available scans recorded; knip/jscpd/gitleaks/shellcheck/hadolint/stylelint/coverage tools unavailable in this worker. |
| C11 | Triage: dependencies | Closed with qualified scope: dependency inventory and advisory triage recorded; clean-install/changelog reachability remains unverified. |
| C12 | Triage: dead code + duplication | Closed with qualified scope: unavailable knip/jscpd prevents semantic dead-code/duplication conclusion; text inventory retained. |
| C13 | Triage: lint/types/complexity | Closed with qualified scope: production lint/types pass; strict report-only complexity/suppression triage remains limited. |
| C14 | Triage: CSS static | Closed with qualified scope: browser/style matrices and source review recorded; stylelint unavailable. |
| C15 | Triage: secrets/shell/Docker/CI | Closed with qualified scope: workflow pinning/config inventory recorded; gitleaks/shellcheck/hadolint unavailable. |
| C20 | Audit harness + surface inventory | Covered with qualified scope: surface inventory and role harness recorded; shared/deployed crawl parity remains open. |
| C21 | Expected permission matrix | Covered with qualified scope: expected role/action model reconciled in scans/matrices.md; exhaustive field expansion remains a documented gap. |
| C22 | Actual permission matrix | Covered with qualified scope: native/privacy and focused wire matrices passed; full REST field permutation remains a documented gap. |
| C23 | Auth flows | Covered with qualified scope: accepted auth findings and current endpoint/no-SMTP evidence recorded; expiry/deployment parity remains open. |
| C24 | Discussions/messages/favorites/recovery | Covered with qualified scope: discussions/messages/favorites/recovery suites and browser paths passed; broader parity remains open. |
| C30 | Version write-path analysis | Covered with qualified scope: save boundary and field/provenance checks passed; concurrent promotion/recovery attribution remains open. |
| C31 | Immutability attack run | Covered with qualified scope: races, authority, recovery, Combine, deletion ledger and cascade evidence recorded; reliable two-writer Official race remains open. |
| C40 | Ingest code review | Covered with qualified scope: parser, body limits, rollback, sinks and preview paths passed; public proxy/deployment parity remains open. |
| C41 | Malicious upload corpus | Covered with qualified scope: corpus, extractor, expansion, rollback and sink evidence passed; full CLI corpus and proxy parity remain open. |
| C42 | Export fidelity + robustness | Covered with qualified scope: export endpoint/JSON/per-document/preview selections passed; broad fidelity/load remains open. |
| C5.1 | Authorization core | Covered: authorization source review plus 21 unit and 26 integration assertions passed; exhaustive REST permutation remains in C80 qualified gaps. |
| C5.2 | Ingest & upload boundary | Covered with qualified scope: null-resource and ingest boundary suites passed; full source breadth is documented in C40/C41 gaps. |
| C5.3 | Auth, account & admin endpoints | Covered with qualified scope: current endpoint/bootstrap/admin/assignment suites passed; expiry and deployment parity remain open. |
| C5.4 | Export & data endpoints | Covered with qualified scope: export/data/teacher-key/worldwide-ID suites passed; broader source/edge coverage remains open. |
| C5.5 | Social, recovery & settings endpoints | Covered with qualified scope: settings/social/recovery evidence passed; complete endpoint parity remains open. |
| C5.6a/b… | Collections + hooks | Covered with qualified scope: subject-grade, cascade and identity hooks passed; broad collection lifecycle review remains open. |
| C5.7 | Jobs & queue | Covered with qualified scope: job stats, scheduling and enqueue checks passed; queue durability remains open. |
| C5.8 | Generator & fidelity | Covered with qualified scope: teacher-key and generator fidelity checks passed; broader generator review remains open. |
| C5.9a/b/c | lib/ utilities | Covered with qualified scope: utility slices passed 281 focused assertions; remaining lib catalog is explicitly open. |
| C5.10 | Frontend server & wiring | Covered with qualified scope: bootstrap/server-time/wiring checks passed; full SSR/component review remains open. |
| C5.11a–f | Components & client | Covered with qualified scope: 108 focused units plus Chromium/WebKit/browser matrices passed; full component and keyboard breadth remain open. |
| C5.12 | Fields & editor grammar | Covered: field/editor grammar review and 112 focused assertions passed. |
| C5.13 | Config & wiring | Covered: config/wiring review, App Router guard, and 73 focused assertions passed. |
| C5.14 | Migrations spot-check + upgrade drill | Covered with qualified scope: 36 hand-authored migrations reviewed and 104-check older-schema drill passed; historical backup shapes remain open. |
| C60 | Visual consistency crawl | Covered with qualified scope: style/menu/dialog and 84-entry role/route/width matrices passed; screenshot before/after comparison remains unavailable. |
| C61 | Accessibility | Covered with qualified scope: 28-page axe matrix had zero violations; keyboard/screen-reader/manual non-BMP contrast checks remain open. |
| C62 | Performance + load | Covered with qualified scope: repeated 4-worker HTTP probe completed 12,676 requests without errors; Lighthouse/edge saturation remains open. |
| C63 | Functional bug hunt | Covered with qualified scope: 142 Chromium passes plus 11 WebKit passes; two SMTP fixture mismatches reconciled, throttled/linkinator/session-expiry cases remain open. |
| C70 | Deployment + ops | Covered with qualified scope: operations and fault-injected restore evidence passed; deployment parity and masked cache-delete finding remain recorded. |
| C71 | Docs drift | Covered: source/live document comparison and 103 parity assertions passed; historical next-session counts remain qualified context. |
| C72 | Test-suite quality | Covered with qualified scope: focused test-quality and matrix review recorded; broad mutation/coverage tooling unavailable. |
| C80 | Cross-cutting reconciliation | Covered: endpoint, role/action, invariant/test, environment and known-bad-test matrices published. |
| C81 | Vertical-flow pass | Covered: five vertical flows traced with current evidence; explicit deployment/race/expiry gaps retained. |
| C82 | Blind cross-model review | Waived by direct operator instruction: sole-auditor substitute sweep recorded; no independent model claim. |
| C83 | Synthesis + change sweep + roadmap | Complete with qualified scope: synthesis, findings, roadmap, matrices and final change-sweep are being sealed on this branch. |

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
