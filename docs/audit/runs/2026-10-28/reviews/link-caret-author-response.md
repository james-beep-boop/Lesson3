# Haiku response — consecutive link insertion

Terminology edit in copied response: “the editor” → “the person editing”. The raw response remains private.

## C1 (consecutive insertion): confirmed in both browsers, severity amended to Low

**Verdict:** I keep C1 as a defect and drop the "uncertain lead" label. I amend severity from Medium to Low, which agrees with the Sol critique. I also amend causal certainty: the divergence is established, but the exact mechanism is only partly established. I have not run anything. This rests on the supplied source and the reported output.

**Source check (agrees with the critique):**
- `cursorRef` is written only in `rememberAsTarget`, and that runs only from the four capture handlers. `showDialog` does not refresh it.
- `insert` reads `cursorRef.current`, not the live `selectionStart`.
- The test reads the live `selectionStart` before the second insert and passes that check in both browsers. So the DOM caret is correct, and the insert offset comes from a different value.

**Output check (corrects my original prediction):**
- **Chromium:** after the first insert the value is `Alpha(…/one) Beta`, 39 characters. The second URL's `/two` sits at index 63, which is 39 + 24. That means the second insert went to end-of-text. My original prediction matches Chromium.
- **WebKit:** the order `Alpha(…/two)(…/one) Beta` means the second insert used offset 5, the caret position from the keyboard presses before the first insert. My end-of-text prediction is wrong for WebKit. The stale value differs by browser.
- The arithmetic matches both logs exactly, so the reported output is consistent with the ref-versus-DOM divergence.

**Causal certainty:**
- **Established:** the insert offset differs from the live DOM caret, in both browsers, with the DOM caret verified just before the second insert.
- **Not established:** that a stale ref is the sole cause. The component does attach focus and select listeners, and I have no instrumented event trace.
- **Best-fit, untested:** in Chromium, the focus capture fires after React assigns `value`, reads end-of-text, and stores it. In WebKit, no capture fires after the insert, possibly because `focus()` is a no-op on an element that is already focused. I have not verified either.

**Browser evidence detail:** WebKit failed at the one-before-two assertion (line 626), so it never reached the trailing-word assertion. Its log shows `twoBeforeTrailingWord: true`, so that check would also be a pass. Chromium failed the trailing-word assertion (line 627). Both fail ordering, through different assertions.

**Severity (Low):** the wrong position is visible in the field when it happens, so the person editing can see and fix it by hand. The link's label and URL stay together, so the target is correct and only the placement is wrong. Nothing is lost or exposed. I would move this back to Medium if the owner treats a misplaced link in published Word or PDF output as a content-correctness failure, or if long fields make the error likely to go unnoticed.

**Fix direction (not applied, audit only):**
- In `insert`, read `textarea()?.selectionStart` and fall back to `cursorRef.current` only when the textarea is absent. This removes the dependency on event timing.
- A stronger native control does not seem necessary. Textarea selection should persist while the field is unfocused in both engines, but that is an expectation I have not verified.
- Validate by rerunning both projects, and tighten the assertion to check the exact expected offset rather than relative order.

**Open questions:**
- Unresolved question 3 is now answered for the two Playwright projects that ran (Chromium and WebKit). Other browsers are unknown.
- C2, C3, C4 and the other open questions are not touched by this browser evidence and stay as stated in the original assessment.
