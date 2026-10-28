# P076-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope:** Correctness review of the supplied text only. I made no tool calls, checked out nothing, and did not verify that the pasted text matches baseline `6e75a173`. I did not read the upload endpoint, `releaseDecision`, `OfficialPreviewList`, or any caller, so nothing below describes server or runtime behavior.

**Ranges read (all of them):**
- `app/src/components/UploadBundles/index.tsx:1-400`
- `app/src/components/UploadBundles/index.tsx:401-429`
- `app/src/components/UserMenu/DisplayNameForm.tsx:1-140`
- Policy excerpts (§7, §8, release/Official rules), used only as the expected-behavior reference.

**Purpose and invariants observed:**
- `UploadBundles` is a Site-Admin-only upload panel. It hides itself for non-admins, which is cosmetic; the server is the stated authority. On 409 it keeps the files, asks about missing taxonomy, and resubmits the same files with `createTaxonomy` and `confirmOfficial`. Similar-named subjects must be answered before submit (lines 118–126, 159–163).
- `DisplayNameForm` is a self-edit PATCH. Its edit state lives in its own component, so closing the menu resets it. It times out after 15 s and refuses blank names client-side (lines 57–103).

**Candidates**

1. **Official-only confirmation may be unreachable in the UI (medium; uncertain lead).**
   - Evidence: `index.tsx:119` opens the confirmation only when `json.needsConfirmation && Array.isArray(json.missing)`. Otherwise a 409 falls through to line 133 and shows `json.error || "Upload failed (409)"`.
   - Policy says an Official-replacing upload returns 409 with `needsConfirmation`, `official` and `previewToken`. It does not say `missing` is always present.
   - Expected: the Official-replacement preview and Confirm button appear. Actual, if the server omits `missing` when there is no missing taxonomy: a generic error, and nothing is written.
   - Test: component test with a mocked fetch returning `409 {needsConfirmation:true, official:[…], previewToken:"t"}` with no `missing`. Assert the `lp-upload-confirm` fieldset renders. Settling this needs the endpoint's 409 body, which is not in scope.

2. **Opening the file picker hides an active confirmation while the files stay selected (low; confirmed locally).**
   - Evidence: `index.tsx:220` runs `clearReport` on click, and `clearReport` (lines 85–89) sets `missing` to null. The `files` state is not cleared. Cancelling the OS dialog fires no `onChange`, so the Upload button stays enabled and the confirmation is gone.
   - Expected: the pending confirmation survives a cancelled picker, or is cleared together with the files.
   - Test: render with `missing` set, click the input, and assert whether the fieldset is still present.
   - Effect: the next Upload re-triggers the 409, so this fails closed. It is a UX inconsistency, not a write risk.

3. **Answer changes discard manual grade ticks (low; confirmed locally).**
   - Evidence: `answer()` at lines 164–170 sets every grade for the subject to `value === 'new'`, overwriting earlier unticks.
   - Effect: the approvals list is still filtered correctly, so this is not a safety issue. The admin may need to re-untick grades.

4. **Hard-coded API base in `DisplayNameForm` (low; uncertain).**
   - Evidence: `DisplayNameForm.tsx:73` uses `/api/users/${userId}`. `UploadBundles` builds its URL from `config.serverURL` and `config.routes.api` (`index.tsx:96`).
   - Effect: this only matters if the admin and frontend surfaces use different API bases. Not verified.

**Not found:** no confirmed defect in the pasted client code that would write data incorrectly or bypass a confirmation. Authorization, the token binding, the write transaction, and the `isSiteAdmin` gate are not in these ranges and are unreviewed.

**Unresolved questions**
- Does the server always include `missing` (possibly empty) on 409? This decides candidate 1.
- Does the server return JSON on proxy-level 413s? If not, `res.json()` at line 117 throws and the user sees a raw parse message (not checked).
- Is `DisplayNameForm` ever rendered in a document with another `#user-menu-name` open at once (not checked)?
- Are PATCH CSRF protections in place for the self-edit route? Unreviewed security claim.
