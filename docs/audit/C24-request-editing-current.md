# Current request-editing wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The focused `app/tests/http/endpoints.http.spec.ts -t request-editing` selection passed **5 tests**
in 2.74 seconds (119 other tests skipped; exit 0). It covered unauthenticated and nonexistent-plan
refusal, the already-authorized conflict, teacher request creation with server-resolved Site Admin
and Subject Admin recipients, and the one-request-per-user/subject-grade daily budget.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c24-request-editing-http.log`.

This is focused teacher-first access-request evidence. It does not close the wider discussions,
messaging, recovery, source-review or deployment-parity catalog.
