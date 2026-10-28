# P021-04-model

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

**Coverage**

- Read: `app/src/collections/Users.ts:1-400` and `:401-435` (whole file, 435 lines).
- Read: `app/src/fields/bundleFields.ts:1-69`.
- Read: `app/src/fields/identity.ts:1-112`.
- Not assessed: the policy excerpts were used as context only. Imported modules (`access/*`, `hooks/userRoles.ts`, `hooks/fieldSplit.ts`, `hooks/mutationAuthority.ts`, `endpoints/*`, `lib/*`), migrations, and tests were not in the supplied ranges. I have not checked any caller, hook body, or runtime behavior beyond these lines.

**Purpose and invariants (as stated in the supplied code)**

- `Users.ts`: Users collection with three user types, including `roles` (global site admin) and `assignments` (per subject-grade `subjectAdmin`/`editor`). Field access gates the privileged fields. `signInDisabled`, `grantedBy`, `grantedAt`, and `_verified` are system-written. Hooks guard the last site admin and stamp provenance.
- `bundleFields.ts`: field factories. `prose()` adds `canEditProse` field access. `proseAdmin` and `structureText` have no field access. The stated authority for editing-access splits is the `fieldSplit` whitelist, which is not in range.
- `identity.ts`: UUID `uid`, `installationId`, and ingest-only release fields. Each is generated or preserved in a field `beforeChange` hook, so no caller can choose the value.

**Checked and ruled out**

- `identity.ts:36-40`, `:83-90`: the ternaries parse as `(a || b || c) ? randomUUID() : previousValue`, as intended.
- `identity.ts:104-109`: `aresReleaseField` keeps the stored value on update and reads context only on create, matching its comment.

**Candidates**

No confirmed defects from local reasoning. All three below are uncertain leads.

1. **Provenance may be wiped on unrelated `assignments` edits (lead, medium if real).**
   - Evidence: `Users.ts:344-352` allows `update` for `assignmentsUpdateField`. `Users.ts:407-431` sets `grantedBy` and `grantedAt` to `update: () => false`. The comment at `:387-391` says `stampAssignmentProvenance` restores provenance, and `:417-420` says carry-forward relies on the stored id. The policy excerpt says Payload field access nulls optional subfields inside open arrays rather than retaining them.
   - Precondition: a permitted Site Admin, or a Subject Admin within scope, updates one row of `assignments` on a user with existing rows that have `grantedBy` set.
   - Expected: `grantedBy` and `grantedAt` on untouched rows are unchanged.
   - Actual: not determined. It depends on `hooks/userRoles.ts`, which was not supplied.
   - Repro test: seed a user with two assignments that have provenance. As a Site Admin, PATCH the user to change only row 1's `role`. Assert row 2's `grantedBy` and `grantedAt` equal their pre-edit values. Repeat as a Subject Admin.

2. **Editable-looking prose that the whitelist may silently discard (lead, low–medium).**
   - Evidence: `bundleFields.ts:36-46` gives `prose()` fields `update: canEditProse`, and the UI would render them editable. `:11-15` says editing-access rights come only from the `fieldSplit` whitelist, "regardless of which factory created it". `:53-54` says any field not created by `prose()` is admin-only by default.
   - Precondition: a `prose()` call site whose name is absent from the whitelist, edited by a Teacher with editing access.
   - Expected: either the control is read-only, or the edit is saved.
   - Actual: not determined. The edit may be discarded without a message. Separately, field-level `update: canEditProse` may null optional subfields in open arrays for callers who fail it. That is the same class of effect the file's own comment warns about.
   - Repro test: for every `prose()` call site, assert it appears in the teacher whitelist, or that a teacher PATCH of that field persists or is refused with a visible error.

3. **Session-length comment may not match the config (lead, low).**
   - Evidence: `Users.ts:76-81` calls `tokenExpiration: 7200` a "2-hour inactivity window". The value is in the config as a lifetime, and the inactivity behavior is claimed to come from admin refresh settings, which are outside range.
   - Precondition: a session with activity, then an idle gap, then a request.
   - Expected: per the comment, idle sessions clear after about two hours, and an active session is not cut off mid-work.
   - Actual: not determined from supplied code.
   - Repro test: log in, make requests at intervals, and check the token `exp` and whether it refreshes.

**Informational, not a finding**

- `Users.ts:100-104`: the verification token and URL are interpolated into HTML without escaping or `encodeURIComponent`. Supplied code does not show the token can contain special characters, so I have not claimed an exploit.

**Unresolved questions**

- Does `save-as-new` or any batch create in one request reuse a `req.context` that already holds `RELEASE_FINGERPRINT_CONTEXT` or `ARES_RELEASE_CONTEXT`? If it does, copies would inherit a release identity, contradicting the claim at `identity.ts:49-50`. This is the most important question for this file.
- Does the whitelist in `hooks/fieldSplit.ts` cover every `prose()` call site (lead 2)?
- Do `stampAssignmentProvenance` and `enforceAssignmentScope` preserve provenance on rows the caller did not send (lead 1)?
