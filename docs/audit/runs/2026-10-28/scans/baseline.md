# C00 baseline — audit contract and evidence

Source: `6e75a173e822e4c4be42821b0a4af48ca457bd36`. Contract: establish immutable source, tracked-file inventory, isolated runtime identity and ordinary baseline outcomes. Exit requires recording every baseline result or precise outstanding work, not finding zero defects.

| Check | Outcome |
|---|---|
| Production builder and app images | Passed from the fixed source; audit-specific image names. |
| Native ARM | Local build is ARM; PR #483 native_arm is green. No claim about another machine. |
| Unit | 1,976 passed across 204 files. |
| Integration | 355 passed. Test DB is separate from the migration-only app DB. |
| HTTP | Initial 490 passed, six PDF fixture permission failures and two skips. After correcting audit-worktree public fixture permissions, all 122 runnable endpoint-file cases passed. Combined initial outcome:496 runnable cases passed; two no-SMTP cases were correctly skipped in the SMTP-enabled mode. A targeted no-SMTP repeat later passed both:498 distinct HTTP cases exercised across the appropriate modes, not one498-case run in a single configuration. |
| Browser | SMTP-enabled Chromium: 151 passed, two no-email expectation mismatches, one offline skip. With SMTP disabled, both failed cases and the previously skipped offline journey passed (three targeted cases, zero retries). WebKit:150 passed, four failed (navigation timing and the reproduced title-search fixture dependency). Independent search and uncertain-reply recovery cases passed both engines; Chromium keyboard journey passed. WebKit keyboard focus remains unresolved. |
| Typecheck / ESLint / formatting | Passed before adding isolated audit harnesses. |
| Contract probe | Passed. |
| Eight operation script suites | Readiness, deploy sidecar, backup status, restore branches, release bundle, release manifests, online update and vendor sync all passed. |
| Live replacement restore | 135 passed, zero failed; setup/recovery sub-suite 59 passed. |
| Dependency advisories | Zero high/critical; five moderate and two low package entries, awaiting reachability/disposition review. |

An initial integration invocation used an incorrectly constructed private DB connection string. It was stopped and corrected before the successful full run. This was audit setup, not product failure. No tracked environment file or implementation was changed.

The manifest has 947 baseline paths. Pending source review is not counted as covered because existing tests passed. Raw logs, synthetic credentials, resolved target configuration and Docker output remain private.
