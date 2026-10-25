# Current audit findings index

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`, v1.07 product source. **Complete qualified audit.**
Accepted counts are two Medium and two Low; the three authentication findings were previously
known/deferred, and F-C70-001 is a new conditional operations finding.
The sole-auditor constraint is recorded in SUMMARY.md; independent review is not claimed.

| ID | Severity | Evidence | Known status | Recheck / disposition |
|---|---|---|---|---|
| [F-C23-001](findings/C23-auth-current.md) | Medium | Local production-stack global-budget attack, high confidence | Known | Accepted after source/control recheck; previously deferred redesign |
| [F-C23-002](findings/C23-auth-current.md) | Low | Local targeted-budget attack, high confidence | Known | Accepted after source/control recheck; previously deferred redesign |
| [F-C23-003](findings/C23-auth-current.md) | Low | Local timing and locked-message controls, high confidence | Known | Accepted after installed-source/control recheck; previously deferred redesign |
| [F-C70-001](findings/C70-ops.md) | Medium | Exact helper and isolated full-stack fault run, high confidence for masked deletion failure | New | Accepted after sole-auditor full-stack recheck; conditional on retained readable cache entries |

## Candidates outside accepted totals

None currently. Remaining leads and coverage gaps are tracked in the chunk register and progress
report; they are not counted as findings.

## Previously fixed and unresolved premises

Historical F-C22-001/002, F-C24-001 and F-C40-001 have fixes present in this baseline, with current
regressions/limits summarized in known-current.md. They do not enter current open-finding totals.
Deployment parity and remaining assigned attack cases are qualified follow-ups listed in SUMMARY.md and
the matrices; they are not silently treated as covered.

Stored no-op field administrator mutability remains an explicit policy question, not a finding.
The first native probe's 18 status-expectation errors were harness corrections, not withdrawn bugs;
their original results and corrected valid-payload run are preserved. No candidate was withdrawn
or duplicated in this continuation. No unresolved candidate remains outside the accepted totals; the
remaining items are documented coverage limitations rather than findings.
