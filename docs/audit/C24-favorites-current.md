# Current favorites integration checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/int/favorites.int.spec.ts` suite passed **15 tests** in 2.88 seconds (exit 0)
against the marked target. It verified session-stamped ownership, own-only read/delete, duplicate
and malformed/nonexistent-version refusal, follower-star versus editor-pin behavior across Official
pointer moves, survival of a promote-and-delete-previous cascade, and direct/transitive favorite
cascades when a version, plan or user is deleted.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c24-favorites-int.log`.

This is current favorite ownership and cascade evidence. It does not close the wider discussions,
messaging, source-review or deployment-parity catalog.

The current `app/tests/int/authFavorites.int.spec.ts` suite added **11/11** integration cases for
native unlock/read-receipt authorization and favorite ownership/shape boundaries. Raw output is
private at `logs/c23-c24-lock-security-integrations.log`; broader discussions, messaging and
deployment-parity coverage remains open.
