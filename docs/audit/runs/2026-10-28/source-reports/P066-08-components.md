# P066-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/src/components/LessonControls/index.tsx:801-1200`

No tools were called. Everything below comes from the supplied excerpt. I did not read lines 1-800 or 1201 onward, and I did not check callers, `recovery`, `withUnsavedWarning`, `captureFieldPath`, `documentLockedMessage`, or the server routes.

**Ranges read:** `app/src/components/LessonControls/index.tsx:801-1200`. Line 1200 is cut off mid-expression, so the final JSX is not fully assessed.

**Purpose and invariants (as read):** This range covers the end of the save-as-new handler, the delete handler, the Preview and View-as-PDF handlers, the Combine entry points, and the edit-mode button bar. Relevant invariants visible here:
- The request body is a snapshot taken before awaits. Recovery tokens are sent as separate multipart fields.
- Save failures are reported inline with the text kept on screen.
- Delete and save both ask for confirmation first.
- The Save button is disabled when the form is unmodified.

### Candidates

**1. Edits made during save preparation may be dropped (lead, medium, unverified reachability)**
- Evidence: `index.tsx:808` takes `snapshot = JSON.stringify(currentContent())`. Then `:811` awaits `recovery.prepareForSave()`, and `:829-835` awaits `withUnsavedWarning` before `window.confirm`. On success, `:886` calls `setModified(false)` and `:891` navigates away.
- Local reasoning (confirmed): any change to the form between `:808` and the response is absent from the POST body, yet `modified` is cleared at `:886`.
- Unverified: whether the form accepts input during these awaits. The lock that would prevent it is set before line 801, which is not in the range.
- Expected: every visible edit is either saved or still marked dirty after success.
- Actual (per code): a late edit is not in the saved body, and the dirty flag is cleared.
- Reproduction: render the editor. Make `recovery.prepareForSave` return a deferred promise. Change a prose field while it is pending. Resolve with `proceed: true` and a token. Assert that the `data` form field contains the new text, or that `modified` stays true after the response.

**2. Combine button may use the wrong other parent and wording (uncertain, low to medium)**
- Evidence: `index.tsx:1038-1055` shows a "Combine with {semver}" button. It navigates to `combineWith=${savedDraftSuggestion.id}`.
- Policy (excerpt): the "Combine them?" suggestion should open Combine with **Official** as the other parent, and it should appear only when the user's latest saved version has an ARES ancestor older than the current Official.
- Local reasoning (confirmed): this button is labelled differently and its other parent is `savedDraftSuggestion`, not an identifier the excerpt ties to Official.
- Unverified: whether `savedDraftSuggestion` is the Official version, and whether `offerCombine` enforces the ancestry condition. Both are defined outside the range.
- Reproduction: render with `offerCombine` true, `canEdit` true and `editing` false, and `savedDraftSuggestion` set to a non-Official version. Assert the navigation target and label against the policy. Expected: Official is the other parent and the label is "Combine them?".

**3. Missing conflict value appears as blank (lead, low)**
- Evidence: `index.tsx:1084-1087`. If `captureFieldPath` returns null, or the path is absent from `fields`, `valueFor` returns `''`.
- Expected: an unmapped field is distinguishable from an empty value, so the conflict UI does not present an empty string as the current value.
- Actual (per code): the two cases produce the same output.
- Reproduction: call `valueFor` with a conflict whose field has no path, and check whether the UI shows a missing-value state.

**4. Delete warning may count the caller's own draft (lead, low, unverified)**
- Evidence: `index.tsx:909-914` calls `withUnsavedWarning` without `{ countCaller: false }`. The save path at `:830-833` passes that option, with a comment explaining why.
- Unverified: what the default counts, and whether delete retires the caller's draft first.
- Reproduction: with one unsaved draft held by the caller and no others, open Delete and check the warning text for an incorrect "other sessions" count.

### Unresolved questions
- Is form input locked between the start of `onSave` (before line 801) and the response? This decides whether candidate 1 is reachable.
- What does `savedDraftSuggestion` contain, and is `offerCombine` gated on the policy's ARES-ancestor condition?
- What does `withUnsavedWarning` count by default?
- Does `documentLockedMessage` read the response body? If it does, `errorMessage` at `:927` could hit a consumed body. Only the response's `ok` status is checked in the excerpt.

Security and integrity claims in this range remain unreviewed until independent review.
