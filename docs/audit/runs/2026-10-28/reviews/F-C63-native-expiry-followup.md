# Sonnet follow-up and coordinator disposition

## Amended verdict

**Retain as a separate finding at Medium, framed as conditional.** The runtime behaviour is now established. The causal actor is a source-based inference that was never instrumented, and the finding should say so.

## What I withdraw

- **The `navigated:false` objection.** It was a measurement artefact. Frame history shows form → `/admin/logout-inactivity` → `/login`, and the last `waitForURL` simply started after the intermediate route had passed. That removes my main argument against Payload's redirect being the actor.
- **The "field collapsed or locator changed" concern.** The sign-in screenshots (156/157 chars, no marker) show the whole page was replaced.
- **Two candidates I had left open.** A `logOutSession` rejection and a user cleared without a redirect are both contradicted by the observed navigation to the inactivity route and then login.

## Tiers of confidence

**Observed (Chromium and WebKit, real SDK-issued 2-minute session, no fake clocks):**
- The form accepted the field value and Save was enabled before expiry.
- Capture returned 503 and refresh was aborted.
- The screen was replaced by sign-in, the DB has no marker, and the old JWT is rejected.
- In the Chromium control with successful capture, the same route is taken and `persisted=true`.
- **Credit only Chromium for the control.** The WebKit control is pending and gets no credit.

**Inferred from source (probable, not demonstrated):**
- The native `forceLogOutTimeout` fires exactly at `expiresAt`. IdleLogout can only act at its next 30s tick or on focus/visibility, so in an attended foreground tab the native timer should act first.
- This ordering doesn't depend on the 2-minute TTL, so the causal inference survives that caveat.
- "Unconditionally logs out and redirects with no registry query" rests on the Auth excerpt I reviewed earlier. The timer file you supplied shows only the call into `onExpire`.

**Not established:**
- **The actor.** Native and IdleLogout both land on `/admin/logout-inactivity`, with the same `?redirect=` rule for admin paths, and Playwright frame-navigation events fire for soft and hard transitions alike. So the route and history don't discriminate between them.
- **A residual IdleLogout alternative.** If the editor's `isSafe` wrongly returned true after a refused capture, IdleLogout would produce the identical trace. I haven't seen the editor's probe.
- **Timing.** Clearing at +1.5s is not conclusive by itself. The interval phase relative to the deadline is set at mount, so a deterministic harness can reuse the same phase across runs.
- **Anything beyond the injected fault.** The injection fails capture and refresh but lets the logout POST and navigation succeed. A total outage or offline state wasn't tested, and nothing was observed on a two-hour deployment.

## What the control adds

Safe and unsafe work both end in the same clear. So the clear isn't gated on safety in this environment, whichever component performs it. That supports the policy-violation claim without naming the actor.

## Severity

- **Medium is supportable.** Impact is unrecoverable loss of unsaved prose, with the screen cleared so the teacher can't copy it. IdleLogout's header, which I can read directly, says the legible screen is preserved when safety is uncertain precisely so the teacher can copy the text.
- **It is conditional.** It needs capture to fail through the final lead window, refresh to fail too, and unsaved text on screen at expiry.
- **Downgrade trigger.** If the severity scale weights likelihood heavily, this drops to Low–Medium.

## Wording constraints for the finding

- Call it a violation of the screen-clearing policy under unconfirmed capture. Don't call it a violation of the durability guarantee, and don't claim unconfirmed capture must always be saved. The test's "erase the only copy" phrasing shouldn't be carried over.
- I haven't seen SPEC:321-324. I'm relying on your paraphrase that it makes the unsafe-work policy take precedence over automatic clearing.
- The "both historical paths addressed" mismatch needs the reconciliation of the old L3-13 note recorded. The design may rely on the pre-expiry flush for the native path. If so, a failed flush is the accepted residual, and the SPEC:348-355 carve-out applies. State which reading you adopt.
- Say plainly that no call stack was captured. A window sentinel set before expiry would settle it: if it survives the first navigation, the redirect was soft (Payload's `router.replace`). If it is lost, the redirect was hard (IdleLogout's `window.location.replace`). Check it immediately after the first navigation, because the later login transition could muddy it.

## Double-counting

Keep it separate from the delayed-logout finding and count by root cause:
- The delayed-logout finding is a stale-safety race inside IdleLogout.
- This one is a path that bypasses the registry's safety verdict, so it has no race.

Merge only if instrumentation points at IdleLogout or its probe. One flag for that finding's reviewer: if the native timer pre-empts IdleLogout in foreground tabs, the delayed-logout race may be reachable mainly in throttled or background tabs. That is inference, not a conclusion.

## Coordinator recheck

Retain conditional Medium for the observed screen-clearing policy violation. The WebKit confirmed-capture control subsequently passed too. SPEC§5 lines321–324 at the baseline explicitly gives the unsafe-work screen policy precedence over unconfirmed flush; the failed-capture durability carve-out does not authorize clearing that screen. Native callback causation is an inference, not a captured call stack. The reviewer's reference to the older forceLogOutTimeout name is not the installed3.92 identifier; the installed timer calls onExpire/onSessionExpiration. Keep native-expiry and delayed-logout scenarios separately reproducible, but do not claim their underlying causes have been fully distinguished by navigation history alone.
