# P055-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope (local reading only; no tools run, no callers or runtime behaviour checked)**

Read in full:
- `app/src/components/CombineVersions/index.tsx:1-345`
- `app/src/components/CompareToOfficialLink.tsx:1-31`
- `app/src/components/Discussions/ComposerParts.tsx:1-49`
- `app/src/components/Discussions/MarkThreadRead.tsx:1-34`

Not assessed: `NewTabLink`, `EditRecovery/restoreDiff` (`renderOf`, `RENDER_NOTE`), `EditRecovery/deadline`, `comparisonError`, `lib/combine/*`, `lib/editRecovery/projection`, `editingViewport`, `Modal`, the discussion composer's `onRetry`, the combine-preview and mark-read endpoints, and `markRangeFor`.

**Purpose and invariants (as read)**
- *CombineVersions*: a picker modal and inline conflict resolver. It loads a server comparison, shows auto-combined changes and conflicts, and continues in the editor (full navigation when the start version differs).
- *CompareToOfficialLink*: opens the Official comparison in a new tab.
- *ComposerParts*: the submit / Post / Try again row. An "uncertain" outcome is shown as a note.
- *MarkThreadRead*: fire-and-forget POST that marks the displayed reply range read after render.

**Candidates**

1. **Stale review reappears after cancelling a URL handoff.** Confirmed local reasoning, Low.
   `CombineVersions/index.tsx:107-117` opens the modal and calls `loadComparison` without setting `loading`. `:118-133` `close()` guards only on `loading`, so Cancel proceeds while the fetch is pending. The late `.then(setReview)` at `:113` then stores a review on a closed modal.
   - Precondition: page loaded with `?combineWith=N`; Cancel clicked before the response (up to 15 s).
   - Expected: reopening via More ▾ (`startSignal`, `:134-145`) shows the version picker.
   - Actual: the `!review` branch (`:152`) is skipped, so the modal opens on the stale comparison. "Continue in editor" (`:236-251`) would pass that stale review to `onBegin`.
   - Repro: mount with `?combineWith=2`, hold the fetch, click Cancel, resolve the fetch, bump `startSignal`. Assert the "Choose another version" select is present. The current code fails this.

2. **Literal "undefined" in user-visible text.** Confirmed local reasoning, Low. Reachability depends on the unseen server contract.
   `:40` interpolates `newer.semver` and `older.semver`, which `:14` types as `string | null | undefined`. The JSX sites (`:179`, `:223`) render blanks, so this is the only path that prints the literal.
   - Precondition: `alreadyIncluded` set, plan ok, no conflicts, empty overlay, a version with null or absent semver.
   - Expected: no literal "undefined" in the message. The supplied policy does not specify the wording.
   - Repro: call `nothingToCombine` with `alreadyIncluded: 'a'` and `a.semver: undefined`; assert the output contains no "undefined".

3. **Possible duplicate post on "Try again".** Lead, unverified, Medium if confirmed.
   `ComposerParts.tsx:24-31` says an uncertain post "may well have landed", then offers Try again. Nothing in range shows an idempotency key, and `onRetry` is out of range.
   - Repro: simulate a server commit followed by a client timeout, click Try again, count topic posts. Expected: exactly one.

4. **`dangerouslySetInnerHTML` sink for combined prose.** Lead, unreviewed security claim.
   `:207-208` injects `rendered.html` from `renderOf`, which is out of range. If `renderOf` does not escape teacher-entered text, this is stored XSS. Needs independent review of `restoreDiff.ts`.

5. **Diff baseline may be the working copy.** Lead.
   `:87-90` builds `savedProjection` from the `document` prop, and `:203` diffs against it. If `document` includes unsaved edits, the "changed" view misstates the saved version. Depends on the caller, which is out of range.

No defect found in `CompareToOfficialLink.tsx` or `MarkThreadRead.tsx` from local reading. The silent `.catch` and unchecked `response.ok` in `MarkThreadRead.tsx:26-31` match its stated "failure leaves replies unread" intent. The range computation is out of range.

**Unresolved questions**
- Can the server return null or absent `semver` for a comparison version? (Candidate 2)
- What does `onRetry` send, and is there a client idempotency key? (Candidate 3)
- Does `renderOf` HTML-escape all teacher text? (Candidate 4)
- Is `document` the saved snapshot or the working copy? (Candidate 5)
- Does `NewTabLink` set `rel="noopener"`? Not assessed.
