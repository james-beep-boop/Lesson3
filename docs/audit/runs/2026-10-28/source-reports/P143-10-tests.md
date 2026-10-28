# P143-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Audit: `app/tests/int/discussions.int.spec.ts`

**Result: zero product candidates.** The supplied ranges contain test code only. The product code it exercises (hooks, access functions, the forum gate, the lock statements) was not supplied, so none of the asserted behaviour is verified against source. No tool calls were made.

### Coverage

- `app/tests/int/discussions.int.spec.ts:1-400`: read in full.
- `app/tests/int/discussions.int.spec.ts:401-587`: read in full. The file ends at line 587.
- Not assessed: `../helpers/fixtures.js`, `../helpers/db.js`, `../helpers/rowLocks.js` (`setForumEnabled`, `withForumOff`, `whileLockHeld`, `whileRowLocked`, `stillPendingAfterWindow`, `clearRateLimitBuckets`, `setupRoleFixture`); `src/payload-types.js`; the discussion collection hooks and access functions; the `add_forum_enabled` migration; the `tests/http/discussions.http.spec.ts` matrix.

### Asserted contract (as the file states it)

- **Posting:** the server stamps `author`, `refPlan`, `refLabel`, `lastSeq`, and `pinnedAt`, and ignores forged values. Duplicate `submissionKey` returns 409. Missing key or unreadable reference returns 400.
- **Participation:** the topic author starts at 0. The referenced version's author starts at −1. Nobody is invited when the version author is the topic author or is absent. A first-time replier starts at `joinedAtSeq`. Later posts never move an existing marker. An out-of-range `joinedAtSeq` returns 400 and writes nothing.
- **Ordering and concurrency:** reply `seq` is allocated under the topic lock. Activity time never moves backwards.
- **Immutability:** title and reply body are refused with 403 even on the trusted path. System fields may still move.
- **Deletion:** account and thread deletion both complete when participation is locked. Deleting a version clears `refVersion` and keeps the label. Deleting an account clears `author` and keeps posts. In-flight participation rows are removed.
- **Forum off:** posting and reading are refused with 403 for everyone except, for reads, the Site Administrator. Participation reads are refused for all users.

### Candidates

None confirmed. Every expectation in the file is a stated contract. Without the implementation I cannot tell whether it is wrong, so I have not promoted any assertion to a defect.

### Test-suite observations (not product defects)

- Cleanup in the test bodies at `:316`, `:412`, `:496` is not in a `finally`. A failed assertion leaks rate-limit buckets for the marked users. `afterAll` only clears `fx.users`.
- In the lock tests (`:271`, `:301`, `:336`, `:389`, `:447`, `:515`, `:541`), promises started inside the lock callback are not awaited if an earlier assertion throws. They can reject later as unhandled.
- Coverage gap: no case writes a participant's `last_read_seq` above 0 before a later post, so "never moves an existing marker" is only tested at the 0 starting point.

### Unresolved questions

1. Does the participation insert actually take `FOR KEY SHARE` on the user row (`:541` comment)? The test relies on it, but the implementation was not supplied.
2. Does the activity-time statement keep the greater of the two timestamps, as `:321` claims? Not verifiable from here.
3. Does `withForumOff` restore the forum setting when its callback throws?
4. Does `stillPendingAfterWindow` give a reliable waiting signal, or can a slow CI host produce a false pass or a false fail? The helper's timing semantics were not supplied.
5. The label format at `:155` (`' · v1.0.1'`) depends on the title built by the server. Not checked.

Security and integrity claims in this file remain unreviewed until an independent review of the implementation.
