# Current user-assignment wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/userAssignments.http.spec.ts` suite passed **22 tests** in 17.75
seconds (exit 0) against the marked target. It exercised both assignment routes and the generic
`PATCH /api/users/:id` door. Unauthenticated, teacher, missing-freshness, stale-freshness and
unknown-user requests were refused with the expected status. Site Administrators could appoint and
vacate a subject administrator, with the prior administrator demoted to editing access; duplicate
and absent-role operations were refused. A Subject Administrator could hand administration to an
existing editor, while an ineligible target and self-removal through the generic door were refused.
The same generic door permitted ordinary editing grants and then the identical appointment after the
target gained editing access, demonstrating the amended D6a boundary rather than a blanket refusal.

Seven PostgreSQL advisory-lock cases changed the caller while each request waited: unverified,
demoted, disabled and signed-out authority paths were refused with no target role or freshness
change. The fixture teardown completed and the target lock was clear; raw output is private at
`logs/c5-user-assignments-http.log`.

This is current wire evidence for the user-assignment slice. It does not close the wider C5.3/C5.5
endpoint, source-review, deployment-parity or no-SMTP catalog.
