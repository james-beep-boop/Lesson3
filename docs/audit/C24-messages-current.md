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

The CI-equivalent Chromium `tests/e2e/messages.e2e.spec.ts` flow passed **3/3** in 7.3 seconds. It
covered labelled compose and recipient reply, live whole-lesson references, unavailable deleted-version
labels preserved through replies, and refusal to turn an explicitly requested unavailable version
into a whole-lesson reference. Runner hash: `ca0d2ca96c84831dcaa06e877f3fc1c62f6656e398703b5dd92bd3141a18c548`;
raw log hash: `66b7e17766f65d7855af556c4383184f924878fb1742fb9316a5704c9c58cfde`.
