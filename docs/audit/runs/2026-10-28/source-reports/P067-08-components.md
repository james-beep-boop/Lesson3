# P067-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Scope and coverage

All seven supplied ranges were read as pasted. No tools were run, and I did not check callers, `ReferenceView` construction, `findReadableVersion` behavior, or runtime behavior.

- `app/src/components/LessonControls/index.tsx:1201-1488` (partial file)
- `app/src/components/LessonControls/initialCollapse.ts:1-36`
- `app/src/components/LessonControls/server.tsx:1-64`
- `app/src/components/LessonControls/validation.ts:1-92`
- `app/src/components/LessonDetails.tsx:1-42`
- `app/src/components/LessonReference.tsx:1-36`
- `app/src/components/LinkedTextarea/activeTarget.ts:1-42`

Not assessed: `index.tsx:1-1200`, and everything outside these ranges.

## Purpose and invariants (as observed)

- **Toolbar (`index.tsx`)**: gates Insert link, PDF, Help, Combine, Post, Compare, and Delete by state and role. Recovery UI appears only in edit mode.
- **`initialCollapse.ts`**: collapses every top-level array row on visit; returns `null` until `lessons.rows` exists.
- **`server.tsx`**: resolves system flags, draft existence, the readable source version, and Combine choices. The draft-suggestion query is wrapped in `.catch`.
- **`validation.ts`**: maps server and form errors to lesson/phase labels, reveals collapsed rows, and focuses the first input.
- **`LessonReference.tsx`**: shows a link, or text when the version is unavailable.
- **`activeTarget.ts`**: module-level singleton linking the active textarea to the toolbar's Insert link button.

## Candidates

**C1 — Lead, low to medium.** `index.tsx:1318-1324`
The Compare-to-Official link is nested under `canDelete`, which the surrounding comment assigns to the Delete button. A caller who can read but not delete does not see the compare link. `LessonReference.tsx:31` offers "Compare changes" to referencing readers, which suggests compare is a read-level action. No policy states this, so the expected visibility is unconfirmed.
*Test:* render with `canDelete=false`, `officialVersionId` set, and `!editing`; assert the compare link. Only meaningful once policy confirms the intended gate.

**C2 — Confirmed local reasoning, low.** `validation.ts:31-39` and `44`
When `entry.data.errors` is an array whose items have no string `message`, the entry's own `message` is discarded (the `if` branch returns without falling through). The function then returns the caller's generic `fallback`.
*Repro:* `requestErrorMessage({errors:[{message:'Save failed', data:{errors:[{}]}}]}, 'Fallback')` returns `'Fallback'`. The expected value is not policy-defined, so this rests on the code's own structure.

**C3 — Lead, low to medium.** `validation.ts:5-7`
For `lessons.N.framework.M.phase`, the server's actual message is replaced by the fixed text "Choose a phase from the list." The policy excerpt says the editor "displays the detailed reasons rather than only the generic validation heading." A phase error that is not a vocabulary failure (e.g., required-but-empty) would be mislabeled.
*Repro:* `fieldErrorMessage('lessons.0.framework.0.phase', 'Phase is required')` returns the fixed text, not the server reason.

**C4 — Lead, unknown severity.** `server.tsx:27-43`
Only the draft-suggestion query is guarded by `.catch`. `findReadableVersion` and `hasUnsavedWork` are awaited inside `Promise.all` without a guard, so if either throws, the whole controls component fails. The code comment says advice must never stop the editor. Whether these functions throw is unseen.

**C5 — Lead, unknown severity.** `LessonReference.tsx:21-33`
`compareHref` renders whenever present, independent of `lessonHref`. The comment says an unavailable version gets text, never an Official link. If `ReferenceView` can supply a `compareHref` pointing at Official when the referenced version is deleted, this breaks that rule. The builder is unseen.

**C6 — Lead, low.** `validation.ts:14-21`, `68-91`
- The "first" invalid field is whatever `Object.entries` order yields, not lesson/phase position. The policy requires the first (positional) field to be revealed and focused. Caller order is unseen.
- `focusField` silently gives up after 120 frames (about two seconds) with no fallback or message, so an error may not be focused or announced.

## Unresolved questions

1. Who may see Compare to Official (C1), and is it read-level or delete-level?
2. Should phase errors show the server reason (C3)?
3. Can `findReadableVersion`/`hasUnsavedWork` throw (C4)?
4. Can `ReferenceView.compareHref` target Official for an unavailable version (C5)?
5. Is the first invalid field determined by positional order at the caller (C6)?

Security and integrity claims in these ranges remain unreviewed pending independent review.
