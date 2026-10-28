# P056-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: Discussions components (5 files)

**Coverage:** Read in full, as supplied, with no tool calls:
- `app/src/components/Discussions/ModerationControls.tsx:1-238`
- `app/src/components/Discussions/Pager.tsx:1-26`
- `app/src/components/Discussions/PostText.tsx:1-33`
- `app/src/components/Discussions/ReferencePicker.tsx:1-240`
- `app/src/components/Discussions/ReplyComposer.tsx:1-81`

Not assessed: `@/lib/wireError`, `@/lib/discussionText` (`linkify`, `paragraphsOf`, `refLabelFor`, `MAX_BODY_LENGTH`), `@/lib/displayTitle`, `referencePickerQueries`, `ComposerParts`, `useComposer`, `Modal`, `FormField`, `LessonReference`, and every server endpoint these components call. I did not check callers or runtime behaviour. The policy excerpts concern lesson-plan data and ingest, and none of them governs these components' behaviour, so no candidate relies on them.

**Purpose and invariants (as stated in the source):**
- Moderation writes go only through the moderation endpoints, one at a time (`inFlight` guard). A failed write that may have committed (5xx, timeout, network error) sets `uncertain`, which blocks further actions until a reload.
- Post text renders only as React text nodes or `<a rel="noopener noreferrer">`, never as HTML.
- The reference picker discards stale search and version responses via the `live` flag and the query-keyed `found` state.
- The composer blocks submit while a reference is pending or the body is blank.
- Interactive buttons inside forms are `type="button"`, so they cannot submit by accident.

**Candidates:** None confirmed as defects from local reading.

**Leads (uncertain, low severity):**

1. **Locale/timezone-dependent formatting.** `PostText.tsx:32-33` (`postTime`) and `ReferencePicker.tsx:220` call `toLocaleString`/`toLocaleDateString` with no explicit `timeZone`.
   - Precondition: a caller renders these during server rendering, or a timestamp falls near local midnight.
   - Expected vs actual: the supplied source does not state the expected display timezone, so I cannot name an expected output. The actual output depends on the runtime timezone, which can differ between server and browser.
   - Reproduction: render `postTime('2026-10-03T23:30:00Z')` under `TZ=UTC` and `TZ=Europe/London`. The date differs (Oct 3 vs Oct 4) if the output is not pinned to one zone.
   - Caller check needed: whether `postTime` runs in a server component, and whether a hydration warning appears.

2. **Status-code mapping assumes server contract.** `ModerationControls.tsx:90-99` navigates to `/discuss` on any 404 and refreshes on any 409, for every action.
   - The comment says a reply's 404 means its thread is gone. That holds only if the server behaves as described, and the endpoint is not in range.
   - Reproduction: mock a 404 from `/api/discussion-replies/{id}/redact` while the thread still exists, and confirm the UI leaves the thread.
   - For `delete`, a 409 only refreshes the page and leaves the deleted thread visible. Whether that is correct depends on what the server returns.

3. **Pager does not clamp `page`.** `Pager.tsx:16-23` renders "Page 9 of 3" with a Previous link if `page > totalPages`. Whether this can occur depends on the caller, which I did not check. Severity is low.

**Unresolved questions:**
- What status codes do the moderation endpoints return for stale targets, and does a 404 on a reply imply its thread is gone?
- Is `postTime` used in server-rendered output?
- What display timezone is the policy for discussion timestamps? The supplied policy excerpts do not say.
- What do `wireErrorMessage`, `linkify`/`paragraphsOf` (for example, handling of `javascript:` or other non-http URLs), and `useComposer` do on a committed-but-failed post?

Security and integrity claims in these files remain unreviewed until independent review.
