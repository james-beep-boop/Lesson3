# Plan: native editing locks (audit F-C22-002, Medium)

**Status:** **implemented** (2026-10-24). The operator approved this plan and chose to open the PR after #439 merged. Results and the two refinements made while building (unlock is own-lock-only; L-CL-002 is reported, not closed) are in DECISIONS 2026-10-24, "Native document locks enforced". Follows DECISIONS 2026-10-24 "Native document locks" exactly; no new policy.

## The problem in one paragraph
Payload generates a hidden `payload-locked-documents` collection with "any signed-in user may create, read, update, delete" (installed 3.91.0 `locked-documents/config.js`). Every collection in the app is lockable by default, and Payload's REST update/delete refuse with 423 while someone else holds a fresh lock. So any Teacher can POST a lock (in anyone's name) on a version, a plan or a user, refresh it every 5 minutes, and an administrator's delete or role change fails with a raw "locked" error.

## The fix
1. **Lock rows: access set on the built config** (same seam as #439, `access/generatedSurfaces.ts`, because Payload offers no override for this generated collection either; fails closed if the slug disappears).
   - **create: nobody over the API.** Payload's editing form creates locks server-side through `payload.db`, which skips access, so the native UI is unaffected. This removes the forging primitive.
   - **read: every signed-in user** (decision 1). Unchanged, written explicitly with a comment.
   - **update (Take over): only to yourself, only the `user` field, and only if you may edit the target document.** "May edit" reuses each target's own update rule: plans, subjects and subject grades use their collection `update` access; versions use `versionUpdateGrantForFormRenderOnly`, recorded as a documented exception in `access/versionImmutability.ts` (a lock is form-session state, which is exactly what that grant describes).
   - **delete (unlock on leave): your own lock, or a lock on a document you may edit.**
2. **Locking off where there is no Take over UI** (decision 2): `lockDocuments: false` on `users`, `favorites`, `messages`, `edit-recovery`, `discussion-topics`, `discussion-replies`, `discussion-participation` and the `system-settings` global. Kept on `lesson-bundle-versions`, `lesson-plans`, `subjects`, `subject-grades`. Needs one generated migration (drops the lock table's relationship columns for those collections; transient rows only).
3. **Plain message on App deletes** (decision 3): delete version (`LessonControls`), delete candidate (`CandidateList`) and delete plan (`DeletePlansPanel`) keep honouring a real lock, but a 423 shows "Someone is editing this right now. Try again in a few minutes." instead of the raw error. One shared helper.
4. **Check during implementation:** whether the form-state path (`buildFormState`) can create a lock on a document the caller cannot read (audit lead L-CL-002). If it can, close it in the same PR if small, otherwise report it.

## Tests (wire-level, per CLAUDE.md)
- `tests/http/lockedDocuments.http.spec.ts`: POST lock as Teacher, Teacher with editing access, Site Admin → 403; anonymous → 401/403. Take over to yourself on an editable version → 200, holder changes. Take over naming someone else → 403. Take over by a Teacher without editing access → 403. Changing `document` in a PATCH → 403. Own unlock → 200; deleting someone else's lock on a document you cannot edit → 403.
- Same file: a legitimate lock on a version makes another administrator's DELETE return 423 (decision 3), and a user PATCH/DELETE by a Site Admin is never 423.
- DB-free unit spec on the built config: lock access functions are wired, and the lockable set is exactly the four collections.
- Unit test for the 423 message helper.
- Browser regression (from the audit's lock test): peer "Document locked" dialog still appears and Take over still works.
- Red before / green after recorded in DECISIONS; full gate (types, lint, unit, int, http).

## Sequencing
The lock access needs the built-config seam that #439 adds, so this PR opens against `main` after #439 merged. #439 itself is not touched.
