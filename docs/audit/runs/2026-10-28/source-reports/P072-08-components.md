# P072-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read in full:** `app/src/components/Manage/UsersPanel.tsx:1-400` and `:401-582` (the whole file, 582 lines).
- **Not assessed:** imported helpers (`apiBaseFrom`, `personLabel`, `plural`, `userSearchContract`, `wireErrorMessage`, `usePanelOpen`, `usePanelJump`, `subjectGradeAnchor`, `PersonIdentity`) and every server endpoint the panel calls (`/users/:id`, `/users/:id/{reveal-reset-link,set-sign-in-disabled,set-site-admin}`, `/users/search`). Server enforcement of concurrency, sign-out, and cascade behaviour is unreviewed.
- **Not run:** no tests, builds, or browser checks were executed. All candidates below are from reading the code.

## Purpose and invariants (as read)

- `UserRow` edits one account's name/email, runs verify/approve, site-admin, sign-in-disable, reset-link, and delete actions, and sends `expectedUpdatedAt` on the three POST actions.
- `UsersPanel` runs a debounced, page-aware search that loads only when the panel is open. It moves to the last page when the list shrinks, and it ignores aborted requests.
- Wording for unverified accounts depends on `emailEnabled`, which matches the policy's no-email approval route.
- I found no defect in the search/debounce/pagination logic. `pageWithinRange`, the abort handling, and the `loading` reset all look correct on re-read.

## Candidates

**1. Copy-link fallback is never reached on non-secure origins. Severity: Low. Local reasoning, browser behaviour not verified.**
- Evidence: `UsersPanel.tsx:206-211`. `navigator.clipboard` is only exposed in secure contexts. On a plain-HTTP LAN origin, which is the offline school-server case the policy describes, `navigator.clipboard` is `undefined`. `navigator.clipboard.writeText(...)` then throws synchronously. The `.catch` at `:209` never runs, so the "select and copy the link below" message at `:210` never shows.
- Precondition: site served over non-localhost HTTP; reset link revealed.
- Expected: fallback message shown and the link stays selectable.
- Actual: uncaught TypeError in the click handler; no user-visible message.
- Focused reproduction: render `UsersPanel`/`UserRow` with `fetch` mocked to return `{ link }` from `reveal-reset-link`; click "Reveal reset link"; click "Copy link" with `navigator.clipboard` undefined (jsdom default). Assert the fallback text appears. Current code fails that assertion and throws.
- Workaround exists: the read-only input at `:333-338` is still selectable.

**2. Unsaved profile edits can be silently overwritten by a refreshed row. Severity: Low. Lead; depends on whether the reveal/other actions bump `updatedAt`.**
- Evidence: `UserRow` adopts `user.name`/`user.email` whenever `observedUpdatedAt !== user.updatedAt` (`:76-81`). Those local edits are not preserved.
- Precondition: admin types in the Display name/Email fields without saving, then runs another row action (for example "Reveal reset link", which writes to the user document and may bump `updatedAt`). The following `onChanged` reload changes `updatedAt`.
- Expected: typed-but-unsaved values preserved, or the admin warned.
- Actual: the inputs revert to saved values with no message.
- Repro: mount a row, change the name, rerender with a new `user.updatedAt` and the old name, and assert the typed value remains. Current code fails. Whether the trigger happens in production needs a server check.

**3. Profile PATCH and DELETE are not concurrency-gated in this panel, unlike the other POST actions. Severity: Low to Medium integrity. Lead, not confirmed.**
- Evidence: `patch` (`:98-109`) and the DELETE (`:193-197`) send no `expectedUpdatedAt`. The POST actions do (`:119`).
- Precondition: two Site Administrators edit the same account, or one edits after an external change.
- Expected: a stale profile save is rejected, consistent with the policy's optimistic-concurrency intent and the "authority after waiting" lock description.
- Actual: from this file alone, a stale name/email PATCH would overwrite the newer row. The server may enforce `updatedAt` on `PATCH /users/:id`, and this file cannot show that.
- Repro needs the server endpoint. A client test asserting the body lacks `expectedUpdatedAt` shows only the request shape, not the defect.

**4. Delete confirmation counts come from a possibly stale row. Severity: Low. Lead.**
- Evidence: `deleteUser` (`:185-191`) builds the "authored N versions / M Official" text from `user.authoredVersions` and `user.officialVersions`, which were captured at the last load and not re-fetched before confirming.
- Expected: consequences reflect current state at confirm time.
- Actual: the count can understate if versions were added after the list loaded.
- Also unverified: the claims that messages, favourites and edit-recovery rows are deleted, and that every live session ends on disable (`:172`), need checking against the server.

## Unresolved questions

1. Does `PATCH /users/:id` enforce `updatedAt` or any other version check? (Determines candidate 3.)
2. Does `reveal-reset-link` write to the user document and bump `updatedAt`? (Determines whether candidate 2 is reachable.)
3. Do the server's delete cascade and session-revocation behaviour match the confirmation and success copy at `:172`, `:190`, and `:276`?
4. Is the panel itself restricted to Site Administrators, or only the endpoints? The component does not check role, and the policy places email change and `_verified` repair under Site Admin.
