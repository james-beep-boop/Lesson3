# P054-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tools were run. I read the supplied text as given and did not verify it against baseline `6e75a173`. Policy excerpts were context only, not assessed as source.

Read in full:
- `app/src/components/AppNav/NavigationFreshness.tsx:1-127`
- `app/src/components/AppNav/index.tsx:1-136`
- `app/src/components/AppVersion.tsx:1-10`
- `app/src/components/Brand/Icon.tsx:1-28`
- `app/src/components/CollapseOnEntry/index.tsx:1-65`
- `app/src/components/CombineVersions/applyOverlay.ts:1-15`
- `app/src/components/CombineVersions/comparisonError.ts:1-21`

Not checked: every imported callee and caller (`access`, `lib/accessScopes`, `lib/discussions`, `lib/systemFlags`, `lib/appVersion`, `lib/editRecovery/projection`, `UserMenu`, `LessonControls/entryPhase`, `payload-types`), the `/api/discussion-topics/nav-state` route, and Payload's `exists` semantics.

## Purpose and invariants

- **NavigationFreshness:** after a client navigation, refresh the route if the forum switch or unread state may differ from what the layout rendered. Back/Forward always refreshes. An unknown or timed-out check counts as changed.
- **AppNav:** renders the top nav. Unread count, access summary and forum state are best-effort and degrade to absent or zero.
- **CollapseOnEntry:** collapses the panel once per document visit, only during the entry phase.
- **applyOverlay:** maps prose overlay keys to field paths, throwing on any unresolvable key before the caller writes anything.
- **comparisonError:** `gone` is true for 400/403/404 and false for 429, 5xx, timeouts and network failures (`null`).
- **Icon, AppVersion:** static presentation.

## Candidates

**C1: low to medium, reachability uncertain.** `NavigationFreshness.tsx:77-124`
- Precondition: `router` or `timeoutMs` changes identity while a nav-state check is in flight for the current route.
- Local reasoning: the cleanup at 119-123 sets `cancelled` and aborts. The re-run hits the guard at 78 (`previous.current === route`) and returns without checking or refreshing. The file's comment sanctions dropping a check only when "a newer navigation" supersedes it, not when a dependency changes.
- Expected: the check completes, or the refresh happens.
- Actual: the check is dropped and nothing refreshes, so a stale Discuss item or forum control can persist until the next navigation.
- Test sketch: mock `next/navigation`, make `fetch` never resolve, render at route A, change route to B, rerender with a new `router` object while B is in flight. Expect `router.refresh` or a fresh fetch after the rerender. Whether `useRouter()` identity changes in the deployed Next version is unverified.

**C2: low, confirmed by local reasoning; reachability unverified.** `NavigationFreshness.tsx:60-84`
- Precondition: a `navigate` event with `navigationType === 'traverse'` (or a `popstate`) fires without the route string changing.
- Local reasoning: `traversed` is set at 63 but cleared only at 81, which runs after the guard at 78. When the route is unchanged, the flag persists. The next ordinary navigation then calls `router.refresh()` unconditionally at 82, bypassing the nav-state check. The file's own contract says an ordinary navigation refreshes "only when that differs".
- Expected: the next ordinary navigation consults nav-state.
- Actual: it refreshes unconditionally.
- Effect: an extra server render only, so safe direction.
- Test sketch: dispatch a traverse `navigate` event with the same route, rerender, then change the route. Assert no `fetch` to `/api/discussion-topics/nav-state` and a `router.refresh` call.

No defect found in `Icon.tsx`, `comparisonError.ts` or `applyOverlay.ts` within their ranges.

## Unresolved questions

1. `AppNav/index.tsx:43` and `:128-135`: `getPayload` and `forumState` have no catch. The comment says `systemFlagsForRender` never throws; that needs the callee to confirm. If it does throw, the whole nav fails, contrary to the "best-effort" header comment.
2. `AppNav/index.tsx:96`: `user.name ?? user.email` shows a blank name if `name` is `""`. Whether `""` is storable, and what the intended fallback is, are not defined by the supplied policy.
3. `AppVersion.tsx:7`: `??` passes an empty `APP_RELEASE_VERSION` through to `appVersionLabel`, whose behaviour is unseen.
4. `comparisonError.ts:19`: treating 403 as permanent ("will not come back") is asserted in the comment. The supplied policy does not state whether a re-granted editing access can return 403 transiently.
5. `applyOverlay.ts:10`: whether `captureFieldPath` returns falsy only for unknown keys, or also for valid-but-empty paths, is unseen.
6. `AppNav/index.tsx:116`: whether `readAt: { exists: false }` matches a `null` column depends on Payload's query translation, which is unverified.

Security and integrity claims in this range remain unreviewed until independent review.
