# P163-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/tests/unit/backupStatus.spec.ts:401-800` and `:801-905`; `app/tests/unit/backupStatusPanel.spec.tsx:1-26`.
- **Not assessed:** the implementation (`backupStatus` derivation, the record/journal reader, `BackupStatusPanel`), the helpers these tests call (`record`, `success`, `derive`, `statement`, `formatInstant`, `NOW`, `fileMock`), and all callers. I did not run the tests, and I have no runtime evidence. Every expected value below is what the test asserts, not what the code does.
- **Token limits:** none. Both ranges were read in full.

## What the ranges assert

- Each statement has a key, state and value. Restore-journal states map to fixed wording and states.
- Malformed, mis-named, wrong-date (`2026-02-30`), or damaged records are not treated as evidence.
- Reads are size-capped (8192 bytes implied) and time-bounded (a wedged mount yields `unknown` in under 5 s).
- Archived pre-3a and version-1 records do not revive a success. The USB reminder defaults to 30 days and is overridable.
- Setup receipts count only when they match the configured school recipient and carry a valid date.
- Pre-hydration dates render as the UTC calendar day; the panel spec asserts this.
- Wording never contains "protected" or "recoverable" in the variants tested.

## Candidates

No confirmed product defect follows from these ranges alone. The leads are below.

**1. Setup-date source may differ between paths (lead, low–medium).**
- `backupStatusPanel.spec.tsx:16` derives the "Password-locked (set up …)" date from `settings.keyLockedAt`.
- `backupStatus.spec.ts:892` and `:898` expect the same wording from receipt `keyCreatedAt`.
- If production settings are populated from the receipt and the two fields can diverge, the displayed setup date could differ by path.
- *Expected:* one authoritative setup instant, which the source does not establish.
- *Actual:* unknown. The implementation is not in scope.
- *Repro:* write a receipt with `keyCreatedAt` D1 and set `keyLockedAt` to D2 through the real pipeline, then compare the rendered date.

**2. Journal `version` type handling (lead, low).**
- `backupStatus.spec.ts:613` uses `version: '1'` (string) and expects a restore statement (`:623`).
- Other version fields are numeric (`:653`, `:688`, `:824`).
- If the reader accepts only numeric `1` for records and rejects `'1'` for the journal (or the reverse), an open restore could be silently hidden on one path.
- *Repro:* a journal with `version: 1` and one with `version: '1'`, each run through the reader; check that the `restore` statement appears in both.

## Test-quality notes (not product defects)

- `backupStatus.spec.ts:787-805` asserts only that a phrase is absent, so it passes vacuously if the wording changes.
- `:846` is titled "old-format" but uses a version-2 record.
- `:666` tests 8193 bytes only; the exact boundary is untested.
- `:683-684` depends on the 5 s default timeout.

These do not show a product defect.

## Unresolved questions

- Which timestamp is the authoritative setup date (lead 1)?
- Should the journal accept `'1'`, `1`, or both (lead 2)?
- Does `formatInstant(…, true, NOW)` at `:528` depend on the time zone of `NOW`? That depends on the helper, which I did not read.
- Are the 30-day USB default and the 8192-byte cap the approved values? The supplied policy excerpts do not cover them.

Security and integrity claims in these ranges remain unreviewed until independent review.
