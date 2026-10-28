# P150-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

**Read (supplied ranges, in full):**
- `app/tests/int/favorites.int.spec.ts:1-377`
- `app/tests/int/importLessons.int.spec.ts:1-96`
- `app/tests/int/jobStatsScheduling.int.spec.ts:1-82`
- `app/tests/int/lockRows.int.spec.ts:1-95`

**Not assessed:** the imported helpers (`tests/helpers/fixtures`, `tests/helpers/rowLocks`), `src/lib/relId.ts`, `src/lib/txDb.ts`, `scripts/import-lessons.ts`, `src/jobs/expireEditRecovery.ts`, `src/access/generatedSurfaces.ts`, and Payload internals. I ran no tools, so I did not verify baseline SHA `6e75a173`. The policy excerpts were used only as context.

## Purpose and invariants (as stated by the tests)

- **favorites:** `user` is stamped from the session; rows are own-only for read and delete; a compound unique index blocks double-favorites; updates are refused; a missing or non-id version returns 404 or 400; favorites cascade on version and user delete; teacher stars follow the Official pointer while editor pins stay put.
- **importLessons:** the CLI exit codes are 0 done, 2 rejected files, 3 refused set, 4 not confirmed; `--yes` imports once and is idempotent; no messages are sent.
- **jobStatsScheduling:** the scheduler's `payload.db` write path keeps working while the API is closed, and one expiry job stays pending.
- **lockRows:** `lockRows` blocks a competing transaction and refuses to run without a transaction.

## Candidates

**None confirmed.** Within the supplied test code I found no spec-to-behavior mismatch I can ground in the policy or in local reasoning. Every product expectation I checked depends on source I did not read, so the tests cannot establish a defect on their own.

## Test-quality observations (not product defects; low)

1. `importLessons.int.spec.ts:91-92` – The comment says "EOF must never authorize," but the test sends `'n\n'`. The EOF-only path is not exercised.
2. `importLessons.int.spec.ts:86-95` – Exit 4 requires an existing Official created by the first test. Run alone, it would not reach the replacement path.
3. `favorites.int.spec.ts:200-301` – Cleanup runs at the end of each test body, not in `finally`. A failing assertion leaves rows behind, which can break the exact-array assertions in later tests (lines 217-223, 253, 288).
4. `favorites.int.spec.ts:77` – Asserts the editor has zero rows, which assumes no earlier block left rows behind.
5. `jobStatsScheduling.int.spec.ts:76-80` – "Exactly one pending" may be affected by the in-process cron ticking concurrently. The comment acknowledges this; flakiness is not verified.
6. `lockRows.int.spec.ts:86` – The regex uses a curly apostrophe (`’`). It matches only if the thrown message in `txDb.ts` uses the same character.

## Unresolved questions

- Does the `txDb.ts` refusal message use U+2019? (Observation 6.)
- Does `stillPendingAfterWindow` attach a rejection handler to `attempt`? If not, an early rejection at `lockRows.int.spec.ts:63` could be unhandled.
- Do the 404/400 statuses in `favorites.int.spec.ts:136-163` match the hook source?
- Do the `Imported 1`/`Imported 0` strings at `importLessons.int.spec.ts:72,75` match the script output?
- Does Payload's access-denied delete throw (`favorites.int.spec.ts:96-103`) rather than resolve empty?
- Does `setupRoleFixture` teardown remove the `MARK`-tagged rows that these tests depend on?
