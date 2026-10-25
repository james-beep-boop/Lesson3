# Current messaging integration checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/int/messages.int.spec.ts` suite passed **11 tests** in 2.93 seconds (exit 0)
against the marked target. It verified session-stamped sender ownership, sender/recipient-only
readability, immutable message rows, first-unread ping behavior and recipient/sender budgets,
best-effort ping enqueue failure without message rollback, reference validation and user-deletion
cascades.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c24-messages-int.log`.

This is current message ownership, budget and cascade evidence. It does not close the wider
discussions, no-SMTP, source-review or deployment-parity catalog.
