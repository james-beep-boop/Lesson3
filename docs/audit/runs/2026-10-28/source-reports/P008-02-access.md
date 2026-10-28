# P008-02-access

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Coverage

Assessed, from the supplied text only (no tool calls, no unseen callers checked):
- `app/src/access/bundle.ts:1-35`
- `app/src/access/generatedSurfaces.ts:1-91`
- `app/src/access/index.ts:1-236`
- `app/src/access/lockedDocuments.ts:1-116`
- `app/src/access/versionImmutability.ts:1-60`

The policy excerpts were used as context only. Not assessed: `hooks/fieldSplit.ts`, `hooks/userRoles.ts`, `lib/firstUserBootstrap` (`hasRegisteredUsers`), `lib/accessScopes.ts`, the collection hooks that scope Subject Admin writes, and Payload's installed locked-documents schema. No runtime behaviour was checked.

## Invariants (as stated in the code)

- Role predicates: Site Admin is global. Subject Admin and editing access are per subject-grade. `editor` is a capability, not a user type.
- Prose editing is granted to editors and admins; structure and answer keys are admin-only; system fields are never writable.
- Lock rules: nobody creates locks over the API. Reads are open to signed-in users. Update is Take over only (`user` field alone, naming the caller, on a document the caller may edit). Delete is own-lock-only.
- Version immutability: `enforceVersionImmutable` rejects every authenticated `update`. The `versionUpdateGrantForFormRenderOnly` grant is a form-render grant, not a write grant.

## Candidates

**C1. Take over is denied for object-form `user` values (lead, low severity).**
- Evidence: `app/src/access/lockedDocuments.ts:55-56` and `:108`. For `{id: 7}`, `refId` reads `ref.value` (undefined) and returns `undefined`. The comparison `refId(data.user) !== req.user.id` then fails, and the grant is refused.
- Precondition (unverified): the client sends a populated object or a string id for `user`.
- Expected: the take-over returns true when the caller may edit the target.
- Actual: returns false. This is a fail-closed usability defect, not a privilege bypass.
- Focused reproduction: `lockUpdate({ req: { user: { id: 7 } }, id: 'lock-1', data: { user: { id: 7 } } })` should resolve true when the caller may edit the target. Also check `data: { user: '7' }`.

**C2. `lockDelete` hard-codes the polymorphic `user.value` path (lead, low severity, unverified).**
- Evidence: `app/src/access/lockedDocuments.ts:116` queries `'user.value'`. The same file's `refId` (`:53`, `:56`, `:108`) and `lockRead`'s `Ref` type treat `user` as possibly polymorphic, so the two parts disagree.
- Precondition (unverified): in the installed Payload, `payload-locked-documents.user` is a monomorphic relationship.
- Expected: the holder's own lock row is deleted on leave.
- Actual, if the precondition holds: the `where` matches nothing, the lock persists until its five-minute expiry, and the document stays locked for others.
- Focused reproduction: a holder with `user` set to their own id calls `lockDelete` against their own lock row through the REST/Local API. Assert that the row is removed.

**C3. Not a defect, but unresolved: Subject Admin write scope is delegated.**
- `usersCollectionUpdate` (`app/src/access/index.ts:168-174`) returns true for any Subject Admin on any user document. `assignmentsUpdateField` (`:223-226`) opens the assignments field to any Subject Admin. Both comments say the subject-grade scope is enforced by unseen `beforeChange` hooks. Without those hooks I cannot confirm the scope holds.

## Unresolved questions

1. Does `enforceVersionImmutable` (`versionImmutability.ts:56`) also cover `updateMany` and Local API calls that pass `user`? Only `operation === 'update'` is checked here.
2. Does the hook ordering the comments describe (immutability first, before data-shaping hooks) hold in the built config? The wiring tests are not in the supplied ranges.
3. `usersCollectionCreate` (`index.ts:158-162`) refuses signed-in non-admins. The policy says "anyone may create an account" from the Sign up link. Confirm whether a signed-in visitor should reach sign-up.
4. `canEditLockTarget` (`lockedDocuments.ts:62-79`) relies on the target collection's `access.update` returning a `Where` that Payload accepts. Confirm for `lesson-plans` and `subject-grades`, whose access functions are not supplied.

No other concrete correctness defects were found in the supplied ranges. The access predicates in `bundle.ts` and `index.ts` match their documented role model on the paths I could trace.
