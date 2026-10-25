# C24 Current discussions and participation wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/discussions.http.spec.ts` suite passed **30 tests** in 13.94 seconds
(exit 0). It covered topic/reply creation and server stamping, submission-key replay, immutable
REST update/delete boundaries, whole-thread deletion, authority revocation while delete and pin
waited on a topic lock, expanded-read privacy, per-user participation, forum-off gates,
mark-read/pin/redaction permissions and idempotence, lesson-reference picker access, and nav-state
read/unread behavior. Fixture teardown restored the forum settings and target state; raw output is
private at `logs/c24-discussions-http.log`.

This closes the current discussions wire slice only. Broader messages, favorites, recovery,
deployment parity and remaining C24 catalog cases remain open.

The current `app/tests/http/messageReferences.http.spec.ts` suite passed **12 tests** in 2.92
seconds (exit 0). It covered anonymous and role-gated message creation, server-stamped recipients,
whole-lesson versus deleted-version labels, reply preservation of the original label, missing or
mismatched reference refusal, and no-write guarantees on unavailable versions. Fixture teardown
completed; raw output is private at `logs/c24-message-references-http.log`.

The current `app/tests/int/discussions.int.spec.ts` integration suite also passed **23 tests** in
18.02 seconds (exit 0). It independently exercised lock-ordered reply numbering, no-deadlock
account/thread deletion, activity monotonicity, whole-thread and participation cascades, reference
clearing, invited-author deletion and forum-off behavior. Raw output is private at
`logs/c24-discussions-int.log`; teardown and the target lock were clear.
