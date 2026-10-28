# Correctness audit — results for Claude's review

**Partial audit, stopped at the operator's request to preserve the remaining model allowance.** This report closes the current run; it does not declare the full catalog complete. No implementation fixes, existing-test edits, dependency changes, tag, release or deployment are included.

Audited product source: `6e75a173e822e4c4be42821b0a4af48ca457bd36` (main after #482). Final fetched main: `e9d3819539ada6cc9aadef2c84cd1794f419a3fd` (#483). The intervening changes are documentation only; the product/runtime paths are unchanged. #484 remains draft release preparation and was not merged. Superseded remote planning branches `claude/project-thread-u7pwgf` and `docs/whole-codebase-simplification` were deleted. Main and the original checkout were brought up to date without rewriting history.

## What matters most

Four Medium scenarios were accepted, with the two expiry scenarios potentially sharing a root cause. They should not be counted as four proven independent defects.

| Finding | Observed failure | Evidence and limits |
|---|---|---|
| [F-C63-003](findings/F-C63-003.md) | Text accepted while asynchronous logout waits disappears without a confirmed capture. | Native form, real pointer/keyboard input, Chromium and WebKit; controlled-clock focus-backstop isolation. Rechecking an empty registry is not by itself a sufficient fix. |
| [F-C63-004](findings/F-C63-004.md) | Genuine session expiry clears accepted text when refresh and capture are unavailable. | Both browsers, actual short-lived native token and real elapsed expiry; old token rejected. Confirmed-capture controls pass. Exact native-versus-backstop callback ownership is source-inferred, not an instrumented call stack. Historical L3-13 overlaps this broad hazard. |
| [F-C31-001](findings/F-C31-001.md) | A scoped teacher save that omits UNIT creates a candidate missing administrator-owned content. | Real save-as-new POST succeeds; full original snapshot remains unchanged. Ordinary UI includes UNIT; a crafted/incomplete request triggers this. |
| [F-C40-001](findings/F-C40-001.md) | Padded sub-strand ID creates duplicate plans on repeated import. | Trusted importer trims identity lookup but stores the raw value. Plain-ID control correctly creates subsequent versions of one plan. No source overwrite or unauthenticated import is claimed. |

No High/Critical finding has been accepted. That is a result of the work completed, not assurance about unreviewed scope. Claude should scrutinize the expiry assertions and spec interpretation first, then the two content/identity reproductions. Each finding links its own critique/response evidence; review roles and limitations are recorded rather than equated with independent execution.

## Lower-impact accepted findings

All are Low. Their individual records distinguish runtime evidence from source mapping and policy ambiguity.

| Finding | Result |
|---|---|
| [F-C23-001](findings/F-C23-001.md) | All-space signup password can create an approved account that the login blank check refuses. |
| [F-C31-002](findings/F-C31-002.md) | Null members in five submitted content arrays return500; unchanged-row checks confirm fail-closed behavior. |
| [F-C40-002](findings/F-C40-002.md) | A201-character subject is offered for approval in preview, then refused by the approval parser without writes. |
| [F-C42-001](findings/F-C42-001.md) | Concurrent cold exports can return misleading400s because the installed adapter strips the driver error used for coalescing. Six inserts were observed blocked before barrier release; two jobs remain, no duplicate jobs or changed source. Ordinary concurrent export/download controls pass. |
| [F-C42-002](findings/F-C42-002.md) | A timeout while reading the converter's response body escapes its converter-error wrapper. Actual Node HTTP fault-server probe; native preview500/502 mapping is source-traced, not separately fault-injected. |
| [F-C63-001](findings/F-C63-001.md) | Deleting the recorded human Official actor can make the notice describe a system update. |
| [F-C63-002](findings/F-C63-002.md) | Literal restore-marker text can fool the narrow diff-annotation presentation. |
| [F-C63-005](findings/F-C63-005.md) | Consecutive link insertion uses the wrong visible location in both browsers, differently in each. Event-order/root-cause certainty is qualified. |
| [F-C63-006](findings/F-C63-006.md) | Copy reset link throws on supported plain HTTP origins without Clipboard API; the selectable input remains, but fallback instructions do not appear. |
| [F-C71-001](findings/F-C71-001.md) | SPEC's older-content warning omits the no-manifest qualifier; implementation follows the intended rule. |
| [F-C71-002](findings/F-C71-002.md) | “Never editable” wording conflicts with administrator save behavior for certain fields; unresolved policy boundary, no privilege escalation established. |
| [F-C71-003](findings/F-C71-003.md) | Living external-dependency document has a stale current pin/file count; authoritative provenance and actual vendor bytes agree. |
| [F-C72-001](findings/F-C72-001.md) | Existing title-search test relies on another test's fixture. Independent own-data search passes both browsers. |

## Evidence that passed

All runtime testing used disposable local stacks, synthetic identities and captured mail. No live installation received fixture writes. Pinned Node24.22.1, installed Payload3.92.0 source, real PostgreSQL, native production images and two browser engines were used; exact versions/setup evidence are in [baseline](scans/baseline.md). Tests retained their original assertions. Intentionally failing audit reproductions are isolated from normal suites.

- **1,976 unit tests and355 integration tests passed.** Integration coverage was repeated serially after discarding an overlapping run.
- **498 distinct HTTP cases passed across suitable SMTP modes.** This is not a single498-case run: the initial run had fixture-permission failures, the endpoint subset was repeated after fixing local fixture permissions, and two no-SMTP cases passed separately.
- Production build, contract check, baseline types/lint/format; eight operation-script suites; **135 restore checks**, including59 setup/recovery checks, passed.
- A supplemental immutable-write/privacy matrix supplied38 checks; native read matrix **162/162**; native mail/reset/session/CSRF journey **16** checks. Neither constitutes complete endpoint/field-matrix reconciliation.
- **16 bounded malicious-input cases** passed, including parse-never-execute and actual expansion/count limits. Stored img/onerror text stayed inert across sampled native writes and display surfaces in both engines; this is one payload family, not comprehensive XSS assurance.
- Chromium/WebKit each crawled **84 role/route/viewport states** with zero selected four-tag WCAG axe violations. Three visual samples were opened. Chromium's keyboard journey passed; the WebKit keyboard issue remains unresolved. Experimental/best-practice accessibility findings are not declared clean.
- Bounded read-load probe: **7,680 successful responses**, no observed errors/timeouts or missed health checks. Tiny warm synthetic corpus; not school-capacity or saturation proof. Five authenticated mobile Lighthouse pages scored100/100/93/100/100 for performance.
- Representative official **v1.10→baseline upgrade** preserved canonical row hashes/counts across33 tables and passed7 old/12 new native checks. This does not cover every historical upgrade or physical commissioning.

## Evidence that must not be called a pass

Strict DOCX fidelity gates failed against copyright wording. Twelve separately qualified DOCX comparisons normalize only the already approved copyright change and existing related-topic note exclusion. Four vendored library files match authoritative upstream bytes. Twenty-four actual PDF conversions produced220 paired pages per side:117 raster pairs identical,103 different. This is diagnostic evidence, **not strict PDF fidelity success**. See [fidelity](scans/fidelity.md); no golden files were changed.

The prior audit PR CI run stopped at formatting in an audit browser test; its native ARM and restore jobs passed. Formatting is corrected in this checkpoint; fresh CI is required. These CI results are separate from the completed product-baseline runs.

## Coverage and method limits

The manifest contains947 baseline tracked paths. **185 of317 eligible source packets returned**;39 historical-ledger-only packets are excluded from broad reading, for356 indexed packets total. Source-author ranges span535 paths, including partial reads. Returned reports are observations, not coordinator acceptance. Important author claims were checked against real callers; [reconciliation](reconciliation.md) records rejected hypotheses and remaining leads. [Components](components.md), [known decisions](known.md), [progress](progress.md) and [manifest](manifest.csv) retain incomplete boundaries.

Sol6.1 coordinated and checked consequential claims. Bounded source reports and several author responses used subscription-authenticated Haiku5.5; Sonnet5.5 supplied difficult/opposite-family reviews and a sealed supplemental omission search. Deterministic scripts ran established suites. Model calls were sequential with no subagents or paid fallback. No savings or actual subscription charge is inferred from CLI dollar estimates.

**Strict C82 was not met:** the supplemental pass was late and used Sonnet rather than the prescribed fresh Codex session. Its output was sealed before comparison, but this cannot repair the ordering/model requirement. Some chunk contracts were recorded after execution. A tool-free reviewer once claimed searches it did not run; the original, challenge and correction are retained and those searches receive no credit. See [method qualifications](method-limitations.md).

Static scans were executed and summarized, including real negative controls for unused-code and coverage tools; all hits are not bugs. Dependency review found zero high/critical advisories and retained the moderate/low entries, pin/override compatibility limits and official release references. Full container/action freshness and override-removal experiments remain unfinished.

## What remains for a later audit session

1. Complete132 eligible source packets and coordinator reconciliation of outstanding candidates; finish unused-symbol and static-hit triage. Author reports afterP080 have not received a complete coordinator disposition.
2. Complete the expected endpoint/field permission matrix, native write-path/SQL/script reconciliation, and broader ownership/moderation/session edge scenarios.
3. Resolve the WebKit keyboard gap, broaden dynamic-panel/text/accessibility coverage, and explain strict fidelity differences before any clean-fidelity claim.
4. Complete C70 operations source review, central wiring/capstone checks and the reproducible all-scans wrapper. Existing script and restore passes remain valid but are not substitutes for that review.
5. A future correctly scheduled blind audit and separately authorized deployment/hardware checks remain distinct. No physical amd64 wipe/reinstall, production proxy/TLS parity or actual two-hour session outage was tested.

Claude's immediate task is review, **not merge or fix**: challenge the important findings and their evidence, identify overclaims, and confirm the useful findings for a separately authorized implementation phase. No new release is requested by this audit.

Final audit-artifact checks: TypeScript, ESLint for tests/audit, full repository app format:check, git diff --check and separate redacted secret scans of audit tests/reports all passed. Only the permitted audit-test/report paths changed.
