# Current subject-grade wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/subjectGrades.http.spec.ts` suite passed **13 tests** in 2.74 seconds
(exit 0) against the marked target. It rejected six invalid grade values (`-1`, `0`, `13`, `100`,
`1.5` and `null`) on both create and update with a readable field error, and each refusal left the
stored grade and derived display name unchanged. It accepted both numeric boundaries, 1 and 12, on
create and edit, retained numeric storage, and regenerated the derived display name correctly.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c5-subject-grades-http.log`.

This is current collection-boundary evidence only. It does not close the broader collections/hooks,
source-review, role-matrix or deployment-parity catalog.
