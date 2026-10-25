# Current edit-recovery collection checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/int/editRecoveryAccess.int.spec.ts` suite passed **8 tests** in 3.02 seconds
(exit 0) against the marked target. It verified trusted capture storage and the compound
`(user, sourceVersion)` uniqueness constraint; hard-denied read, list, create, update and delete for
all roles including the row owner; and removal of recovery rows when their source version, owning
user or parent lesson plan is deleted through the version cascade.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c31-edit-recovery-access-int.log`.

This is current recovery collection-access and cascade evidence. It does not close every concurrent
restore attribution, source-review or deployment-parity case.
