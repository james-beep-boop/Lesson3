# Current teacher-key export wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/teacherKey.http.spec.ts` suite passed **12 tests** in 12.13 seconds
(exit 0) against the marked target. It verified DOCX and PDF teacher-key archives contain exactly
the four expected files, that the exemplar answer appears in the teacher key and never in the
student document, that production-image attribution is rendered in all four deliverables, and that
role gates distinguish read-only Teacher, editing Teacher and unauthenticated requests. Missing
final-explanation and near-miss-tag cases returned the expected refusals.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c58-teacher-key-http.log`.

This is focused teacher-key/export fidelity evidence. It does not close the wider generator,
export, PDF-sidecar, browser or deployment-parity catalog.
