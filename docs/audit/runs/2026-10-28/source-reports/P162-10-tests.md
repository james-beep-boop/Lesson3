# P162-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope

Read from the supplied text only. I made no tool calls and did not check the working tree.

- `app/tests/unit/authFavoritesWiring.spec.ts:1-86`: read in full.
- `app/tests/unit/authFormMessages.spec.ts:1-84`: read in full.
- `app/tests/unit/backupStatus.spec.ts:1-400`: read through line 400. The `it` block at 393-400 is cut off mid-assertion. Nothing past line 400 was assessed.
- Policy excerpts were used only as reference, not as source.

**Not assessed:** every module these tests import (`src/access`, `collections/Messages`, `collections/Users`, `endpoints/markMessagesRead`, `errors/AccountDisabled`, `LoginForm`, `ResetPasswordForm`, `lib/backupStatus`, `components/Manage/LocalTime`), all callers, runtime behavior, and the backup design document (A2-A5) cited in the file header.

## Purpose and invariants (as the tests state them)

- **authFavoritesWiring:** unlock is Site-Admin-only. `Messages.readAt` is denied for create and update to every caller. Mark-read is POST, returns 401 for anonymous callers before reading the body or writing, and updates only the caller's unread messages with a server-generated timestamp. A client-supplied `readAt` is ignored.
- **authFormMessages:** login and reset messages are chosen by (code, status). A disabled account gets disabled wording, checked before status. An unverified account (403, no code) gets verification wording, or "waiting for approval" on a site without email. 401 is generic. 429/503 ask for a retry without blaming the password.
- **backupStatus:** each statement is derived from records, settings and a clock. Freshness is judged by `coversUntil`, not upload time. A legacy v1 record is never "up to date". Pre-update snapshots are not routine backups. Same-second attempts are ordered by `seq`. An unreadable limit is refused rather than guessed.

## Candidates

**None.** I found no concrete mismatch between these tests and the policy excerpts. The tests cannot establish product behavior, and test titles or absent tests alone are not defects.

## Leads (uncertain, not confirmed)

1. **authFormMessages.spec.ts:31-34, 55-56, 68:** these calls pass two arguments to `signInErrorMessage`, so the third (site-has-email) parameter has an implicit default that the policy does not state. If the default is `false`, unverified users on an email site would see "waiting for approval" instead of the verification message. Severity: low, unconfirmed. To settle it, read `LoginForm` and confirm the call site passes the flag explicitly.
2. **backupStatus.spec.ts:158-170:** with no `maxDataLoss` set, the test shows "history incomplete" for five hours of records, but the window used when no limit is set is not defined in the excerpt. Question only.
3. **backupStatus.spec.ts:325:** the fixture has a successful `lastAttempt` (seq 4) while `lastSuccess` is null. If the record contract requires a success attempt to mirror `lastSuccess`, this fixture is outside the contract and the ordering test may not reflect real data. Not a product defect. Settling it needs the record schema.
4. **backupStatus.spec.ts:393-400:** cut off. The second key state and the rest of the block are not assessed.

## Unresolved questions

- What default does `signInErrorMessage`'s third parameter take, and does every caller pass it explicitly?
- Does the design document define the judged window when no limit is agreed?
- Does the record schema enforce "success attempt implies `lastSuccess` set"?
- These tests call the access functions and `field.access` directly. They do not show that Payload invokes them on REST and Local API paths. That is unverified.

## Coverage status

Partial. The three files above were reviewed as text only, with no implementation or caller checks. The security and integrity claims (the Site-Admin gate, system-only `readAt`, and recipient scoping) remain unreviewed until someone reviews the implementation independently.
