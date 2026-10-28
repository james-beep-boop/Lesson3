# P149-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Assessed as supplied, without tool calls:
- `app/tests/int/editRecoveryUnsavedWork.int.spec.ts:1-309`: read in full.
- `app/tests/int/editorGroupsAccess.int.spec.ts:1-276`: read in full.

Not assessed: the source under test (`src/lib/editRecovery/kernel.ts`, `unsavedWork.ts`, `src/lib/editorGroups.ts`, `src/access/index.ts`), the helper modules (`helpers/fixtures.js`, `helpers/editRecovery.js`), and the migrations and hooks. No tests were run, so no pass/fail claims are made. Policy excerpts were used only as context.

## Purpose and invariants (as stated by the specs)

- **editRecoveryUnsavedWork (U1–U4):** `listOwnCaptures` returns only the caller's rows, and it excludes retired rows, empty sessions and `{}` captures. `countUnsavedWorkOnVersion` reports other users' counts without identities. `listUnsavedWork` lists only versions the caller can edit, and restorability matches the GET endpoint. `hasUnsavedWork` is scoped per user and per version.
- **editorGroupsAccess:** `buildRolesAccess` gives groups and addresses only to Subject Admins (scoped to their grades) and Site Admins. Teachers and editors get no read. The roster is deduplicated and group ids resolve against it. Site Admins are excluded from grant candidates. Other surfaces still hide emails.

## Candidates

**No confirmed product defects** from these ranges. The test assertions match their stated titles and comments, and I found no contradiction that is visible without the source.

## Leads (uncertain, unverified)

1. **Low–medium, uncertain: Site Admin with a Subject Admin assignment may leave a dangling id.** `editorGroupsAccess.int.spec.ts:152-161` asserts that a Site Admin is absent from `access.roster` for a Subject Admin viewer. The group-resolution test at `:170-186` runs only for the Site Admin viewer, and the fixture gives the Site Admin no assignment. If a Site Admin also holds `subjectAdmin` on the grade, `group.subjectAdminIds` could name an id the roster lacks, which the spec at `:153-158` says renders as a blank row. Source for `buildRolesAccess` was not supplied, so this is unconfirmed.
   - Focused reproduction: in `beforeAll`-scoped fixtures, create a user with `_verified: true` and an assignment `{subjectGrade: fx.subjectGrade.id, role: 'subjectAdmin'}` using `context: { skipAutoDemote: true }` and `overrideAccess: true`. Then, for `accessFor('subjectAdmin')`, assert that every `group.subjectAdminIds` entry appears in `roster` and that the Site Admin's own id is not hidden from the group.
   - Expected: every subject admin id resolves in the roster. Actual: unknown until the test runs.

2. **Test overclaim, not a product defect:** the title at `editRecoveryUnsavedWork.int.spec.ts:229` says the Teacher is "answered without a query," but the body asserts only the empty result. The comment at `:230-231` says the early return keeps the query off the page. The title is not backed by an assertion.

3. **Cleanup risk, unverifiable:** `editRecoveryUnsavedWork.int.spec.ts:262-283` deletes the plan, then the subject-grade, in `finally`. This works only if the version cascades on plan delete. Also `grade: 11` at `:243` assumes no existing row for that grade. Neither is checked here.

4. **Ordering flake risk:** the "newest first" test at `:111-118` relies on capture timestamps distinguishing two writes made in sequence. This is a possible flake, not a defect.

## Unresolved questions

- **Scope of the email carve-out:** `editorGroupsAccess.int.spec.ts:139-150` pins that a Subject Admin sees the addresses of the whole grantable roster, not only their own grades. The policy excerpt grants the carve-out to "every administrator who can grant access" and does not define the address scope. The spec comment calls this "materially wider exposure." Is the whole-roster disclosure the intended policy? I did not infer it from the implementation.
- Does `buildRolesAccess` drop subject-admin holders who are also Site Admins from `roster`? Answering this needs the source file, which was not supplied.
