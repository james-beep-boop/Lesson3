# Supplemental omission-check output — sealed original

Read with [the method qualification](../method-limitations.md). This is original author output, not accepted findings. Its test suggestions were not execution results.

# Blind source review: access control, version write paths and ingest

Source is the fixed commit 6e75a173. This is a read-only review with no tools, no execution and no tests run. Every "check" below is a procedure for someone else to run, not a result.

**Result:** 3 low-severity findings, with the first potentially upgradable, and 5 unconfirmed leads. I found no confirmed breach of the version-immutability, Official-pointer, confirmation-token or upload-authorization boundaries in the supplied code.

## Findings

### F1. A teacher's save-as-new silently drops the admin-owned `unit` when the key is omitted
- **Severity/confidence:** Low-to-Medium (it crosses a role boundary but needs a crafted request). Confidence is High that the code path exists and Medium end to end, because `DROP_KEYS`, `stripIds` and Payload's create semantics are unseen.
- **Preconditions:**
  - The caller has editor-only access in the version's subject-grade.
  - The caller POSTs multipart to `/api/lesson-bundle-versions/:id/save-as-new`.
  - The `data` field is the source JSON with the `unit` key deleted.
  - `updatedAt` matches the source. Everything else is valid.
- **Expected (SPEC §5):** `unit` is not teacher-editable, so it is preserved from the source or the save is refused.
- **Actual, by trace:**
  - `applyEditorFieldSplit` restores non-editor keys only for keys present in the submission (`app/src/hooks/fieldSplit.ts:308-311`).
  - `unit` is not in `VERSION_EDITOR_KEYS` (`hooks/bundleVersion.ts:20-25`) and is not rebuilt.
  - `finalExplanation` and `summaryTable` are rebuilt unconditionally (`fieldSplit.ts:361-384`), so `unit` is the one container left uncovered.
  - `generatableFieldErrors` only requires `meta` and `lessons` (`ingest/validateGeneratable.ts:50-64`). An omitted `meta` is caught there and an omitted `title` by required-field validation, but an omitted `unit` is not caught anywhere.
  - The no-op guard (`endpoints/versionEdit.ts:224-230`) sees a difference and lets the save through.
  - The create at `versionEdit.ts:281-296` therefore stores a version without UNIT.
- **Check:**
  1. As an editor-only user, GET a version and delete `unit` from the JSON.
  2. POST it to `save-as-new`, optionally with a one-word prose change.
  3. Compare the new version's `unit` with the source's, and check whether the exported documents lose the sub-strand overview.
- **Mitigating:** a normal UI form should submit `unit`, since the conditional field keeps its value. The result is a new, non-Official, deletable candidate. An admin could later make it Official.
- **Suggested fix direction:** restore `unit` from the source whenever the submission lacks it, as `rebuildGroup` does.

### F2. A Subject Administrator can change "never editable by anyone" ARES identity fields by direct request
- **Severity/confidence:** Low, High confidence in the code reading.
- **Location:** the Subject Admin branch of `applyEditorFieldSplit` (`fieldSplit.ts:240-248`).
- **Expected (SPEC §5, "Stored faithfully, but never editable by anyone"):** `META.outputDir`, `LESSONS[].substrand` and `LESSONS[].aresKeywords` are protected by the whitelist, which "is secure by default".
- **Actual:**
  - The whitelist only constrains teachers.
  - The Subject Admin branch returns `data` wholesale apart from the META identity keys and `resourceLinks`.
  - A crafted `data` can therefore alter those three fields in a new version.
- **Why it matters:** SPEC §6 uses `substrand` and `aresKeywords` as "system upload identities" for Combine row alignment. Altering them can make a later Combine refuse or mis-pair lessons, though not silently.
- **Check:** as a Subject Admin, save-as-new with a changed `lessons[0].aresKeywords`. Then compare the new and source versions.

### F3. Sub-strand identity is trimmed on the query side but compared raw against stored values
- **Severity/confidence:** Low, Medium-High confidence.
- **Location:** `ingest/index.ts:110-113` (trim) against `findExistingPlan` at `index.ts:131-142` (`meta.substrand_id equals <trimmed>`).
- **Why:**
  - The contract places no pattern or trim constraint on `substrand_id` (`ares-contract.schema.json:23`).
  - The stored `meta.substrand_id` is the raw string.
  - `latestRelease` trims the stored side (`releaseAncestry.ts:21`), which shows trimming was intended to be symmetric.
- **Precondition:** a lesson file whose `META.substrand_id` has leading or trailing whitespace, e.g. `" 1.4"`.
- **Expected:** a re-upload attaches to the existing plan as the next major.
- **Actual:**
  - The query for `"1.4"` does not match the stored `" 1.4"`, so no plan is found.
  - A second plan is created at 1.0.0 Official, and every later upload mints another one.
  - The in-batch duplicate guard (`index.ts:688-710`) also keys on the trimmed value, so within one request `" 1.4"` and `"1.4"` are caught as duplicates while across requests they are not.
- **Check:** upload the same file twice with `substrand_id: " 1.4"` and count the lesson plans.

### F4. Unbounded `META.subject` length drives quadratic work and cannot be approved
- **Severity/confidence:** Low (Site Administrator-only input), Medium confidence.
- **Location:**
  - The contract sets no `maxLength` on subject.
  - `classifyMissingTaxonomy` runs Levenshtein on full strings for new-versus-new pairs (`taxonomy.ts:44-58, 136-141`).
  - `parseApprovals` rejects any approval subject longer than 200 characters (`uploadBundles.ts:172`).
- **Effect:**
  - Two files with different, very long new subject names can block the event loop for a long time.
  - An over-200-character subject is offered in the 409 preview but a resubmission returns 400 for the whole request.
