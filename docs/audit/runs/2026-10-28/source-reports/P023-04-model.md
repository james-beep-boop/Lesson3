# P023-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Correctness audit: partial, no confirmed defects

**Coverage**
- Read (from the supplied text, not re-checked against the worktree or baseline 6e75a173): `app/src/hooks/authRateLimit.ts:1-209` (full) and `app/src/hooks/bundleVersion.ts:1-204` (full).
- Not assessed: `fieldSplit.ts`, `access` (`toId`), `lib/txDb`, `lessonPlan.ts`, `validateGeneratable.ts`, `lib/rateLimit`, `lib/loginProtection`, `access/versionImmutability.ts`, the endpoint that sets the reset-link context, and Payload hook ordering. No tool calls were made and no runtime behaviour was checked.

**Purpose and invariants (as read locally)**
- `authRateLimit.ts`: throttles unauthenticated login, forgot-password and signup in `beforeOperation`. Trust is taken from in-process `overrideAccess`, and the admin/operator reset carve-out comes from a server-set `req.context` flag. `withAdminResetLinkAllowance` (101-119) restores the prior value in `finally`; I checked that the restore is correct and nesting-safe.
- `bundleVersion.ts`: renumbers lessons, blocks deleting the Official version under a plan row lock, requires version `subjectGrade` to equal its plan's, and runs generatability validation on merged data.

**Candidates**

1. **Lead, unconfirmed (Medium if confirmed).** `bundleVersion.ts:151-182`. A version can apparently be reparented to another plan.
   - Precondition: a caller with update authority (Site Administrator or `overrideAccess`) updates the version that is plan A's `officialVersion` and sets `lessonPlan` to plan B, which has the same `subjectGrade`.
   - Local reading: this hook checks only grade equality. It does not check the Official pointer or the `lessonPlan` change.
   - Expected, from policy (snapshots are immutable; versions are never overwritten): the update is rejected, or plan A keeps a version it owns.
   - Actual: not determinable here. Any block would have to come from `enforceVersionImmutable`, which I did not see.
   - Reproduction: integration test. Create plans A and B with the same grade. Make version V Official for A. Update V with `lessonPlan: B` via `overrideAccess`. Assert the update fails, or that A's `officialVersion` still belongs to A.

2. **Lead, unconfirmed (Low).** `bundleVersion.ts:184-204`. Generatability is checked on `{...originalDoc, ...data}` before the field split restores protected fields.
   - Precondition: a teacher with editing access submits an invalid value in a Subject-Admin-only field, such as a `framework[].phase` outside the vocabulary. The split would discard that value and keep the original.
   - Expected, per the split rule: the save succeeds with the original structure kept.
   - Actual by local reading: `ValidationError` rejects the save. This is a fail-closed false rejection.
   - Reproduction: teacher `PATCH` with a bad phase. Expect 200 and the original phase retained. Hook order is needed to confirm.

3. **Confirmed by local reading (Low).** `bundleVersion.ts:68-69` and `:73-74`. `lesson.number = i + 1` throws on a `null` array element.
   - Precondition: a JSON body with `lessons: [null]`.
   - Expected: a 4xx validation error.
   - Actual: an unhandled `TypeError` in the hook. The status code depends on Payload's error mapping, which I did not see.
   - Reproduction: create or update with `lessons: [null]` and check the response shape.

4. **Lead (Low).** `bundleVersion.ts:169-170`. The check compares `toId` outputs with strict `!==`, while `isOfficialVersion` (line 63) uses `String()`. If `toId` can return mixed types, a valid write fails with a false `ValidationError`. Separately, `planSgId != null &&` passes silently when a plan has no `subjectGrade`. Confirming either needs `toId`.

5. **Lead (Low).** `bundleVersion.ts:101` reads `req.context[...]` without the `?.` used in `authRateLimit.ts:178`. If Payload can leave `req.context` unset, deleting any version throws. This fails closed. Confirm whether Payload always sets `req.context`.

**Non-candidates**
- `THROTTLED.login.globalMessage` (`authRateLimit.ts:44-45`) is unused. This is dead text, not a defect.
- The `'invalid'` shared bucket (`:187`) affects only malformed requests.
- The site-global signup and forgot-password ceilings can be exhausted by anonymous traffic, pausing those flows for everyone. The comments describe this as intended, so I have not reported it.

**Unresolved questions**
- Does `loginClient(req, target)` (`:191`) include the target? If it does, the per-client aggregate login budget described at `:9-11` is not enforced.
- Does the endpoint that sets the reset-link context pass the same `req` object to the hook?
- What is the order of `beforeValidate` and `beforeChange` for the version hooks? This decides candidate 2.
- Is `lessonPlan` on versions restricted by field access or `enforceVersionImmutable`? This decides candidate 1.
