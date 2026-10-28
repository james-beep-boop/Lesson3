# P074-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Audit scope (partial, supplied text only)

I made no tool calls. I read the file contents supplied in the message, which I have not checked against baseline `6e75a173`.

**Read:**
- `app/src/components/Manage/useOpenPanels.ts:1-298`
- `app/src/components/Modal/index.tsx:1-177`
- `app/src/components/NewTabLink.tsx:1-36`
- `app/src/components/NewerAresPrompt.tsx:1-66`
- `app/src/components/OfficialUpdateNotice.tsx:1-21`

**Not assessed:** `panelState.ts`, `LocalTime`, `editingViewport`, `aresReleasePresentation`, Next.js internals, all callers, and tests. The policy excerpts were used as context only, and the §8 excerpt is truncated.

## Purpose and invariants

- **useOpenPanels:** mirrors accordion state into the URL. Ordinary toggles use `replaceState`, cross-panel jumps use `router.push`, and the `at` target is consumed once. The server-derived open set prevents hydration mismatch, and open ids are re-gated against current availability.
- **Modal:** portalled `role="dialog"` with `aria-labelledby`. Escape and backdrop click route through `onClose`. Focus moves in on open and is restored on close. Tab is trapped in the panel, and body scroll is locked.
- **NewTabLink:** external link with `noopener noreferrer` and an accessible "opens in a new tab" suffix.
- **NewerAresPrompt:** session-only dismissible notice. "Combine" navigates to the combine view with the Official id, checked against window width at press time.
- **OfficialUpdateNotice:** presentational notice for a recorded Official change.

## Candidates

**1. Stacked dialogs break Escape and Tab handling. Medium-low, conditional.**
`Modal/index.tsx:95-98, 100-126, 128`
- *Precondition:* two `Modal` instances are mounted at once. I did not verify that any caller does this.
- *Mechanism:* each instance adds its own document `keydown` listener with no stack. Both run for every key press.
- *Actual:* Escape calls `onClose` on every mounted dialog. A Tab from a middle control in the newer dialog runs the older listener first. That listener sees focus outside its panel and moves it to the older dialog's first control. The newer listener then moves focus to the newer dialog's first control, not to the next one.
- *Expected:* the file's own header (lines 8–10) says keyboard focus stays within the panel. Escape-closes-topmost-only is standard dialog behaviour but is not stated in this file.
- *Confidence:* listener ordering is confirmed by local reasoning. Whether the app stacks dialogs is unverified.
- *Repro:* mount two `<Modal>`s with three focusables each. Focus the middle control of the top one and dispatch Tab; expect the third control. Dispatch Escape with a spy on each `onClose`; expect only the top one to be called.

**2. Accessible name can differ from visible text. Low.**
`NewTabLink.tsx:29-31`
- *Precondition:* a caller passes `children` that differ from `name`.
- *Actual:* `aria-label` is `${name}, opens in a new tab`, so screen readers announce `name`, while sighted users read `children`. This fails the label-in-name expectation (WCAG 2.5.3).
- *Confidence:* confirmed by local reading.
- *Repro:* render `name="Lesson 3"` with children `"Open lesson"`; assert the accessible name contains "Open lesson".

**3. Focus trap may exclude some in-panel controls. Low, uncertain.**
`Modal/index.tsx:110`
- `el.offsetParent !== null` drops `position: fixed` controls and anything under `display: contents`. Those controls are then outside the trap's boundaries. Needs a browser check with real styles.

**4. Toggle and jump treat unavailable open panels differently. Low, expected behaviour unspecified.**
`useOpenPanels.ts:262-266` vs `:287` and `:127`
- `toggle` keeps unavailable ids in raw state. `jumpTo` builds the URL from the availability-filtered `openNow`, and arrival adopts that set. So a panel that becomes unavailable and returns is reopened after a toggle but not after a jump.
- I have not treated this as a defect because the intended behaviour is not stated.

**5. Notice copy asserts history it cannot check. Lead, caller-dependent.**
`OfficialUpdateNotice.tsx:17-18`
- The component says "The previous Official (…) is still in the version history" whenever `previousSemver` is truthy. The policy requires naming the previous Official only when it is readable in this plan. The component has no way to check that, so this is only a defect if a caller passes an unverified value.
- Line 15 renders `release` as given. Whether it is formatted as "14 Nov 2026" is unverified.

**6. No guard inside the Combine prompt. Lead, caller-dependent.**
`NewerAresPrompt.tsx:26-63`
- The component renders for any props. The policy's conditions (Teacher with editing access, surviving older ancestor, not already based on the current Official) must be enforced by the caller. The 640px threshold lives in `editingViewport`, which I did not read.

**7. Unvalidated cast of server open set. Low.**
`useOpenPanels.ts:102`
- `serverOpen as PanelId[]` is unchecked. The `openNow` filter limits what is displayed, but raw state keeps unknown strings, and `toggle` and `withAncestors` still process them.

## Unresolved questions

- Do any screens mount two `Modal`s at once? This decides whether candidate 1 is live.
- Do any callers pass `NewTabLink` children that differ from `name`?
- Does the 640px threshold in `editingViewport` match the policy?
- What format does `aresReleasePresentation` pass as the release date? The policy's "not stated" wording is specified for the header, versions list and details, not for the Official notice. Should the notice use the same wording?
- Is keeping unavailable panels open across jumps (candidate 4) intended?
- Do the supplied ranges match baseline `6e75a173`?

No confirmed high-severity defect appears in these five files. This is a partial assessment limited to the listed ranges and makes no coverage claim beyond them. Security and integrity conclusions remain unreviewed until independent review.
