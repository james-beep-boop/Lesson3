# P135-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

No tool calls were made. This review used only the supplied text.

**Read:**
- `app/tests/http/saveAsNewRecovery.http.spec.ts:401-655` (read in full)
- `app/tests/http/serverTime.http.spec.ts:1-44` (read in full)
- `app/tests/http/subjectGrades.http.spec.ts:1-97` (read in full)

**Not assessed:** the save-as-new and recovery endpoints, the `hooks/fieldSplit.ts` whitelist, the `makeVersion`/`seedCapture`/`saveAsNew` helpers, the `fixtures` and `httpWire` helpers, the schema or migrations, and the subject-grade collection config. I checked the tests' assertions only for internal consistency. I have not verified them against the implementation, and I make no claim about unseen callers or runtime behavior.

## Purpose and invariants (as encoded by the tests)

- **Recovery 409 (439-524):** a stale token mid-save gets 409, the retirement statement runs exactly once, the concurrent capture is not retired, and no version persists.
- **Retirement ordering (534-592):** retirement runs before the source cascade. A tokenless save leaves the source untouched. A token-bearing save with `deleteSource=true` removes both the source and its recovery row.
- **Token chaining (603-655):** each write advances `revision` by one and never changes `generation`. The save returns an advanced token with a parseable `updatedAt`, and the row ends retired with null content.
- **serverTime (1-44):** 401 unauthenticated, 403 for non-Site-Admin roles, and 200 for a Site Administrator with `no-store` and a clock within 5 minutes of the runner.
- **subjectGrades (1-97):** grades outside 1–12, non-integer grades, and null are rejected on create and on update with 400, and the stored row is unchanged. Boundaries 1 and 12 are accepted, and `displayName` is derived from the grade.

## Candidates

**None confirmed.** I found no concrete correctness, integrity, security or user-visible mismatch that these ranges establish.

## Leads (uncertain, not confirmed)

1. **Lock assumption at 473-481.** The comment says the save "holds nothing" the concurrent capture needs. If the save actually holds the recovery row lock before candidate creation, the `await recovery(...)` at 473 would block until the test times out. That would be a hang, not a false pass. Whether it holds the lock depends on code I have not seen.
2. **Silent `deleteSource` on a tokenless save (549-556).** The test asserts a 200 with `sourceDeleted: false`. The caller asked for deletion and got success, with the source kept. Whether that is correct depends on a source-deletion policy that the supplied excerpts do not state. The test title suggests it is intended, but I have not treated that as policy.

## Unresolved questions

- **Grade range.** The 1–12 bound is encoded only in the tests. The supplied policy excerpts do not state it, so I have not treated it as a requirement.
- **Error detail.** `subjectGrades.http.spec.ts:41-43` accepts a bare `'Grade'` substring because Payload omits the detailed validator message. The policy's Plan A correction requires detailed reasons for the save-as-new editor. That rule may not cover the subject-grade collection API, so I cannot say whether this is a gap.
- **Test-only interpolation.** `saveAsNewRecovery.http.spec.ts:418` interpolates `sourceVersionId` into `sql.raw`. This is fixture code, not product code. It is only a concern if that ID can be non-numeric, which the supplied ranges do not show.
