# P027-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Correctness audit: partial assessment (no fixes, edits, or tool calls)

**Coverage**
- `app/src/hooks/messageReference.ts:1-96`: read in full.
- `app/src/hooks/mutationAuthority.ts:1-47`: read in full.
- `app/src/hooks/userRoles.ts:1-400`: read as supplied. The range ends mid-condition in `enforceAssignmentScope`, so that hook is not fully assessed. Lines 401 onward were not supplied.
- Policy excerpts were used as context only. No callers, runtime behavior, or Payload internals were checked.

**Purpose and invariants**
- `messageReference.ts`: server-derived message version labels. A reply inherits the original context and is refused unless the caller is the original recipient. The version/plan consistency check runs only for authenticated callers.
- `mutationAuthority.ts`: takes the shared admin-count lock and the target row lock before Payload's access checks, then refreshes the caller.
- `userRoles.ts`: keeps at least one usable Site Admin (role, not disabled, verified). Requires the admin-count lock in the transaction. Blocks self-disable, guards password changes, and scopes assignment edits to the actor's subject-grades.

**Candidates**

1. **Medium (lead; local reasoning, rest of hook unseen).** `app/src/hooks/userRoles.ts:380-381, 392-396, 398-400`.
   - Precondition: actor is Subject Admin of SG1 only. Target already holds `{SG2, subjectAdmin}`.
   - Mechanism: `beforeSigs`/`afterSigs` are sets. A duplicate row whose signature already exists before is not "added", so `touchedSubjectGradeIds` stays empty and the scope check is skipped.
   - Expected (from the comment at 342-345, which requires Subject Admin for every subject-grade whose row was *added*): a refusal. Whether a duplicate counts as "added" is not defined in the excerpts, so this is partly an intent question.
   - Actual, per visible code: allowed, unless code after line 400 or Payload rejects duplicates. Possible effect: two `subjectAdmin` rows for SG2, which bears on the ≤1 invariant.
   - Test: seed U with `[{SG2, subjectAdmin}]`; as the SG1 Subject Admin, PATCH U to `[{SG2, subjectAdmin}, {SG2, subjectAdmin}]`; expect 403. Repeat with `editor`.

2. **Low (lead; depends on Payload runtime behavior).** `app/src/hooks/messageReference.ts:77-84` versus `85-91`.
   - Trusted path (no `req.user`) calls `findByID` directly. If it throws on a missing version, the caller gets Payload's not-found error rather than the intended 400 "must belong to the linked lesson plan".
   - Expected: 400 APIError. Actual: not verified. Trusted-only.
   - Test: trusted `create` with a nonexistent `version` id; assert the error class and status.

**Unresolved questions**
- `messageReference.ts:92`: the plan-consistency check is skipped for trusted writes. Is that an intended carve-out, or should a trusted create that links a version from another plan also be refused?
- `messageReference.ts:52` and `47`: if the original sender has been deleted, `recipient` becomes null. Is a null recipient validated later?
- `userRoles.ts:375`: can a request body supply `context.systemAssignmentWrite`? If so, the scope check is bypassable. Unreviewed security claim.
- `userRoles.ts:400+`: the rest of `enforceAssignmentScope` and whether it handles duplicates.
- `mutationAuthority.ts:28`: the early return for version updates relies on an immutability hook that is outside this range.

Security and integrity claims remain unreviewed until an independent review. No candidates were confirmed by execution.
