# Current global-job and API-error wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/jobStatsGlobal.http.spec.ts` suite passed **10 tests** in 2.64 seconds
(exit 0). It refused writes to the global job-statistics document for every role and unauthenticated
call, allowed only the Site Administrator to read it, and left the global unchanged after rejected
writes.

The current `app/tests/http/apiErrorMessages.http.spec.ts` suite passed **3 tests** in 2.44 seconds
(exit 0). It verified that representative 409, 403 and 404 responses identify the actual conflict,
authorization reason or missing resource instead of returning an opaque `unknown` message.

Both fixture teardowns completed and the target lock was clear. Raw output is private at
`logs/c57-job-stats-global-http.log` and `logs/c72-api-error-messages-http.log`.

This is focused global-job and error-contract evidence. It does not close the wider jobs/queue,
error taxonomy, source-review or deployment-parity catalog.
