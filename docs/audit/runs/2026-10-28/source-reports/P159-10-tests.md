# P159-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read from the supplied text (no tools run, no tests executed; I did not verify that the text matches baseline `6e75a173`):

- `app/tests/int/worldwideIds.int.spec.ts:1-281`: read in full
- `app/tests/style-snapshot/README.md:1-38`: read in full
- `app/tests/style-snapshot/dialogs.spec.ts:1-160`: read in full
- `app/tests/style-snapshot/diff.mjs:1-87`: read in full
- `app/tests/style-snapshot/kit.ts:1-40`: read in full

**Not assessed:** `pages.spec.ts`, `menu-states.spec.ts`, `playwright.style.config.ts`, the helpers (`fixtures`, `e2e`, `editRecoveryUi`, `db`), `src/ingest`, `releaseFingerprint`, `installationId`, the `20261019_211325_worldwide_ids` migration, and the policy excerpts (used only as context). I have not checked any unseen caller or runtime behaviour.

## Purpose and invariants (as stated in the files)

- **worldwideIds spec:** every creation path gets a fresh uid that callers cannot choose or change; only ingest stamps `releaseFingerprint`, and it must equal the fingerprint of the stored version; the installation id is stable until reset; the migration fills only missing values, is idempotent, and leaves uid NOT NULL.
- **Style-snapshot kit:** measurement scripts, not assertions. `diff.mjs` compares computed-style dumps from before and after runs.

## Candidates

**C1. `diff.mjs` silently drops pages present only in the after dump.** Severity: low–medium (false "no differences" in a measurement tool). Confirmed by local reading.
- Location: `app/tests/style-snapshot/diff.mjs:62` iterates only `Object.keys(a)`.
- Precondition: the after run captures a state the before run did not. The spec side makes this possible: captures are conditional at `dialogs.spec.ts:106,116,131,143,149`.
- Expected: the new state is reported. The README (`README.md:36-38`) says a state the before-run never rendered cannot be called unchanged.
- Actual: no line is printed for it, and the summary reads `total differences 0`.
- Focused reproduction (not executed): before `{"__props":["color"],"p":["a | red"]}`, after `{"__props":["color"],"p":["a | red"],"q":["b | blue"]}`. Expected a flag for `q`; actual `total differences 0`.

**C2. Rows are sorted before diffing, so same-path elements are paired by value rank, not document order.** Severity: low (lead; practical impact depends on the page). Confirmed by local reading.
- Location: `kit.ts:37` sorts rows; `diff.mjs:43-44` says rows are "matched by element path in document order".
- Precondition: two elements share a class path and exchange their full style vectors between runs.
- Expected: the position-level swap is reported.
- Actual: sorted row sets are identical, so the dumps compare equal.
- Reproduction (not executed): two dumps, both `"p":["c | blue","c | red"]`, produced from DOM orders `[red, blue]` and `[blue, red]`; expected a difference; actual `total differences 0`.

**C3. Test-hygiene risk: the shared `users.uid` NOT NULL constraint is dropped without restoring it on failure.** Severity: low; test-only, not a product defect.
- Location: `worldwideIds.int.spec.ts:242`. The NOT NULL restoration is only checked on the success path (`:274-276`). The `finally` at `:277-279` deletes the teacher but does not restore the column.
- Precondition: `up()` throws mid-test.
- Expected: the test database schema is left as it was. Actual: `users.uid` stays nullable for later tests in the same database.

**C4. `dialogs.spec.ts` fails only at the end of the run if `STYLE_OUT` is unset.** Severity: low; usability.
- Location: `dialogs.spec.ts:159` calls `fs.writeFileSync(process.env.STYLE_OUT!, …)` with no check.
- Precondition: `STYLE_OUT` unset. The run takes up to about 400 s before the write.
- Expected: an early, clear error. Actual: a `TypeError` after all captures are taken, so the output is lost. This is my reading of Node's path validation; I did not execute it.

## Unresolved questions

- `worldwideIds.int.spec.ts:253` passes `req: undefined` to `up()`. Whether the migration needs `req` cannot be checked here.
- `:121` proves only that the stored-copy and ingest fingerprints agree. Whether `releaseFingerprint` excludes uid and timestamps is unknown.
- `:218`'s title says the migration "recognises releases by the audited rule", but the test covers one consecutive release. The gap, ambiguous, and cyclic cases are untested. That is a coverage gap, not a defect.
- The snapshot at `:255-263` omits `semver`, authorship, and Official pointer, so the claim that the migration leaves them unchanged is not asserted.
- `kit.ts:19-21` takes the first `.modal-backdrop` as the root but collects all matches. If more than one backdrop is present, the extra ones get full-ancestor paths. Untested; I have not confirmed it occurs.
- `dialogs.spec.ts:151-152` uses a fixed 300 ms sleep before a snapshot, which is a possible flake source.
- Whether the README's "none of it runs in CI" holds cannot be checked from these files.
