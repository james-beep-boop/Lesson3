# P069-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Assessed from the supplied text only. No tools were run.

- `app/src/components/Manage/ClockCheck.tsx:1-65`: read in full.
- `app/src/components/Manage/LocalTime.tsx:1-52`: read in full.
- `app/src/components/Manage/PersonIdentity.tsx:1-11`: read in full.
- `app/src/components/Manage/RolesAccessPanel.tsx:1-400`: read. The range ends mid-JSX, so the render wiring after line 400 is **not assessed**.

Not assessed: all imports (`apiBase`, `clockSkew`, `formatDate`, `editorGroups`, `wireError`, `widgetUser`, `assignmentRoles`, `userSearchContract`, `substrand`, `Accordion`, `panelState`), server endpoints, roster and projection construction, and tests. Security and integrity claims are unreviewed until independent review.

## Purpose and stated invariants

- **ClockCheck:** one-shot comparison of a fresh server reading with the device midpoint. Shows a warning only for a usable reading that disagrees, and nothing on failure.
- **LocalTime/LocalDay:** hydration-safe time formatting. The server and hydration passes emit explicit UTC.
- **PersonIdentity:** name and optional email display.
- **RolesAccessPanel:** per-subject-grade administrator and editor controls. Sends `expectedUpdatedAt`. Says the server is the authority and treats a 409 as a stale page (lines 7-10). Says the appoint warning must name every incumbent (lines 178-181).

## Candidates

**C1. Low. Confirmed by local reading.** `RolesAccessPanel.tsx:124-147`
- Precondition: user X's roster row has `updatedAt` T1. Another administrator changes that row to T2. The admin then clicks an assign or unassign action.
- Actual: the server returns 409. `act` sets the error and toasts. The `finally` clears `busy`. There is no `router.refresh()` on this path, so `user.updatedAt` stays at T1. Every retry sends T1 and gets 409 until a manual reload.
- Expected, from the file's own contract (lines 7-10): a 409 means the page is stale, so the panel should refresh and the next attempt should carry the current token.
- Repro: mock the assign endpoint to return 409 once, then 200. Assert that `router.refresh` is called after the 409 and that the retry sends the refreshed `updatedAt`. Currently it would not.

**C2. Medium if reachable. Lead.** `RolesAccessPanel.tsx:111, 182-185, 227-228, 325, 389-390`
- `toPeopleSafe` and the incumbent map silently drop any holder id not present in `access.roster`.
- Precondition: `subjectAdminIds = [5, 9]` and the roster contains only user 5.
- Actual: the appoint confirmation omits user 9's demotion, even though the server still demotes them. `adminSummary` shows "No admin" for a group that has one. The handover count undercounts.
- Expected, per the in-file requirement at lines 178-181: the warning names every incumbent.
- Repro: render with that data, open appoint for a third user, and assert the confirmation text names user 9. Whether the roster can omit a holder is unverified, because `editorGroups` was not supplied.

**C3. Low, conditional on unseen render code.** `RolesAccessPanel.tsx:218-247, 330-340, 396-400`
- `appointAdmin` and `handOverAdmin` share `adminPicks`. The comment at 330-340 says handover should offer only `handoverable`. Nothing in lines 1-400 selects between `appointable` and `handoverable` by `mayVacate`.
- If the render site offers `appointable` in handover mode, an administrator can pick a non-editor. The server refusal is then the only stop. The file says the server is the boundary, so this is a usability and defence-in-depth issue, not an authorization claim.
- Repro: render with `subjectAdminControl='handover'` and assert the options equal `handoverable`.

**C4. Low. Lead.** `RolesAccessPanel.tsx:129-146`
- `AbortSignal.timeout(15_000)` aborts client-side, but the server may have committed the write. The error shown is the raw DOM abort message, and nothing refreshes, so displayed roles can stay stale after a committed change.
- Repro: delay the mocked 200 beyond 15s and assert that the UI refreshes or reports the outcome as ambiguous.

**C5. Low. Confirmed by local reading.** `RolesAccessPanel.tsx:172, 204, 246`
- The pick is cleared synchronously after `act` starts, before the request resolves. A refused write (for example 409 or 403) shows an error but loses the chosen person.
- Repro: make the POST fail and assert the select still holds the chosen id.

**No defect found in range:** `ClockCheck.tsx` and `PersonIdentity.tsx`, and the `formatInstant` local and UTC branches in `LocalTime.tsx`.

**C6. Lead.** `RolesAccessPanel.tsx:7-10, 132`
- A handover sends only the successor's `updatedAt`. Autodemotion of the actor and other incumbents changes rows whose tokens this client never sends. The header claim that concurrent role changes "can never be silently overwritten" is unverified here.

**C7. Lead, low.** `LocalTime.tsx:46-50`
- Pre-hydration `at.slice(0, 10)` gives the UTC day only if `at` is a `Z` ISO string. For offset-form strings it gives the offset-local day. This depends on caller formats, which are unseen.

## Unresolved questions

1. Can `access.roster` omit a holder listed in `subjectAdminIds` or `editorIds`? (Confirms or rules out C2.)
2. Which picker renders in handover mode? (C3.)
3. Does the parent refresh on error independently of `act`? If so, C1 weakens.
4. Does the server check tokens on rows demoted by autodemotion? (C6.)
5. Are the `clocksDisagree` and `readingUsable` thresholds correct? Not reviewed.
