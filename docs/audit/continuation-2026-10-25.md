# Audit continuation and evidence reconciliation

The audit is incomplete. This continuation preserves earlier evidence while auditing current
source. No current risk totals or full coverage claims have been established.

## Contract

- Preserve the complete handbook/catalog scope, including runtime attacks, scans, component review,
  browser checks, review/response, synthesis, and the final current-main change sweep.
- Record revisions separately. Historical product base is
  `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; historical report package is
  `3b5dc1a` on `origin/audit/2026-10-24-review`. Current source checkout is
  `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Write audit artifacts only; preserve existing product files, tests and deployments.
- Keep connection details, account identities, secrets and raw runtime evidence outside Git.
- Exit only after required checks and review have evidence, or explicitly hand off incomplete work.

## Evidence recovered

The current main branch contains the handbook, catalog and one recent review, while the audit
branch contains the earlier reports. Their absence from main does not mean the checks never ran.
The historical package's `cycle-2026-10-24.md`, `C00-environment.md`,
`scans/test-results.md` and catalog progress table were inspected through `git show`.
Historical outcomes remain reported evidence until their underlying logs and artifacts are reconciled.
They are not current-baseline test passes.

The historical package records a pinned-runtime baseline, isolated reset/mail proof, surface crawl,
partial permissions matrix, source/runtime auth and ingest work, and targeted Claude review.
Its progress table is stale relative to its later reports: C23/C24/C30/C31/C40/C41/C5.1/C5.2 reports
exist despite several corresponding rows saying `todo`. Reconstruct progress from report evidence,
not the table alone. Many remaining chunks are unperformed; no completed audit is inferred.

A pre-existing disposable target was observed running. Its ownership, active users, current source
revision and lock state have not been reconciled for this continuation. It has not been modified.
This session's executor is the heavy-worker itself; additional SSH transport is unnecessary to use
that hardware. The host Node is v22.23.4, so application commands must use the pinned Node 24 workflow.

## Historical candidates and current-source disposition

The table preserves historical IDs and original provisional ratings. Current accepted outcomes are
tracked separately in FINDINGS.md; the revalidated auth issues are known findings, not new discoveries.
Historical details remain in the original package. A source fix needs relevant regressions and
deployment evidence before broad closure.

| Historical ID | Provisional severity | Current reconciliation | Required next evidence |
|---|---|---|---|
| F-C22-001, job-statistics mutation | Medium | Fix commit `c77a50a`; current `access/generatedSurfaces.ts` rejects API updates | Current wire test, trusted-scheduler regression, review response and deployment parity |
| F-C22-002, forged editing lock | Low | Fix commit `472d5f2`; current `access/lockedDocuments.ts` restricts create/update/delete | Current role/target matrix, legitimate takeover and migration tests; review response |
| F-C23-001, shared auth-budget exhaustion | Medium | Current default global-budget reproduction passed; accepted known Medium, deferred; edge parity pending | Current source/control recheck complete under sole-auditor waiver; shared deployment edge posture pending |
| F-C23-002, targeted auth-budget exhaustion | Low | Current targeted-budget reproduction passed; accepted known Low, deferred | Current source/control recheck complete under sole-auditor waiver; remaining auth coverage pending |
| F-C23-003, account enumeration | Low | Current paired timing and locked-message reproduction passed; accepted known Low, deferred | Cookie/deployment checks and remaining auth coverage pending; see findings/C23-auth-current.md |
| F-C24-001, missing favorite version returns 500 | Info | Fix commit `470ebed` and follow-up `c6be564`; current collection uses `requireReadableFavoriteVersion` | Missing/malformed/deleted version cases and concurrent deletion behavior |
| F-C40-001, inherited contract keys accepted | Low | Fix commit `470ebed`; current contract walker uses `Object.hasOwn` | Current direct and upload regression checks, fingerprint boundary review |

## Coverage and continuation

