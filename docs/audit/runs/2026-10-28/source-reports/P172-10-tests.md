# P172-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

Read as supplied, all ranges complete:
- `app/tests/unit/discussionModerationControls.spec.tsx:1-212`
- `app/tests/unit/discussionModerationPages.spec.tsx:1-107`
- `app/tests/unit/discussionPages.spec.ts:1-84`
- `app/tests/unit/discussionPaging.spec.ts:1-79`
- `app/tests/unit/discussionReferenceSelection.spec.tsx:1-120`

Not assessed: the implementations these tests exercise (`src/lib/discussionPages.ts`, `discussionPaging.ts`, `components/Discussions/*`, `app/(frontend)/discuss/*`). No runtime behavior was executed or verified. Policy excerpts were read for context only; none of them defines discussion behavior, so the tests were checked for internal consistency and not against policy.

Coverage status: **partial**. Only the test files were reviewed, and only for internal consistency.

## Purpose and invariants (as asserted by the tests)

- **Thread paging (`discussionPaging`)**: 50 replies per page; page 1 always exists; `entryPage` opens at the page holding `lastReadSeq + 1`; `markRangeFor` marks only what the displayed page showed (page 1 from seq 0, later pages from their first reply).
- **Thread loader (`discussionPages`)**: only 404/403 map to the not-found digest; other errors propagate; moderation while forum is off skips the participation read.
- **Forum gate**: ordinary users get 404 while off; only the administrator moderation view is admitted while off.
- **Moderation controls**: control order and dialog titles; redact sends only the selected part; in-flight requests cannot be resent; a 404 returns to the list; a 409 re-renders; a 500 or lost answer forces Reload with no retry; ordinary refusals (429) keep the dialog open.
- **Pages**: repeated or off-state search params are ignored; moderation controls appear only for administrators.
- **Reference selection**: submit is blocked until a version is chosen; a failed or empty version lookup blocks submit until Cancel.

I checked the expected values against the stated page arithmetic (e.g. 50/51 boundaries, `entryPage(50,50)→1`, `entryPage(51,51)→2`, `postHref(5,73)→page 2`), and they are consistent.

## Candidates

**None confirmed.** I found no concrete mismatch between the test expectations and the behavior they describe. Each assertion agrees with the title, comment, and the other assertions in its own file.

## Uncertain leads (not defects)

1. **Reply redaction while forum is off**: `discussionModerationControls.spec.tsx:48` renders a reply target with no `forumEnabled` field, and no test covers a reply while the forum is off. The tests cover topic-only off-state behavior (lines 104–114). Whether reply redaction should be hidden while off is not stated by any supplied policy, so I cannot call this a bug. Confidence: low. It needs a policy statement and the page code that supplies the reply target.
2. **Cancel after failed lookup**: `discussionReferenceSelection.spec.tsx:113-116` asserts that Cancel re-enables submission without a version. That is a product choice, not something the policy excerpts define. It is recorded here only as a local expectation.

## Unresolved questions

- Is there a policy for discussions (moderation while off, 403 vs 404 disclosure, pagination)? The supplied excerpts cover ingest, versions, and roles only.
- Do the page components pass `forumEnabled` and `enabled` through the paths these tests assume? That requires reading the page and component sources, which were not supplied.
- Do `loadThread`'s 403 mapping and the reply-target moderation rules match the intended access model? The tests assert the current design, which cannot be verified from test text alone.
