# P064-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Coverage (partial; no completed-coverage claim)**

Read as supplied:
- `app/src/components/LessonControls/entryPhase.ts:1-106` (full range)
- `app/src/components/LessonControls/index.tsx:1-400` (full range)

Not assessed: `index.tsx` beyond line 400, and every hook, helper, or module the code calls (`useEditRecovery`, `initialCollapseActions`, `access`, `editingViewport`, `advancedTools`, and others). The policy excerpts were used as context only. I made no tool calls, so the baseline commit `6e75a173` and runtime behaviour were not checked. Security and integrity claims are unreviewed.

**Purpose and invariants (as read)**
- `entryPhase.ts`: a module-level slot `closedFor` records which document's entry phase has ended. It starts open. Capture-phase `pointerdown`/`keydown` on `document` close it. `beginEntryPhase` reopens it on a new visit.
- `index.tsx`: the id-keyed effect starts the phase and attaches the input listener, cleaned up on id change (`:209-216`). After 300 ms, if the phase is open, collapse actions run once per document (`:219-238`). `editing = editIntent && canEdit` (`:324`). A mount-only effect clears `editIntent` at ≤640 px (`:272-275`).

**Candidates**

1. **Low (lead, local reasoning only).** `entryPhase.ts:94-105`, stated invariant at `:85-89`.
   - Precondition: touch device; a stored preference leaves a below-the-fold panel expanded; the reader touch-scrolls before any tap.
   - Expected (per the file's own comment): scrolling does not end the phase, so the panel still collapses on the way past.
   - Actual (by reading): the listener is `pointerdown` with no `pointerType` filter. Pointer Events dispatch `pointerdown` on touch contact, before the browser decides whether the gesture is a scroll, so a touch-scroll would end the phase.
   - Repro: Playwright with touch emulation. Call `beginEntryPhase('1')`, attach `endEntryPhaseOnFirstInput('1')`, dispatch a touch `pointerdown` on the document, and assert `isEntryPhaseOpen('1')` is still true. A failure confirms the mismatch. Not run.

2. **Low–medium (lead, depends on unseen hook).** `index.tsx:155`, `:272-275`, `:324`, `:389`.
   - Precondition: viewport ≤640 px, URL `?edit=1`, a user with editing access.
   - Expected (per `:263-265` and `:385-388`): a narrow deep link lands in view mode, and recovery never starts for a user who cannot type.
   - Actual (by reading): `editIntent` initialises to `true`, so the first committed render has `editing === true` and `active === true` passed to `useEditRecovery`. The reset at `:274` runs in an effect after that commit. The recovery hook's effects are declared later (`:383`), so in the same flush they see `active` true. Whether a session starts depends on `useEditRecovery`, which I did not read. The form-unlock logic (not in range) may also apply `editing` before the correction.
   - Repro: Playwright at 600 px width with `?edit=1`. Record every commit and assert fields are never enabled and no draft-create request is sent.

No defect found in: listener cleanup on id change (`entryPhase` usage, `:215`), timer cleanup (`:237`), the `collapsedOnEntryFor` latch, or the `DRAFT_FAILED` exhaustiveness.

**Unresolved questions**
- Does `useEditRecovery` begin capture on the first `active === true` effect, or defer? This decides whether candidate 2 is observable.
- The comment at `entryPhase.ts:28` says "anywhere in the editor", but the listeners are document-wide (`:100-104`). Does this matter? Only if `LessonControls` mounts outside the editor.
- `closedFor` is a single module-level slot. Can more than one `LessonControls` be mounted at once? If so, ending one document's phase would overwrite another's.
- `index.tsx:163` compares `version.id` with `Number(id)`. Is `useDocumentInfo().id` always numeric? If it is a string for some documents, the saved-draft suggestion silently never matches.
