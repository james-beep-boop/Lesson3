# P024-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

**Coverage**
- Read: `app/src/hooks/discussions.ts:1-313` (whole supplied range, 313 lines).
- Not assessed: every callee and dependency, including `lib/discussions`, `lib/rateLimit`, `lib/readBundle`, `lib/relId`, `lib/txDb`, the collection configs, migrations, unique indexes, and the design doc §16. Not checked: the file's own claims about Payload internals (`fields/hooks/beforeValidate/promise.js`, `collections/operations/create.js`).
- No runtime behavior was exercised. Everything below is local reading.

**Purpose and invariants (as stated in the file)**
- Authenticated creates get a server-derived `submissionKey`, `author`, and reference fields. A duplicate `(author, submissionKey)` returns 409 and is not charged.
- Reply numbering is one atomic `UPDATE` on the topic row, so `seq` is serialized per topic.
- `joinedAtSeq` may not exceed the previous `lastSeq`.
- Published content is immutable on update, and locks are taken in user-then-topic order.

**Candidates**

1. **Medium, unconfirmed lead: duplicate-submission race.**
   - Evidence: `discussions.ts:86-92` counts existing rows with the same author and `submissionKey`, with no lock. `:102-107` returns the stamped data, and the insert follows later. For replies, the check also runs before the topic lock taken at `:220`.
   - Precondition: two concurrent creates by the same user with the same `submissionKey`, such as a double-submit.
   - Expected: at most one row. The second request gets 409.
   - Actual, by local reasoning: both can pass the count before either commits. Both then insert unless a unique index on `(author, submissionKey)` exists, which is outside this range.
   - Repro: `Promise.all` of two creates with identical `submissionKey` and author. Assert one row exists and one 409 is returned. Also run it against replies.

2. **Low, lead: quota charged before later rejection.**
   - Evidence: the charge at `discussions.ts:94-100` runs in `beforeValidate`. `orderReply` can still throw afterward at `:229` (topic gone, 404) or `:234` (`joinedAtSeq` ahead, 400).
   - Precondition: a reply with an invalid `joinedAtSeq`, then a retry with a corrected value and the same `submissionKey`.
   - Expected policy: not stated in the supplied material, so I cannot say whether a rejected attempt should cost quota.
   - Actual, if the rate-limit store is not transactional: the first attempt consumes a unit and the retry is charged again.
   - Repro: near the daily limit, submit a bad reply, then a good retry, and check the counter and whether the retry returns 429 with no post created.

3. **Unresolved dependency: `joinReplyAuthor` depends on a virtual field.**
   - Evidence: `discussions.ts:245-254` reads `data.joinedAtSeq` in `afterChange`, and the comment says the field is virtual and never stored.
   - Precondition: Payload must pass the field through to `afterChange`. This is not verifiable here.
   - If it does not, `Number(undefined)` is `NaN` and is written as `lastReadSeq`.
   - Repro: create a reply through the API, then assert `discussion_participation.last_read_seq` for the author equals the submitted `joinedAtSeq`.

4. **Question: `joinedAtSeq` lower bound.**
   - Evidence: `orderReply` enforces only the upper bound (`:233`). Values below `seq - 1`, including negatives such as `-5`, are not rejected in this range.
   - `requireJoinedAtSeq` (unseen) may enforce a floor. The intended minimum is not stated.

**Checked locally, no defect found**
- `rejectContentEdits` (`:283-301`): the scalar and relationship comparisons match the stated rules.
- `cascadeDeleteThread` (`:158-164`): lock order and deletes are consistent with the file's comments, given FK behavior that is not in range.

**Unresolved questions**
- Is there a unique index on `(author, submissionKey)` for both posts and replies?
- Does `consumeRateLimit` roll back with the transaction?
- How does Payload treat a virtual `joinedAtSeq` between `beforeChange` and `afterChange`?
- What bounds does `requireJoinedAtSeq` enforce?
- Is quota meant to be consumed by rejected attempts?

Security and integrity claims in this file remain unreviewed until independent review.
