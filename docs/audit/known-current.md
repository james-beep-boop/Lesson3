# Current known issues and accepted tradeoffs

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. This register is partial and must be expanded
through component review. Known status is independent of severity and current exposure.

| Item | Current evidence / disposition |
|---|---|
| F-C23-001/002/003 | Explicitly deferred in DECISIONS 2026-10-25 wrap-up; all three locally reproduced on current baseline, retained as Medium/Low/Low after sole-auditor recheck |
| Historical F-C22-001 | Job-statistics API write fix present; all-role native write refusal passed current matrix; trusted scheduler regression passed baseline integration/wire suites; deployment parity pending |
| Historical F-C22-002 | Native-lock fix present; all-role REST creation refusal passed current matrix; legitimate native Take over and remaining form-state lead require expanded review |
| Historical F-C40-001 | Object.hasOwn contract fix present and unit regression passed baseline; dedicated malicious-upload sweep remains pending |
| Historical F-C24-001 | Favorite version existence/malformed-ID fixes present and current baseline wire/int cases passed. Concurrent deletion between lookup/insert can still answer 500; explicitly accepted in DECISIONS 2026-10-25 |
| Site-admin email privacy carve-out | Subject-grade administrators see non-site-admin grant candidates' addresses through the trusted Manage projection by explicit SPEC §8 decision. Native REST email remains owner/site-admin only |
| Immutable-version form-render grant | The update-access grant enables the form; the beforeChange hook rejects persisted updates. Valid direct/bulk PATCH probes reject with unchanged snapshots; not an access-control bug merely because the grant returns true |
| Stored no-op field presentation | Hidden/read-only form fields are deliberately not field-access-gated to avoid Payload array nulling. Administrator API mutability wording needs policy reconciliation before classifying a mismatch |
| Moderate esbuild advisory entries | Five npm dependency entries map to one development-server advisory. Reachability triage remains pending; no installed-package count is treated as product vulnerability count |

The current audit plan supersedes the older CODE-REVIEW-PLAN operationally; that historical plan
is retained unchanged. No previously accepted tradeoff is silently removed from risk reporting.