[The manifest](manifest-current.md) inventories all 888 tracked files at current source, with
provisional routing and no assumed coverage. [The opening change inventory](scans/change-sweep-2026-10-25.md)
records all 62 paths changed since the historical product baseline, including 28 under `app/src`.
These changes reopen authorization, native locks, ingest, favorites, dependencies, UI and migration
checks. This opening comparison does not replace the final remote-main sweep.

The operator confirmed: current release on main, no exclusions, no Spark workload limitations,
audit only, and publication to GitHub under `docs/audit`. The repository calls this release **v1.07**;
the operator wrote 1.0.7. The v1.07 tag resolves to `69dd7d2ec1f3d8b9e78bff8c7f0892cdf41a2234`;
there are no product-source changes between that release and the selected current-main SHA.
Remote main was independently checked with `git ls-remote` and matched the selected baseline.

The operator explicitly selected a sole Codex auditor with no Claude. This supersedes the handbook's
two-author allocation, opposite-family reviews and cross-family blind-pass requirements for this
run. Do not claim those forms of independent review. A separate self-recheck and missed-issue sweep
remain useful, with their limits labelled. No subagents will be used.

Runtime setup/tests are authorized. Preserve unrelated services and use a dedicated target and
namespace. GitHub publication is now expressly authorized; no product fixes are authorized.
ChatGPT subscription authentication was verified. The login-status CLI exposes no remaining
allowance; do not invent a quota estimate. Save progress after every bounded group and retain
process handles and exact resume commands for interruption or account-limit recovery.

Next actions:

1. Reconcile historical review responses and actual chunk outcomes, retaining original revisions.
2. Continue current-source component review and construct the complete requirements/evidence register.
3. Establish a new isolated current-baseline target using the handbook's lock, reset and mail gates.
   A private Docker naming shim isolates dependency images/volumes while retaining the pinned wrapper.
4. Perform documented sole-auditor rechecks and a separate missed-issue sweep; do not label this
   session or its conclusions as blind or independently cross-family reviewed.
5. Produce prioritized `FINDINGS.md` and `SUMMARY.md` with separate accepted, unreviewed, fixed,
   unresolved and unrun sections, after completing the required coverage and review cycle.

## Subsequent current-baseline evidence

See C20-current-surface.md, C22-current-native.md, C23-current-auth.md and C30-current-save.md. The prior authentication findings are revalidated and accepted with sole-auditor rechecks, not newly discovered or independently reviewed in this cycle. The separate normal restore-stack suite passed 104 checks and tore down its target; the subsequent 107/107 fault-injected full-stack run accepted F-C70-001 for the masked deletion failure and live restart consequence. A wrong-old-document claim still requires a retained valid artifact with a colliding restored ID and is not made.

The CI-equivalent Chromium Manage run reached 37/38 tests against the Mailpit target because its
hard-coded no-SMTP `Awaiting approval` assertion met the correctly rendered `Unverified` state. A
temporary app process with `SMTP_HOST` explicitly empty then passed the same flow **38/38**, including
the approval branch. This confirms both source contracts; the Mailpit mismatch remains recorded as a
test-portability gap rather than a product finding. See C511-client-current.md for exact runner and
raw-log hashes.


Current C40/C41 evidence is in their named reports:35 HTTP requests across26 prepared upload groups,
29 static-extractor cases, contract CLI16/16, plus a narrowly repeated monitored expansion case.
All expected checks passed and original lesson/taxonomy documents matched after cleanup. Five
transport/encoding/archive observations are separated from accepted findings; CRC omission is an
explicit documented decision. Runtime helper source copies/hashes were captured before formatting.
The first resource sampler was too late; only the labelled follow-up has in-flight samples.

Quota note update: the current session's token-count event now exposes an actual primary allowance
window, last observed14% used of a10,080-minute window. This supersedes the earlier CLI-only
unknown-allowance observation, does not measure all possible limits, and is tracked privately.
No API billing fallback is authorized or used. Continue after bounded checkpoints.
