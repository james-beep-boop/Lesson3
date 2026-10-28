# P028-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope

- **Read:** `app/src/hooks/userRoles.ts:401-618`, as supplied in the request. I made no tool calls and did not open the file.
- **Not assessed:** `userRoles.ts` lines 1-400, including the enclosing function's signature and any `systemAssignmentWrite` or `skipAutoDemote` bypass. Also not assessed: `rowSignature`, `lockRows`, `toId`, `isSubjectAdminFor`, `hooks/fieldSplit.ts`, the Payload field-access configuration, and all tests named in comments. No runtime behaviour was observed.

## Purpose and invariants (as stated in the code)

- **D6a guard (450-474):** a Subject Administrator may not remove a `subjectAdmin` row, including their own. They may add one only in a subject-grade they administer, and only if the target already held `editor` there in the pre-write state. The actor must administer every touched subject-grade.
- **`stampAssignmentProvenance` (497-532):** new or changed rows get `grantedBy`/`grantedAt`. Unchanged rows carry stored provenance forward, because the client cannot send those fields.
- **`autoDemotePriorSubjectAdmins` (540-618):** at most one `subjectAdmin` per subject-grade. It locks the grades, pages through the other holders, and demotes them to `editor` with `overrideAccess` and `skipAutoDemote`.

## Candidates

**C1: Provenance is not carried forward when there is no actor. Medium. Local reasoning confirmed; consequence depends on unseen code.**
- Evidence: `userRoles.ts:502-504` returns `data` unchanged when `req.user` is absent. The carry-forward block at 515-527 is therefore skipped. This contradicts the stated invariant at 513-514: an unrelated save "would otherwise blank them."
- Precondition: a Local API update with `overrideAccess` and no `req.user` (for example a script or migration) writes an `assignments` array that repeats existing rows without `grantedBy`/`grantedAt`.
- Expected: unchanged rows keep their stored provenance.
- Actual (by reading): nothing is carried forward. Whether stored values are lost depends on Payload's array replacement and field access. The policy excerpt says optional subfields inside open arrays are nulled, which would make the loss real.
- Repro (integration test): grant `subjectAdmin` as user X, then update the user with `overrideAccess` and no user, sending the same rows without provenance. Assert `grantedBy` is still X. Note that new rows written this way get no provenance at all, which the comment at 482-484 says is indistinguishable from a legacy row.

**C2: One write can hand administration to a target whose editing access is removed in that same write. Low–medium. Lead, not confirmed.**
- Evidence: the editing-access check at `userRoles.ts:461-466` reads `before`. The code comment at 455-456 says the grant and the administration are meant to be "two deliberate steps." The check does not look at removed `editor` rows, so a single PATCH by a Subject Administrator can remove target T's `editor` row for sgA and add `subjectAdmin` for sgA.
- Precondition: the actor is `subjectAdmin` for sgA. T holds `editor` for sgA before the write.
- Expected (policy): handover goes "to one of that subject-grade's existing editors." Whether a `subjectAdmin` without an `editor` row is an invalid state is not visible here.
- Actual (by reading): the check passes and the write is not refused on that basis.
- Repro (HTTP test): as the actor, PATCH T with `assignments` containing only `subjectAdmin` for sgA. Check whether the response is 403 or a resulting state with no `editor` row.

## Unresolved questions

1. **Does the demotion write survive the D6a guard?** `autoDemotePriorSubjectAdmins` updates the incumbent with `systemAssignmentWrite: true`. The removal guard at 450-452 would refuse that update if the bypass is missing. Lines 1-400 would settle this, and so would a handover integration test.
2. **Is the actor's authority rechecked under the lock?** The `isSubjectAdminFor(actor, sgId)` check at 468-472 runs before the grade lock is taken in the afterChange hook, so a concurrent revocation could leave a stale pass. The policy excerpt says authority is refreshed under lock for native writes. Whether this path does that is not visible.
3. **Who calls the system write?** Whether C1 is reachable in production depends on which non-user code paths write `assignments`, which is outside this range.