- **Check:** upload two files whose `META.subject` is about 100 kB, differing at the first character. Then try approving a 201-character name.

## Leads (unconfirmed, need unseen code or Payload internals)

1. **Possible account takeover through generic user PATCH.**
   - `usersCollectionUpdate` grants every Subject Admin collection-level update on every user (`access/index.ts:168-174`). Protection of credential-like fields rests entirely on field access.
   - The spec shows `_verified`, `_verificationToken` and `sessions` were inspected, and `guardPasswordChange` covers `password`.
   - I cannot see whether Payload's base `resetPasswordToken`, `resetPasswordExpiration`, `hash` and `salt` fields deny create and update.
   - If any is writable, a Subject Admin could set a known reset token on a Site Administrator and reset their password.
   - **Check:** as a Subject Admin, PATCH `/api/users/:siteAdminId` with `{resetPasswordToken, resetPasswordExpiration}`, then POST `/api/users/reset-password`. Also inspect the installed `auth/baseFields`.
   - **Severity if true:** Critical.
2. **Pre-warm inside the ingest transaction.**
   - `ingest/index.ts:1013-1016` says pre-warm "rides this transaction".
   - `hooks/lessonPlan.ts:406-409` says that since L3-03 pre-warm never enlists job rows in the caller's transaction.
   - If the second is true, jobs can run before commit and miss the version, or reference a rolled-back one.
   - Needs `prewarmVersionArtifacts` to settle.
3. **The re-authorization after waiting depends on `refreshCaller` updating `req.user`.**
   - `applyEditorFieldSplit` reads `req.user` (`versionEdit.ts:349-364`). If `refreshCaller` returns a new user without assigning it, the "permittedNow" recheck is vacuous for demotions.
   - Separately, save-as-new takes the plan lock before the refresh, while the spec's lock order is advisory before row. Confirm `refreshCaller` takes no advisory lock.
4. **`DROP_KEYS` completeness.**
   - Teacher saves carry the submitted `updatedAt` through as an editor key (`bundleVersion.ts:20-25`) into `content` (`versionEdit.ts:204-206`).
   - `updatedAt`, `createdAt`, `id` and `lineage` must be dropped or overridden. I could not see `lib/versionContent.ts` or `lib/combine/lineage.ts`.
5. **Other Payload-generated surfaces.**
   - `applyGeneratedSurfacePolicy` covers only the lock collection and the job-stats global (`access/generatedSurfaces.ts:47-68`).
   - Check the installed version for other generated collections, such as `payload-kv` or `payload-preferences`, whose default access might admit any signed-in user.

**Minor observations, not findings:**
- **Make Official** reads the previous pointer before the plan lock is taken (`versionEdit.ts:430-446`; the lock is acquired in `refreshMutationAuthority` during the update). In a race the reported `previousOfficialId` and the stale-consent 409 can disagree with `officialChangedFrom`. Deletion still targets the consented version and `enforceOfficialNotDeletable` re-checks under lock.
- **Inconsistent subject-grade lookup:** `access/versioning.ts:10-14` prefers `data` over `doc`, while `access/bundle.ts:19-23` prefers `doc`. It is not exploitable here because collection-level `Where` scoping applies first, but it is fragile.
- **Missing explicit `overrideAccess`:** the pointer update at `ingest/index.ts:1005-1012` omits `overrideAccess`, unlike its siblings, despite the nearby comment.
- **Dev CLI:** the dev path (`ingestItems`) has no release de-duplication, so re-running mints duplicate majors. This is per spec and I did not review `scripts/ingest.ts`.
- **Upload body size:** the upload body cap depends on `Content-Length` (`uploadBundles.ts:57-67`). A chunked body is buffered by `formData()` first. This is Site Administrator-only.

## Coverage and limits

**Traced, no defect found:**
- **Version immutability:** the pair in `access/versionImmutability.ts`, including its use for native locks.
- **Lock policy:** `lockedDocuments.ts` (create, update, delete), and the job-stats and locks policy code in `generatedSurfaces.ts`.
- **Assignments:** `enforceAssignmentScope` (D6a, including the handover target check against `before`) and `stampAssignmentProvenance`.
- **Plan integrity:** plan `subjectGrade` immutability, Official-pointer validation and the official-change stamps.
- **Delete policy:** `deletableVersionsWhere` and `canDeleteVersionDoc` agree.
- **Ingest write path:** lock order (taxonomy advisory, then subject-grades, then plans, then re-resolution), confirmation-token binding and the second check under lock, release decisions, ancestry selection.
- **Upload inputs:** the ZIP central-directory counter's bounds, the safe `.js` and `.json` extractors, and the contract validator.
- **Messages and manifest:** the length arithmetic in `releaseSummary` and the manifest parser.

**Not seen, so not reviewed:**
- **Endpoints and libraries:** `endpoints/respond.ts`, `lib/readBundle.ts`, `previewParse.ts`, `recoveryParse.ts`, `lib/versionContent.ts`, `lib/semver.ts`, `lib/relId.ts`, the edit-recovery kernel, and `jobs/prewarmVersionArtifacts.ts`.
- **Other collections and scripts:** `fields/lessonContent.ts`, the Subjects and SubjectGrades collections, public-library routes, `scripts/ingest.ts` and the migrations.
- **Payload internals:** their behavior is assumed only as the in-repo comments describe it (hook order, `overrideAccess` defaults, `req.context` replacement, hidden-field writes). I did not verify any of it.

**Dev versus production CLI:** the `scripts/import-lessons.ts` flow (`importLessons`) was treated as the supported production CLI and the dev CLI as atomic and unconfirmed. The intentional `overrideAccess` system writes in ingest were not counted as findings.
