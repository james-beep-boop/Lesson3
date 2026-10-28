# Original Haiku-author recheck — browser evidence

## Verdict: retain as Medium, amend the mechanism and fix requirements

I have not changed any files or run anything. Everything below comes from the supplied source and the reported Chromium/WebKit results.

## What the defect is

The deadline check itself is correct. `allSafe()` is asked at the deadline instant (`IdleLogout/index.tsx:118`). The defect is that the answer is held in `clearScreen` across `await logOut()` (line 140) and acted on afterwards.

Per the installed source, `logOut` clears the local user synchronously, before the request is sent. During the held request:

- `useAuth().user` is null, so `editing` is false and `setDisabled(true)` runs. That gates submission only, and the comment at `flushRegistry`/EditRecovery lines 407-415 already says so.
- Fields stay editable, which matches the observed "Viewing" toolbar with a live textarea.
- The effect depends on `user` (line 168), so its cleanup has already removed the interval and listeners. Nothing re-asks the question.
- `clearIfSafe` still runs on release, reads the boolean captured before the typing, and hard-navigates (line 137).

So the comment at lines 113-117 ("ASKED NOW") holds at T0, but the action happens at T1 on a stale verdict. That is the failure the file's own comments reject. The loss comes from the hard navigation, not from the logout. The control fits this: unsafe before the deadline means `clearScreen` is false and nothing navigates.

## Recheck requirement, and why it is not enough alone

Re-ask `allSafe()` inside `clearIfSafe`, after `logOut` settles on both success and rejection. `allSafe` is stable from the memo (`flushRegistry` line 134), so calling it from the closure is valid.

Two things stop the recheck from being sufficient:

1. **An empty registry is vacuously safe.** `[...set].every(...)` returns `true` for an empty Set (`flushRegistry` line 136). The missing-provider default returns `false` (line 92), but a present provider with zero registrations returns `true`. If the editor unregisters while its textarea is still on screen, the recheck passes and the navigation destroys the text. The reported run does not show registry state at clear time, so I cannot say whether this path was hit. The editor's register effect is not in the supplied files. Its dependencies on `editing`/`canEdit`, and whether it unmounts on the Viewing transition, must be read before this is settled.

2. **The probe must read live content.** If the editor's `isSafe` is derived from a snapshot updated only on flush or render, text typed while disabled may not register as unsafe. The probe has to compare the current form value with the last stored content. Its source is not supplied, so this is unverified.

Decision for the owner: `allSafe` should probably be `size > 0 && every(isSafe)`, so zero registrations preserves the screen. The cost is that deadline clears never happen on pages with no registered editor, which works against the shared-machine goal for non-editor admin views. The zero-editor case should be decided explicitly rather than left to vacuous truth.

Optional hardening: freeze the editor (`readOnly`/`inert`) when logout starts, so text cannot be typed into a dead session. The recheck alone prevents the loss. The freeze would also fix the "Viewing but editable" mismatch, which is a contributing cause. I would fold it into this finding rather than file a separate one.

## Scope

- **Controlled browser clock only.** The native token's server clock was not expired. This is not a real two-hour expiry or a deployment test.
- **Real expiry adds a path this repro suppresses.** Payload's own `forceLogOutTimeout` fires at the same deadline and calls `redirectToInactivityRoute` (`router.replace`), which can unmount the form. The repro keeps native timers on their original delay, so this path is not exercised. The pending short-lived native-session check must cover it.
- **A rejected logout** (for example a 401 from an expired server token) takes the same stale-verdict branch. Not separately exercised.
- **Window size.** The window is the logout round trip. It is narrow on a healthy network, but the file's own comment notes that expiring sessions have network trouble, so it can be long.
- **Not verified:** why the marker was not captured. The likely reason is that capture is gated on `editing`, which is now false. That is inferred, not checked.
- **Not a server auth bypass**, and no source snapshot was mutated.

## Probe

The corrected gap probe is the right one. It drops the Save-enabled wait after the deadline, asserts editability as a precondition (line 320), requires the typed value to be visible, and passes if the text is stored or readable. The earlier Save-enabled wait should be treated as withdrawn. The control's Save-enabled wait before the deadline is valid, because Save is still enabled while logged in.

## Severity

Keep **Medium**. The loss is real, silent, and affects text the user has just typed. It needs a deadline, a pending logout, and typing inside that window. There is no auth bypass.

## Results, per browser

For Chromium and WebKit: the control passes and the gap assertion fails. Do not claim that rechecking `allSafe` alone fixes it.

Coordinator disposition: accept the demonstrated lost input and Medium impact. Reject the response's inconsistent claim that rechecking allSafe alone suffices: user clearing deactivates/unregisters recovery, and the empty registry is vacuously safe. See F-C63-003.
