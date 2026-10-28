# P020-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

- **Read in full:** `app/src/collections/Messages.ts:1-217`, `app/src/collections/Subject.ts:1-115`, `app/src/collections/SubjectGrade.ts:1-206`.
- **Not assessed:** imported modules (`../access`, `../lib/rateLimit`, `../lib/enqueue`, `../hooks/messageReference`, `../jobs/messagePing`, `../endpoints/markMessagesRead`, `../lib/relId`, `../lib/messageText`, `../lib/gradeLevels`), `payload-types`, all callers, and runtime behaviour. Policy excerpts were used only as the stated intent for each invariant.

## Purpose and invariants (as read)

- **Messages:** flat, private sender/recipient messages. `sender` is stamped from the session, creation is rate-limited, read access is limited to sender or recipient, and update and delete are denied at collection level. A content-free ping is enqueued only when the recipient has no other unread message.
- **Subject:** taxonomy root. Delete is blocked while SubjectGrades reference it, and a rename refreshes denormalised `displayName` values.
- **SubjectGrade:** unique `(subject, grade)` enforced both by a DB index and a friendly `APIError` check. Delete is blocked by content and cascades role assignments. `displayName` is recomputed on write.

No mismatch was found locally in the SubjectGrade delete guard, the duplicate check, the title refresh, or the paginated role cascade.

## Candidates

**1. Subject near-miss invariant not enforced at the collection layer — Medium (confirmed for this file; enforcement elsewhere unchecked)**
- Evidence: `Subject.ts:105-114` declares only `unique: true` on `name`, which is an exact-match DB constraint. `Subject.ts:100-104` has no normalisation or near-miss check. There is no `trim` on `name`.
- Policy (upload "Near-miss names") says two Subjects must never differ only by case or whitespace.
- Precondition: a Site Administrator creates Subjects through the collection API.
- Expected: creating `biology` after `Biology`, or `Biology ` after `Biology`, is rejected.
- Actual in this file: both are accepted. The upload trims `META.subject`, but the collection stores whatever it receives.
- Repro: Local API `create` of `Biology`, then `biology`, then `"Biology "`. Assert each later create throws.

**2. Sender stamp keyed on `req.user`, not on overrideAccess — Low–Medium (lead)**
- Evidence: `Messages.ts:51-53` describes system paths as using `overrideAccess` with no `req.user`, supplying `sender` explicitly and not rate-limited. The code at `Messages.ts:56` only checks `!req.user`. Line 60 charges the budget, and line 67 overwrites `sender` with `req.user.id`.
- Precondition: a create with an authenticated `req` and an explicit `data.sender` different from `req.user.id`. Whether any caller does this is unverified.
- Expected (per the comment): explicit sender kept, no budget spent.
- Actual: sender overwritten and the caller's daily budget charged.
- Repro: `payload.create` with `req.user` set, `overrideAccess: true`, and `data.sender` set to another id. Assert the stored sender equals the supplied id and the budget is unchanged.

**3. Ping gate can double-send under concurrency — Low (lead)**
- Evidence: `Messages.ts:81-93` counts other unread messages, then enqueues at 117 outside the transaction. The header (`Messages.ts:34-36`) states a burst emails once.
- Precondition: two concurrent creates to an idle recipient, where neither transaction sees the other's uncommitted row.
- Expected: one ping.
- Actual: possibly two pings, bounded by `messagePingRecipient`.
- Confirmation needs a concurrency test and the isolation level, which is outside the supplied range.

## Unresolved questions

- Do any callers create messages with an authenticated `req` and an explicit `sender` (candidate 2)?
- Does the Manage UI or the access layer enforce the Subject near-miss rule (candidate 1)?
- `Messages.ts:198-203`: `versionLabel` denies create and update. If `validateContextLink` (not supplied) sets it, does field access strip it? The file alone cannot settle this.
- `Messages.ts:55-66` consumes the daily budget before field validation and `validateContextLink`. Rejected requests therefore spend budget. The policy excerpts do not say whether that is intended, so this is recorded as a question, not a defect.

These are unreviewed local leads. Security and integrity claims need independent review.
