# P109-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/e2e/manage.e2e.spec.ts:1-400`, as supplied in the prompt. I did not run tools or check the file at baseline `6e75a173`.
- **Not assessed:** lines 401 onward; the imported helpers (`../helpers/dialogs`, `e2e`, `manageUi`, `editRecovery`, `fixtures`); `src/components/AdminDashboard`; the access functions and hooks; and runtime behaviour. I have not checked any caller or runtime path.
- **Coverage status:** partial. This is a test-file review only.

## Purpose and invariants (as stated in the file)

- Browser coverage of the Manage page per role: Teacher with editing access, Subject Admin, and Site Admin.
- Its comments state these invariants:
  - A Teacher sees only their own saved versions, and the cleanup queue is administrator-only (`:255-288`).
  - A Subject Admin sees candidate versions in their own subject-grade, with a Compare link and no "Continue editing" (`:290-342`).
  - Per-run `MARK` tagging isolates this run's rows.
  - Box counts should not be asserted (`:12-13`).

## Candidates

No confirmed product defect in the supplied range. Every item below is a test-integrity lead. None is a product defect on its own.

1. **Low (test-integrity, fragile):** `:265` asserts `'Your saved versions (1)'`. The file's own header (`:12-13`) says counts go stale and must not be asserted. The `(1)` depends on other `editor`-authored versions created elsewhere in the file. Those are not visible in this range. *Repro:* add one more `author: editor` version in another `describe` before this test and rerun. The expected result is a stable assertion; the actual result may be a failure.

2. **Low (unresolved fixture mismatch):** `:218` seeds `unit: { strand: 'Strand 77.0: Group Delete' }`. The constant at `:55` expects `'Strand 77: Group Delete'`, and the comment at `:52-54` says the heading is derived from `unit.strand` plus the sub-strand number. Whether the `.0` is normalised is not shown in this range. *Repro:* read the heading derivation in `AdminDashboard` and assert the rendered heading equals `GROUP_STRAND`.

3. **Low–medium (unresolved fixture semantics):** `:242` passes `_verified: false` into `createUserVerified`. If that helper forces `_verified: true`, the "unverified" fixture is actually verified and any test relying on it tests the wrong state. *Repro:* create the user, then query `_verified` through the Local API. The expected value is `false`.

4. **Low (test robustness):** `:116-126` (`acceptConfirmation`) never resolves if the action does not raise a dialog. This would hang until timeout rather than fail with a clear message. This is test-harness behaviour, not a product defect.

## Unresolved questions

- Does `createUserVerified` honour `_verified: false` (item 3)?
- Does the heading derivation normalise `77.0` to `77` (item 2)?
- Do later `describe` blocks create `editor`-authored versions (item 1)?
- What does the Subject Admin's `toHaveCount(1)` at `:308` count once later tests run in the same subject-grade?
