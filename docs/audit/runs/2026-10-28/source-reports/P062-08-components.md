# P062-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read in full, from the supplied content:
- `app/src/components/Guide/Accordion.tsx:1-112`
- `app/src/components/Guide/availability.ts:1-68`
- `app/src/components/Guide/panelState.ts:1-90`
- `app/src/components/IdleLogout/index.tsx:1-171`

Not assessed: `EditRecovery/flushRegistry` (the registry defaults and `runAll`/`allSafe` semantics), `canUseAdminPanel`, `isSiteAdmin`, `isSubjectAdminForAny` (`@/access`), the editor's input behaviour during logout, and Payload's `logOut`. No runtime behaviour was executed.

## Purpose and invariants (as read)

- **Accordion**: open-state for guide panels. Toggling a parent closes its children, and opening a child opens its ancestors. Focus moves to a deep-linked trigger.
- **availability**: maps user capabilities to visible guide panels, with ancestors always included.
- **panelState**: parses `?open=` / `?at=` and keeps only ids that are known and available.
- **IdleLogout**: at the token deadline, logs out and clears the screen only if the editor reports all content as safe. Flushes unsaved work in the 90s before the deadline.

Within these four files I found no concrete correctness defect in Accordion, availability, or panelState. Their logic matches their comments as far as the supplied code shows.

## Candidates

**C1. Stale "safe" verdict drives screen clearing after an async logout (Medium; confirmed local reasoning, impact partly uncertain).**
- Evidence: `IdleLogout/index.tsx:118` sets `const clearScreen = allSafe()`. The comment at `:113-117` says a cached verdict is unsafe because typing after it is not captured. `:131` then tests the captured `clearScreen` after `logOut()` resolves (`:140`), without calling `allSafe()` again.
- Precondition: the deadline is reached, `logOut()` takes a noticeable time, and the editor still accepts input during that round trip.
- Expected: the screen is cleared only if the content on screen at clear time is captured.
- Actual: the decision is made at the deadline instant. Text typed during the logout request is not captured, yet the screen is still cleared.
- Uncertainty: whether the editor stays editable during logout depends on code not supplied.
- Focused test: mock `useAuth` with `tokenExpirationMs = Date.now()`. Mock the registry so `allSafe` returns `true`, then `false` after an edit. Hold `logOut` pending, make the edit, resolve `logOut`, and assert `window.location.replace` is not called. The current code is expected to call it.

**C2. Unverified default for the registry when no editor is mounted (Lead, severity depends on unseen code).**
- Evidence: `:33-39` says that with "no provider at all" the zombie editor is preserved. That only holds if the default registry's `allSafe()` returns `false`. `IdleLogout` consumes `useFlushRegistry()` from `:95`, and the default is in `flushRegistry`, which was not supplied.
- Test: render `IdleLogout` with no `EditRecoveryFlushProvider` above it. Expire the token and assert that `replace` is not called.

**C3. Path prefix check lacks a segment boundary (Low).**
- Evidence: `:136` uses `path.startsWith(adminRoute)`. A path such as `/administration` passes this check, so the `?redirect=` parameter is attached to a path that is outside the admin, which the comment at `:132-134` says must not happen.
- Test: with `adminRoute = '/admin'` and `window.location.pathname = '/administration'`, assert that no `redirect` parameter is added.

**C4. Unhandled rejection from `runAll()` (Lead, unverified).**
- Evidence: `:152` uses `void runAll()`. If `runAll` rejects, the rejection is unhandled. `runAll` was not supplied, so this depends on its implementation.

## Unresolved questions

1. Does the editor reject or ignore input while `logOut()` is pending? This determines whether C1 can lose text in practice.
2. What does the default registry return from `allSafe()` and `runAll()` when no provider is mounted (C2, C4)?
3. Does `canUseAdminPanel` match the claim at `availability.ts:19` that it is the same predicate as the panel link? This was not checked.
4. The docstring at `IdleLogout/index.tsx:20-24` says `logOut()` does not navigate. That was not verified against the installed Payload package.
