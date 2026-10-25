# Current personal-version projection checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/int/personalVersions.int.spec.ts` suite passed **6 tests** in 2.63 seconds
(exit 0) against the marked target. It verified that each caller sees only their own saved versions,
that a Subject Administrator's delete/edit actions follow the administered and edited subject-grade
scopes, that an own Official version is listed and marked but never deletable, and that an editing
Teacher's authored candidate is deletable. Site Administrators see their own saves but not authorless
uploads, while a plain Teacher with no saves sees an empty list.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c31-personal-versions-int.log`.

This is current projection and deletion-scope evidence. It does not close the broader personal-version
source review, all-path deletion ledger or deployment-parity catalog.
