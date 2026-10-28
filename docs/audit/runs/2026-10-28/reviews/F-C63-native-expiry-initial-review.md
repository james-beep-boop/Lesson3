# Sonnet review — provisional native expiry lead

**Verdict: AMEND and retain as a separate, provisional finding.** The observation looks real, but the causation, the framing and the severity all need narrowing.

**1. Missing capture vs. screen policy**
- The absent database row is not itself a violation. SPEC:348-355 puts failed or unconfirmed capture outside the guarantee, and the test message ("erase the only copy") overstates it as a durability failure.
- The defensible claim is narrower. SPEC:321-324 says an unconfirmed final flush means the unsafe-work screen policy beats automatic clearing, and the screen lost the text anyway. That is a policy violation, not a guarantee violation.
- I could not check the policy's wording because the excerpt stops at line 355. Confirm what it requires before citing it.
- Cite SPEC:321-324 for "both historical paths addressed" as a claim-vs-code mismatch, but only after the trace is done.

**2. Source causation: not established**
- IdleLogout as written should not clear here. With capture refused, `allSafe()` should be false, so `clearIfSafe` does nothing (index.tsx:118-140). I could not see `flushRegistry`, so the empty-registry and `active=false` cases are unverified.
- Payload's `onSessionExpiration` (Auth:100-109) is a permitted candidate: a soft `router.replace` would unmount the form. But `navigated:false` cuts against it. If the redirect had run, the URL should be `/admin/logout-inactivity` unless the config differs.
- Other candidates the supplied source does not exclude:
  - `logOutSession` rejecting, since the `.then` has no catch and the logout is made with an already-dead token.
  - `logOutSession` clearing the in-memory user and unmounting the form without a redirect.
  - The aborted refresh feeding some other failure path.
  - A post-expiry server render redirecting elsewhere, such as login.
- Do not call any of these the cause until the rerun discriminates.
- IdleLogout's docstring analyses 3.85.1 and `forceLogOutTimeout`, while 3.92 is installed with `onSessionExpiration`. Don't treat the docstring or the design doc as authority for 3.92.
- Measurement caveat: `body.innerText` excludes textarea values, so `visibleTextReadable` adds nothing for form fields. `inputReadable` depends on one locator, so a re-render that collapses the field or changes its id reads as absent. The screenshot and a DOM dump matter here.

**3. Double-counting with the delayed-logout finding**
- Keep them separate only if the trace confirms a different root cause. The delayed-logout case is an IdleLogout stale-safety race: the verdict is computed before `logOut` resolves, then text is typed during the pending logout. The native case would be Payload's path bypassing the registry, with no race.
- If the final trace points at IdleLogout code, merge them.
- Cross-reference both under the shared invariant, but count by root cause.

**Severity and conditions**
- The injection is selective: refresh aborted and capture 503, while logout still succeeds.
- A real outage would probably fail the logout POST too. That might leave the screen intact, but `logOutSession`'s rejection behavior isn't in the supplied source.
- Active typing normally refreshes the token (Auth:95-99), and here the refresh was deliberately blocked.
- The 120s token against a 90s flush lead and a 30s tick distorts timer ordering compared with a two-hour session, and the client may still hold the 2h config. None of this was observed in deployment.
- I lean **Low–Medium**. Medium is defensible only if the trace confirms an unconditional native path and the severity scale weights policy-violating loss of prose over likelihood.

**Rerun asks**
- Poll the marker every ~250ms to find when it disappears. A disappearance at deadline+ε points to Payload's timer, while one at the next 30s tick points to IdleLogout. The current +1.5s and +11.5s samples can't tell them apart.
- Set a `window` sentinel to separate a hard reload from a soft transition.
- Capture the final URL, the full `visited` list, the logout POST status, post-expiry network requests and console errors.
- Include a screenshot and a field-existence check.
- Run a control with capture succeeding.
- State that nothing here shows a two-hour deployment behaves the same.
