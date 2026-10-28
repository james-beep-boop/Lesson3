# P121-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/tests/http/discussions.http.spec.ts:1-400` and `app/tests/http/discussions.http.spec.ts:401-596`. The file ends at line 596, so this is complete coverage of the supplied file.
- **Not assessed:** the endpoints, hooks, access functions, and fixtures these tests exercise (`../helpers/fixtures.js`, `../helpers/rowLocks.js`, `../helpers/discussions.js`, `../helpers/httpWire.js`, `referencePickerQueries.js`). Nothing about runtime behaviour was executed or verified. Each assertion below is a test expectation, not an observed product result.
- **Policy excerpt:** it ends mid-sentence in §8, so checks against §8 use only the visible text.

## Purpose and invariants (as the tests state them)

- Wire-level authorization for the discussion forum: anonymous and per-role access to topic/reply REST doors and the thread-delete, pin, mark-read, and redact endpoints.
- Forced author stamping; `submissionKey` idempotency; `joinedAtSeq` bounds.
- No REST edit or delete for anyone.
- Administrator demotion, disable, or deletion during a lock wait is refused (403) with no write (`:226-277`, `:409-412`).
- Off switch: nobody posts or reads participation while off; only the Site Administrator redacts (`:348-374`, `:453-471`).
- Expanded reads (`depth=2`) expose ids only, with no email, roles, or assignments (`:309-336`).
- Nav-state is no-store, returns exactly two fields, and reports "off" for all roles while the forum is off (`:523-596`).

## Candidates

No confirmed product defect in these ranges. The following are test-level leads only.

1. **Low, lead.** `app/tests/http/discussions.http.spec.ts:479` titles the picker test "the saver's name only", and the comment at `:476-478` says version authors come back "names only". The assertion at `:504-508` requires `{ id, name, collection: 'users' }`. Either the title and comment or the assertion overstates the contract. Whether an `id` counts as a "name" is a policy question I cannot settle from the excerpt.

2. **Low, lead.** `:231-263` expects **403** when the Site Administrator is *deleted* during the wait. The policy excerpt says the refresh rejects a missing account, but it does not specify a status. A deleted account's token may instead produce 401 from authentication, depending on where the check runs. The test pins 403 without a cited policy source, so the expected status is unverified.

3. **Low, test strength.** `:280` checks the delete-case `unchanged` callback only with `expect(topic.id).toBeTruthy()`. This passes whenever `findByID` returns a document. It does not assert the topic's content or state, so it is weaker than the pin case at `:410-412`.

4. **Low, lead.** `:335` expects `refPlan` to be a number, although the topic was posted with only `refVersion` (`:311`). This assumes the server derives `refPlan` from `refVersion`. That derivation is not visible in these ranges.

## Unresolved questions

- What HTTP status should a deleted-account caller receive during the lock wait: 401 or 403? (Candidate 2.)
- Does `mark-read` accept `fromSeq: 1` when the reader's current `lastReadSeq` is 0 (`:397`)? The contract for `fromSeq` is not in the supplied ranges.
- Does the participation read at `:338-345` return `user` as an id at the default depth, given that the test passes no `depth` parameter?
- Is "names only" in the picker contract meant to exclude `id` and the `collection` marker? (Candidate 1.)
