# P077-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made. The source text was taken from the request and was not verified against baseline `6e75a173e822e4c4be42821b0a4af48ca457bd36`. No tests were run.

**Read in full (as supplied):**
- `app/src/components/UserMenu/index.tsx:1-129`
- `app/src/components/VersionTimestamps/index.tsx:1-63`
- `app/src/components/VersionsChip.tsx:1-193`
- `app/src/components/WelcomeDialog/index.tsx:1-168`

**Not assessed:** imported helpers and components (`@/lib/aresReleasePresentation`, `@/lib/versionsOrder`, `FavoriteToggle`, `Modal`, `DisplayNameForm`, `lib/initials`, `lib/welcomeDismissal`, `access`), the logout and favorites API routes, and all callers. The policy excerpts were treated as context, not as a source range.

## Purpose and invariants (summary)

- **UserMenu:** an account dropdown with type, scope lines, email, Messages link and logout. Logout fetches `POST /api/users/logout`, then navigates to `/login` regardless of the result.
- **VersionTimestamps:** sidebar Last Modified and Created values, plus an ARES release label. The timestamps are hydration-safe by design.
- **VersionsChip:** a version-count button and dialog. It fetches versions and the caller's favorites on every open.
- **WelcomeDialog:** a once-per-user-per-browser onboarding dialog keyed in localStorage, with role-specific copy.

## Candidates

**C1 — Low to medium. Confirmed by local reasoning; runtime effect not checked.**
`app/src/components/WelcomeDialog/index.tsx:31-38`, `:52`
- Precondition: the component is server-rendered, and the user has no `welcomeDismissedKey` in localStorage.
- The server branch returns `false`, so the server renders `null` (line 52). The client's `useState` initializer reads localStorage during hydration and returns `true`, so the client's first render includes the Modal.
- Expected: a hydration-safe initial state, as `VersionTimestamps` does (`useSyncExternalStore` server snapshot). Actual: the first-render trees differ for every first-time viewer.
- Repro: `renderToString` the component, then hydrate it in jsdom with empty localStorage. Assert no hydration mismatch and that the dialog appears after mount.

**C2 — Low. Uncertain; depends on intended copy.**
`app/src/components/WelcomeDialog/index.tsx:17-21`, `:98-116`
- Precondition: the user has an `assignments` entry with role `'editor'` and no `subjectAdmin` role.
- `getRole` maps this user to `'teacher'`, so `TeacherContent` says "To edit lesson plans, message your … for permission." UserMenu (lines 12-14) treats editing access as a Teacher capability, so this copy may be wrong for this user.
- Repro: render with `assignments: [{ role: 'editor' }]` and assert the copy. The expected copy is not defined in the supplied policy.

**C3 — Low to medium. Lead; downstream impact not checked.**
`app/src/components/VersionsChip.tsx:84-96`
- Precondition: `/api/favorites` returns a non-2xx status while the versions request succeeds.
- The `if (fRes.ok)` branch is skipped silently. `favByVersion` stays empty, so every star gets `favoriteId = null`. A network throw on the same request goes to the outer catch and shows the error state, so the two failure modes behave differently.
- Expected: the panel reports the failure or keeps prior favorite state. Actual: every star shows unfavorited. If `FavoriteToggle` (not in range) creates a new favorite on a null `favoriteId`, an already-favorited version could get a duplicate.
- Repro: mock favorites as 500 for a favorited version, open the panel, and assert an error or the correct star state. Then assert that toggling sends a delete, not a create.

**C4 — Low. Lead.**
`app/src/components/VersionsChip.tsx:67-104`, `:115`
- Precondition: the panel is opened, closed and reopened quickly on a slow network.
- Each open calls `load()` with no sequencing or abort, so an older response can resolve after a newer one and overwrite `versions` and `favByVersion`.
- Expected: the latest request wins. Actual: a stale favorites map can overwrite newer data.
- Repro: use two deferred fetches, resolve them out of order, and assert the final state matches the second request.

## Unresolved questions

- `VersionTimestamps:33,52`: does `aresReleaseLabel` return nothing for teacher versions, "not stated" for a fingerprint without a date, and use saved rather than form data? The helper is out of range.
- `VersionsChip:98,174`: do `sortVersionsOfficialFirst` and `releaseVersionLabel` produce the policy's Official-first, newest-to-oldest order and the full release date?
- `UserMenu:72-82`: does `/api/users/logout` clear the shared auth cookie? The navigation happens even when the request fails, so a failed logout may leave the session active.
- `WelcomeDialog:34,44`: the `welcomeDismissedKey` format. Also, do the link targets (`/guide?open=site-admins&at=site-admins.backups`, `/admin/collections/users`) exist?
- Are `FavoriteToggle` and `Modal` consistent with C3 and C4?
