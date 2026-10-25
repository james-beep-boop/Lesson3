# Current assignment-provenance integration checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/int/assignmentProvenance.int.spec.ts` suite passed **3 tests** in 2.46
seconds (exit 0) against the marked target. It verified that ordinary assignment writes stamp the
authenticated grantor and time rather than forged values, that unchanged rows retain their original
grant provenance across unrelated user saves, and that self-referential `grantedBy` values remain
numeric at depth two while sibling relationships still populate.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c5-assignment-provenance-int.log`.

This is current assignment-provenance and relationship-depth evidence. It does not close the wider
authorization, utility/source-review or deployment-parity catalog.
