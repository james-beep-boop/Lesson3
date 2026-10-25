# Current audit findings index

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`, v1.07 product source. **Partial audit.**
Accepted counts are one Medium and two Low, all previously known/deferred and locally reproduced.
The sole-auditor constraint is recorded in SUMMARY.md; independent review is not claimed.

| ID | Severity | Evidence | Known status | Recheck / disposition |
|---|---|---|---|---|
| [F-C23-001](findings/C23-auth-current.md) | Medium | Local production-stack global-budget attack, high confidence | Known | Accepted after source/control recheck; previously deferred redesign |
| [F-C23-002](findings/C23-auth-current.md) | Low | Local targeted-budget attack, high confidence | Known | Accepted after source/control recheck; previously deferred redesign |
| [F-C23-003](findings/C23-auth-current.md) | Low | Local timing and locked-message controls, high confidence | Known | Accepted after installed-source/control recheck; previously deferred redesign |

## Candidates outside accepted totals

| ID | Provisional severity | Evidence / remaining uncertainty |
|---|---|---|
| [F-C70-001](findings/C70-ops.md) | Medium | Exact helper masks deletion failure, locally reproduced; full restore/export/undo consequence and final recheck pending |

## Previously fixed and unresolved premises

Historical F-C22-001/002, F-C24-001 and F-C40-001 have fixes present in this baseline, with current
regressions/limits summarized in known-current.md. They do not enter current open-finding totals.
Deployment parity and remaining assigned attack cases are still required before broad closure.

Stored no-op field administrator mutability remains an explicit policy question, not a finding.
The first native probe's 18 status-expectation errors were harness corrections, not withdrawn bugs;
their original results and corrected valid-payload run are preserved. No candidate was withdrawn
or duplicated in this continuation. The full audit's unresolved/withdrawn register remains open
until remaining coverage and reconciliation finish.
