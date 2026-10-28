# P053-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read (supplied excerpt only, no tool calls):** `app/src/components/AdminDashboard/index.tsx:401-875`, `app/src/components/AdminHeaderMenu/index.tsx:1-48`, `app/src/components/AdminUnauthorizedRedirect/index.tsx:1-20`.
- **Not verified:** that the excerpt matches baseline `6e75a173`. Nothing outside these ranges was read, so callers, helpers (`withAncestors`, `resolveServerPanelState`, `PANEL_IDS`, `awaitingApproval`, `systemFacts`, `backupStatus`) and schema nullability are unseen.
- **Not assessed:** the `AdminDashboard` source before line 401. The `AdminHeaderMenu` CSS hiding is cosmetic; the endpoint's own access control is outside these ranges.

## Purpose and invariants (as stated in the comments)

The dashboard decides which Manage panels a caller sees. The comments say `availablePanels` must list the same panels, in render order, with the same gates as the JSX, so that `?open=` cannot open a panel the caller cannot see. The page also builds the caller's own version and draft lists, the Site Admin taxonomy and plan panels, and the System panels. `AdminUnauthorizedRedirect` sends denied users to `/`; `AdminHeaderMenu` renders the header.

## Candidates

**C1 — Lead, Low to Medium. Awaiting-approval notice has no role gate in the supplied code.**
- Evidence: `index.tsx:618-637` renders when `awaitingApproval > 0`, with no `siteAdmin` check. The policy says a Site Administrator sees this count (§8), and §13 says a role sees only the controls it can use.
- Precondition: a non-Site-Admin Manage user, and `awaitingApproval` computed without a role check (not visible here).
- Expected: only Site Administrators see the pending count and link. Actual: the supplied JSX shows it to any caller. The link targets `users.accounts`, which is not in `availablePanels` for non-admins (`index.tsx:549`).
- Test: render as a Subject Administrator with one unverified account; assert the notice is absent.

**C2 — Confirmed locally, Low. `availablePanels` order differs from render order in System.**
- Evidence: `index.tsx:562-564` lists `system.deployment`, `system.backups`, `system.features`. The JSX at `index.tsx:806-855` renders `system.features`, then `system.deployment`, then `system.backups`.
- The comments at `index.tsx:478-479`, `:533-535` and `:799-803` require these to match.
- Actual impact is unconfirmed. It depends on `withAncestors`, `inRenderOrder` and the first-child rule, none of which were read.
- Test: as a Site Administrator with `systemFacts` and `backupStatus` set, compare the `AccordionPanel` id order in the DOM with `availablePanels`. Also test `?open=system.features&at=system.features`.

**C3 — Lead, Low. System gates are not symmetric.**
- Evidence: `index.tsx:562` gates `system.deployment` on `!!systemFacts` and `index.tsx:563` gates `system.backups` on `!!backupStatus`. The JSX parent at `index.tsx:804` requires `siteAdmin && systemFacts`.
- The comment at `index.tsx:562` says `systemFacts` is non-null exactly when `siteAdmin` is. That claim is not verifiable here.
- If it fails, `system` is listed for a non-admin whose page never renders it.
- Test: as a non-admin, pass non-null `systemFacts` and `backupStatus` into the page; assert no System panel ids are available.

**C4 — Confirmed locally for the conditional case, Low. Subject grade counts can exceed the rows shown.**
- Evidence: `index.tsx:500-505` counts every grade document with a subject. `index.tsx:516` drops documents whose `doc.grade == null`, which are still counted in `subjectGradeCount` (`index.tsx:509`). The drop is silent.
- Precondition: a subject-grade with a null `grade`. Schema nullability is not visible, so this is only reachable if `grade` can be null.
- Expected: the count matches the rows shown, or the row is surfaced. Actual: the count includes rows that are dropped without notice.
- Test: seed a subject-grade with null `grade` (if the schema allows it); assert `subjectGradeCount` equals the rendered grade rows for that subject.

**C5 — Lead, Low. Missing fetch results render as empty data with no warning.**
- Evidence: `index.tsx:506` uses `taxonomySubjectsRes?.docs ?? []`, and `index.tsx:528` uses `assignmentCounts?.get(doc.id) ?? NO_ASSIGNMENTS`. Both render as empty or zero without an alert. The settings panel (`index.tsx:826-827`) does show an alert for unavailable data.
- Whether `undefined` means a failed load is not visible here.
- Test: force the taxonomy-subjects fetch to return `undefined`; assert the page shows an unavailable message rather than an empty list.

**No candidates** in `AdminHeaderMenu` or `AdminUnauthorizedRedirect` from the supplied lines.

## Unresolved questions

1. How is `awaitingApproval` derived, and is it gated by role?
2. Can `systemFacts` or `backupStatus` be non-null for non-admins?
3. Is `PANEL_IDS` ordered as the JSX renders, and what does `inRenderOrder` do with a mismatch?
4. Can `subjectGrade.grade` be null?
5. Can unauthenticated requests reach `AdminUnauthorizedRedirect`? If so, does `/` require sign-in and send them back to `/admin`?

Security and integrity observations here are unreviewed until an independent review.
