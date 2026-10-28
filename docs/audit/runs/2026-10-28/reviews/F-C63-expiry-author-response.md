# Original Haiku-author recheck

## Verdict

By reading the three files, the claim holds. The screen-clear decision is taken before the async logout and then reused after it. A safety flip during the pending `logOut()` promise does not stop the hard navigation. I did not run anything, so Sol's component run is the evidence of record. My trace agrees with it.

## Trace

- **`IdleLogout/index.tsx:118`**: `const clearScreen = allSafe()` is evaluated once, synchronously, at the deadline tick.
- **`:125-140`**: `clearIfSafe` reads that captured boolean. It never calls `allSafe()` again. It is passed to `logOut().then(clearIfSafe, clearIfSafe)`, so it runs after the network await.
- **`:113-117` and `flushRegistry.tsx:72-76`**: the comments say the verdict cannot be stale because it is "asked now" and "evaluated at the moment of the decision." That freshness ends at the `logOut()` call. The file's own argument against remembered verdicts (a verdict goes stale when the teacher types again) applies equally to a verdict held across the await. The code contradicts its own invariant.
- **Spec trace**: at the 30s tick, `allSafe()` is true, `logOut` is pending, and `replace` is not called. Then `safe = false`, `finish()` resolves, and `clearIfSafe` runs with `clearScreen === true`. `window.location.replace` is called and the final `not.toHaveBeenCalled()` fails. The spec is a red test on the current code, which matches its "audit:" framing.

## Confirmed vs. conditional

**Confirmed (code-level):** the navigation decision is a snapshot taken before an async boundary, and nothing re-validates it. This is a stale decision, and it is in the path the comments say is protected.

**Conditional (lost work):** content is lost only if all of these hold:
1. The probe flips to false after `allSafe()` and before `logOut()` settles. This means an edit that is not yet stored.
2. The editor is still mounted and accepting input while the logout is in flight. Not established, see check 2 below.
3. The logout settles (resolves or rejects). If it never settles, `clearIfSafe` never runs and nothing is navigated. Note that the file sets no timeout on `logOut()`.
4. No post-deadline capture rescues the edit. The post-deadline branch does not flush (`:107-142`), so none is expected.

The asymmetry is one-directional. A stale "unsafe" verdict only preserves the screen, which is the designed lesser harm. The harm is the stale "safe" verdict.

## Other observations (lower confidence)

- **Empty registry reads as safe.** `allSafe` on an empty set returns `true` (`flushRegistry.tsx:136`). The no-provider default returns `false`, but "provider present, zero editors registered" returns `true`. If the editor unmounts during the pending logout, a fix that re-asks `allSafe()` at resolution would clear the screen. Any fix needs to handle this case deliberately.
- **Latch is per effect run.** The effect depends on `user`, `tokenExpirationMs`, and `logOut`. If any of these change identity during the pending logout, the effect re-runs with `loggingOut = false`. That would call `logOut()` a second time and take a fresh `allSafe()` decision. The spec's mock returns a new `user` object on every call, so it is sensitive to this if a re-render happens. Real Payload identity stability is unverified.
- **Rejection path shares the stale verdict.** `clearIfSafe` is also the rejection handler, and the spec does not exercise it.

## Missing production-path checks (not run)

1. **Real `LessonControls` probe timing.** Confirm `isSafe` flips false synchronously on the first keystroke, not after the 8s debounce or after a flush. If it lags, the window for the defect narrows.
2. **Payload `logOut` side effects in `@payloadcms/ui` 3.85.1.** Check whether clearing `user` unmounts the editor or triggers Payload's own redirect or gate. If the editor unmounts, it unregisters and the empty-registry case applies. If it stays mounted and interactive, the window is real.
3. **Stalled logout.** Use a `logOut` that never settles. Confirm no navigation occurs and what the teacher sees on screen.
4. **Rejection variant of the spec.** `logOut` rejects with the probe flipped. Expected: no navigation and no unhandled rejection. The current code navigates.
5. **Re-render during pending.** Change `logOut` or `user` identity while the request is in flight. Expected: exactly one `logOut` call.
6. **Real-browser pass.** Real timers, real `visibilitychange`, real hard navigation, with typing during a slowed logout request. Then check what survives the navigation. This is outside the component repro, as you noted.
7. **Registration identity.** The spec's `MutableEditor` uses a module-level `safe` flag. Check that the real editor's probe is per-instance and that the registered object is the one unregistered on unmount.
