# P071-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made, so I did not verify the working tree against baseline `6e75a173e822e4c4be42821b0a4af48ca457bd36`, and I did not check callers or runtime behaviour.

**Read (inline in the request):**
- `app/src/components/Manage/SystemFeaturesPanel.tsx:1-278`: fully read.
- `app/src/components/Manage/UnsavedWorkList.tsx:1-134`: fully read.

**Not assessed:** `systemFeaturesState.ts` (reducer, `pendingChanges`), `lib/wireError`, `lib/schoolName`, `lib/systemFlagNames`, `lib/editRecovery/*` (`UnsavedWorkRow`, `ttl`), and the server save/discard endpoints. The policy excerpts were used as context only. Security and integrity claims are unreviewed until independent review.

## Purpose and invariants

- **SystemFeaturesPanel:** a password-confirmed save of the school name and two switches. It sends `expectedUpdatedAt` for optimistic concurrency, clears the password on every path, blocks saving after 409 or 5xx until reload, and validates the response shape before updating state.
- **UnsavedWorkList:** lists the caller's drafts. Discard sends `generation` and `expectedRevision` taken from the server-rendered token, and the rendered row is not refreshed on failure.

## Candidates

No confirmed defects from local reasoning. The following are uncertain leads.

1. **Lead, low: `SystemFeaturesPanel.tsx:182-186` shows "Moderate discussions" (`/discuss`) unconditionally for the Discussions switch.** The panel's own copy at lines 146-147 says switching Discussions off "hides the forum and its entry points." The link is rendered whether `forumEnabled` is on or off. Whether this is a mismatch depends on whether `/discuss` is hidden or 404s when off, which I did not check.
   - Precondition: `forumEnabled` is false (saved or pending).
   - Expected: unknown. The copy suggests the entry point should be hidden, but the policy does not say.
   - Reproduction (only once the expectation is confirmed): render with `forumEnabled: false` and assert whether the link is present.

2. **Lead, low: `UnsavedWorkList.tsx:58-75`.** On a failed Discard (for example a 409 from a moved revision), the catch shows a toast but does not call `router.refresh()`. The stale row, including its "Continue editing" and "Discard" controls, stays on screen until a manual reload.
   - Precondition: another tab changed the capture after the page loaded.
   - Expected: unknown; the comment says the discard is "refused rather than destroyed," which does not say whether the list should refresh.
   - Reproduction: mock the DELETE to return 409 and assert whether the row list re-fetches.

3. **Lead, low: `SystemFeaturesPanel.tsx:119-126` and `:105-106`.** The success message is "School name saved." and the dirty-state text is built from the local `pendingName` (line 207-208). The UI then trusts `result.schoolName` for the saved value. If the server trims or normalises the name, the confirmation text and the saved value can differ. I cannot tell whether the server normalises.
   - Precondition: a name with leading or trailing whitespace, or one the server rewrites.
   - Expected: unknown.

4. **Lead, very low: `UnsavedWorkList.tsx:59`.** `row.versionId` is interpolated into the URL without encoding. This is safe only if the type is a number. `UnsavedWorkRow` was not supplied, so I could not check the type.

## Unresolved questions

- Does the reducer update `savedName` and `updatedAt` on the `saved` action? Without this, the next save could send a stale `expectedUpdatedAt`. (Not assessed.)
- Does the server trim `schoolName`, and does it enforce `MAX_SCHOOL_NAME_LENGTH`? The client sets `maxLength` only.
- What does `wireErrorMessage` return for a 401, and does it ever surface a server message that echoes the password? (Not assessed.)
- Is `row.token` guaranteed to carry both `generation` and `revision`, and is `versionId` a number?
- Does the advanced-tools copy ("does not change anyone's permissions") match the server behaviour? I did not verify it, and I am not treating it as a defect.
