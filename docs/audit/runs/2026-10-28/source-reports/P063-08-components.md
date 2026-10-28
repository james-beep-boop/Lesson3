# P063-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: `app/src/components/LessonControls/` (source baseline 6e75a173)

No tools were run and no files were edited. Everything below comes from reading the supplied text. I did not verify that it matches the repository at the baseline commit, and I did not check callers, Payload's DOM structure, or runtime behaviour.

**Ranges read (complete as supplied):**
- `app/src/components/LessonControls/EditJumpNav.tsx:1-391`
- `app/src/components/LessonControls/MoreMenu.tsx:1-82`
- `app/src/components/LessonControls/currentSection.ts:1-119`

Not assessed: the policy excerpts (not source), `entryPhase`, the SCSS, the `lib/advancedTools.ts` gate, and Payload internals.

**Purpose and invariants (as stated in the comments):**
- `currentSection.ts` owns section identity and the scroll-spy rule. The current section is the lowest tracked header whose top is at or above the crossing line, which is the larger of the toolbar bottom and `scroll-margin-top`.
- `EditJumpNav.tsx` provides chips that scroll and open a target, a deep link from `?lesson=n`, and a highlight that follows focus first and scroll position second.
- `MoreMenu.tsx` is a disclosure menu. Escape and item selection return focus to its trigger, and outside clicks close it.

## Candidates

**1. Low, confirmed by local reasoning: a clicked chip can be overwritten by the scroll-spy.**
- Evidence: `EditJumpNav.tsx:198-205` writes `positionKey = id` optimistically. `recompute()` (lines 255-267) runs on every scroll and resize and calls `setPositionKey(pickCurrentSection(...))`. If the target cannot reach the crossing line (the comment at 145 concedes this near document end), `pickCurrentSection` returns the previous section, so the neighbour is lit.
- Precondition: click a chip whose target sits near the document end, so it cannot reach the threshold.
- Expected: the clicked chip is current. Actual: the previous section is current after the scroll events.
- Repro (pure): `pickCurrentSection([{key:'lessons-row-6',top:-200},{key:'field-summaryTable',top:400}], 100)` returns `'lessons-row-6'`. The jump intent was `field-summaryTable`.

**2. Low, uncertain: hidden sections can win the scroll-spy.**
- Evidence: `currentSection.ts:74-84` does not exclude elements that are not rendered. `getBoundingClientRect()` gives `top: 0` for `display:none`, so such an element beats a visible section that has scrolled above the line (top -200).
- Precondition: a tracked section is `display:none`. I have not confirmed that any tracked section can be hidden this way.
- Repro: `pickCurrentSection([{key:'lessons-row-6',top:-200},{key:'lessons-row-7',top:0}], 100)` returns `lessons-row-7`. Expected `lessons-row-6` if row 7 is hidden. The fix belongs in the caller, which should filter by visibility.

**3. Low, uncertain: the deep-link fallback can latch onto a guessed row.**
- Evidence: `EditJumpNav.tsx:320-324`. If no lesson entry has `number === n`, the target falls back to `lessons-row-${n-1}` and sets `didDeepLink = true` as soon as that DOM id exists. Lines 320-321 run before the lesson list is confirmed loaded.
- Precondition: `lessonsRef` lacks the entry while the DOM row exists. Lesson numbers are normally set by order, so this should be rare.
- Expected: wait for the matching lesson number, or give up. Actual: scroll to index `n-1` and never retry.

**4. Low, uncertain: focus return may silently fail.**
- Evidence: `MoreMenu.tsx:26`, `36` and `71`. `trigger` is typed as `HTMLAnchorElement | HTMLButtonElement`, and it is passed to Payload's `Button`. If `Button` does not forward its ref, `trigger.current` is null and focus is never returned. The `?.` hides the failure.
- Precondition: Payload's `Button` does not forward refs. I have not checked this.

**5. Unverified DOM assumptions (not a defect).**
- `currentSection.ts:112-118` relies on Payload's collapsible structure for Final Explanation and Summary Table. If the structure differs, the panel does not open and nothing throws. Lines 107-108 and 221 describe the reasoning, but that cannot be confirmed from this range.

## Unresolved questions
- Can any tracked section be `display:none` at runtime (candidate 2)?
- Should deep-link scrolling end the entry phase? `scrollToField` at line 111 is shared with the deep link (line 324), and the comment at 107 describes a click-only reveal.
- Does Payload's `Button` forward refs (candidate 4)?
- If a tracked row remounts during the 12-second settle loop, the captured `el` at line 105 goes stale. The loop still runs for the full duration. Is that acceptable?
