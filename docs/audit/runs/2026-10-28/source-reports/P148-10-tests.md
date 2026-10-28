# P148-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope.** Review of the two supplied file ranges, taken from the text in this message. I did not re-read them from disk, run any tests, or make any tool calls.

**Ranges read**
- `app/tests/int/editRecoveryRetire.int.spec.ts:1-387`: read in full.
- `app/tests/int/editRecoveryStart.int.spec.ts:1-201`: read in full.

**Not assessed:** `src/lib/editRecovery/kernel.ts`, `tests/helpers/editRecovery.ts`, `tests/helpers/fixtures.ts`, `endpoints/versionEdit.ts`, and the SPEC/§7 design text the comments cite. I have not checked whether these tests pass against the real SQL, and I have not checked any callers or runtime behaviour.

**Purpose and invariants (as the tests state them)**
- `retire` (retire spec, lines 85-128): one transition for four callers. It sets `retired_at`, clears `content`, advances `revision` by 1, leaves `generation` unchanged, keeps the marker row, and sets `updated_at` equal to `retired_at`. The returned token echoes the stored values.
- Refusals (lines 174-306): a stale generation, revision or cutoff returns `{ok:false, reason:'conflict'}`. A retired row cannot be retired again. `save-as-new` outside a transaction throws.
- `start` (start spec): the first call inserts generation 1, revision 1. Resume is a no-op. Reactivation clears content and advances generation exactly once under concurrency, and restarts the TTL clock.

**Candidates**

1. **Low (test integrity, confirmed by local reasoning).** The case-25 test does not isolate the cutoff guard its docblock claims to pin.
   - Location: `retire.int.spec.ts:265-293`, especially the claim at 268.
   - Evidence: `selectedRevision` is taken before the `landed` capture. That capture advances revision, so the revision predicate alone refuses the retirement. The row's `updated_at` is also now past the 2026-02-01 cutoff, so the cutoff predicate refuses too. Removing either predicate alone leaves the test green.
   - Expected: the test fails if the cutoff predicate is removed.
   - Reproduction: use the post-capture revision as `expectedRevision` with cutoff `2026-02-01`. Expect conflict and `retired_at` null. That isolates the cutoff term.
   - This is a test-quality defect, not a product defect shown from these ranges.

2. **Uncertain lead (low).** The pinned-timestamp test compares strings exactly.
   - Location: `editRecoveryStart.int.spec.ts:134-139`.
   - The test asserts `token.updatedAt` `toBe(PINNED)`, an ISO string. Other assertions in the same file normalise with `new Date(...)` (lines 49, 195-197). The comment says the driver returns `timestamptz` as a string. If that string is Postgres text form, such as `2026-08-06 01:14:12.807+00`, the assertion depends on `tokenOf` formatting, which I was not given.
   - Reproduction: compare `new Date(token.updatedAt).getTime()` with `Date.parse(PINNED)`.

3. **Uncertain (question, not a defect).** Error text match.
   - Location: `retire.int.spec.ts:325`. The regex uses U+2019 (`caller’s`). If production uses an ASCII apostrophe, the test fails. I cannot see the production message.

4. **Uncertain, low.** Mixed clocks in the expiry happy path.
   - Location: `retire.int.spec.ts:152`. The cutoff is Node time (`Date.now()+60_000`), while `updated_at` comes from DB `NOW()` via `ageRecoveryRow`. The row is selected only while the DB clock is within about two minutes of the Node clock. That is low risk on one host, but cross-host runs could flake.

No confirmed product defect appears in the supplied ranges. Security and integrity claims in these ranges remain unreviewed until independent review.

**Unresolved questions**
- Does `tokenOf` normalise `updatedAt` to ISO? (start:139)
- Does the production refusal message use U+2019? (retire:325)
- Does `retireDirectly` advance revision the way start case 22 (line 186) assumes?
- Are the cases 19-20 endpoint tests the docblock refers to present in another range? They were not supplied.
