# P104-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- Read from the supplied text, with no tool calls:
  - `app/tests/e2e/discussionsModeration.e2e.spec.ts:1-413` (fully covered)
  - `app/tests/e2e/documentLocks.e2e.spec.ts:1-86` (fully covered)
- Not assessed: helper modules imported by these files (`../helpers/*`, `../../src/access/lockedDocuments`), the app code under test, and the policy excerpts (used as context only; no policy-based findings).
- Behaviour of helpers such as `loginAs`, `setForumEnabled`, `createTopicAs`, `setupRoleFixture` and `createVersionFixture` is inferred from names only.
- No product-behaviour claim is made. Security/integrity claims are unreviewed until independent review.

## Purpose and invariants

- **discussionsModeration**: browser tests for forum moderation controls (pin, redact, delete thread), the forum on/off switch, and browser Back freshness. They assert that controls are present or absent by role and that DB state changes after confirmation.
- **documentLocks**: browser test that a second editor sees the "Document locked" dialog and can take over the lock, with lock holder read via the Local API.

## Candidates

**1. Medium (test-harness integrity): bulk deletion of shared lock rows.**
`documentLocks.e2e.spec.ts:27-33`. The header (lines 11-12) says fixtures are seeded "into the SAME database the app serves", but `afterAll` runs `delete({ collection: LOCKED_DOCUMENTS_SLUG, where: { id: { exists: true } }, overrideAccess: true })`, which removes every lock row, not only this spec's.
- Precondition: the spec runs against a database holding any other lock row (a real editor's lock or a concurrent run).
- Expected: only this spec's lock rows are removed.
- Actual (by reading): all lock rows are removed.
- Repro: seed a lock row for an unrelated document, run the spec, then assert that row still exists. Expected to fail.
- Confidence: confirmed by local reasoning; the runtime DB contents are unverified.

**2. Low (test soundness): negative-only assertions with no positive anchor.**
`discussionsModeration.e2e.spec.ts:283-298`. The loop asserts `Delete thread`, `/^Redact|^Pin$/` and `Discussions enabled` have count 0, with no check that the topic or admin page rendered.
- Precondition: the topic or admin page fails to render (404, redirect or error page).
- Expected: the test fails when the controls cannot be observed.
- Actual: `toHaveCount(0)` passes.
- Repro: use a nonexistent topic id for the teacher and subject-admin loop; the assertions still pass.
- Lines 347-351 have the same pattern, but a later click at 352 provides a positive anchor, so that instance is weaker.

**3. Low (test does not prove "never overwrites"): identical values.**
`discussionsModeration.e2e.spec.ts:394-395`. The stale page unchecks the toggle (intends `false`), then `setForumEnabled(fx.payload, false)` simulates the other administrator with the same value.
- Precondition: the concurrent write matches the stale submission.
- Expected: after the "changed" alert, the DB still holds the other administrator's value, which differs from the stale submission.
- Actual: the test only observes the alert; an overwrite with `false` would be indistinguishable from no overwrite.
- Repro: make the external write `true` and the stale page submit `false`; assert the DB still reads `true` after the alert.

**4. Low, uncertain: `holderOf` shape assumption.**
`documentLocks.e2e.spec.ts:46-50`. The code reads `user?.value` and also tolerates a bare number or object.
- The lock collection schema is not supplied. If `user` is a plain relation, `.value` is undefined and `holderOf` always returns `undefined`.
- Failure mode is a false negative (timeout at lines 68 or 81), not a false pass.
- Needs the lock collection definition to settle.

**5. Minor: contexts not closed on failure.**
`documentLocks.e2e.spec.ts:84-85`. `first.close()` and `second.close()` run only on the success path. A failure leaks contexts and the peer lock until `afterAll` (see candidate 1).

## Unresolved questions

- Is the E2E database isolated per run? This determines the severity of candidate 1. The discussions spec also writes global `system-settings` (`setForumEnabled` at lines 21, 36, 52, 119, 123, 395), and `beforeAll` forces `forumEnabled` to `true`, overwriting any prior value.
- What is the shape of the `LOCKED_DOCUMENTS_SLUG` `user` field (candidate 4)?
- Do `expectPairedAtBothWidths`, `createVersionFixture`, `openEditor`, `typeProse` and `expandLessons` behave as their call sites assume? Not checked.
- Are the DB rows referenced by `joinedAtSeq` and `submissionKey` (lines 105-107, 209-211) valid for the real schema? Not checked.
