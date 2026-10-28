# P051-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made, so nothing was executed and the source was not checked against baseline `6e75a173`. Assessment is by reading the supplied text only.

- **Read:** `app/src/components/AdminDashboard/CandidateList.tsx:1-203`
- **Read:** `app/src/components/AdminDashboard/DeletePlansPanel.tsx:1-435`
- **Not assessed:** the untracked `app/tests/audit/*` and `docs/audit/runs/2026-10-28/tools/` files, and all imports (`lib/substrand`, `lib/planSelection`, `lib/wireError`, `lib/personalVersions`, `withUnsavedWarning`, `CompareToOfficialLink`, `Modal`, `apiBaseFrom`). Their behaviour, and the server endpoints these components call, are unverified.
- **Policy excerpts:** used only as context. They were not treated as source findings.

## Purpose and invariants (as stated in the code)

- **CandidateList:** per-row actions are server decisions (`canDelete`, `canEdit`, `officialVersionId`). The client renders them and does not derive them. Search is client-side over label, subject-grade, semver and author. The empty-state text is kept separate from "no search match".
- **DeletePlansPanel:** plans are deleted one at a time by ID, fail-fast. Each delete is its own transaction. Selection is pruned to the ids actually removed, so a partial failure leaves the rest selected. Group selection is hidden during search so that group checkboxes cannot mean two things. Deletes of more than one plan require typing `DELETE`.

## Candidates

**C1 — Delete busy flag can stick (lead, low severity)**
- Location: `CandidateList.tsx:89-102`, with the disabled state at `:189`.
- Precondition: `withUnsavedWarning(...)` rejects. Its implementation is not in the supplied range, so whether it can reject is unknown.
- Expected: the busy flag is released on every path, or the failure is shown.
- Actual, from local reasoning: `setBusyId(row.id)` runs at `:92`. The awaited call at `:94` has no `try`/`finally`. A rejection skips `setBusyId(null)` at `:100`. `busyId` stays non-null, so every Delete button on the list stays disabled (`:189`) until reload. The `void onDelete(row)` at `:190` also leaves the rejection unhandled, with no toast.
- Reproduction: render `CandidateList` with two `canDelete` rows and mock `withUnsavedWarning` to reject. Click the first Delete. Expect the second Delete to be enabled and an error toast to appear. Current code should fail that expectation.
- Confidence: confirmed by reading that the flag is not reset on throw. Whether the throw can happen is unverified.

**C2 — Plan checkbox accessible name drops the context the file says it preserves (lead, low severity)**
- Location: `DeletePlansPanel.tsx:353`, against the stated intent at `:220-223` and `:270-278`.
- Precondition: two plans share a `substrandName` under different subject-grades or strands, and both appear in the unfiltered tree. Whether the data allows this is unverified.
- Expected, per the file's own comments: destructive controls keep their subject-grade or strand context, so a screen-reader user can tell them apart before acting. The strand and group headings do this, but the plan checkboxes do not.
- Actual: `aria-label={`Select ${row.substrandName}`}` overrides the label text. The accessible name is only the sub-strand name, with no subject-grade or strand.
- Reproduction: render two `PlanLine` rows with the same `substrandName` under different subject-grades. Query checkboxes by accessible name and expect the names to differ. Current code gives identical names.
- Confidence: confirmed by reading the attribute. The user impact depends on whether duplicate names occur in real data.

## Checked, no defect found locally

- Hook order in `CandidateList`: all hooks are above the early return at `:85`.
- `DeletePlansPanel` removal tracking: `removed` records ids as they succeed, and `finally` prunes exactly those from `selected` (`:98-129`). Partial-failure messaging is consistent with that.
- Hidden-selection count and its text (`:80`, `:176-180`, `:393-397`).
- Typed-`DELETE` gate: it applies to more than one plan (`:388-389`), as the comment at `:365-367` states, so it is treated as intentional.

## Unresolved questions

1. Can `withUnsavedWarning` reject, or does it always resolve? This decides whether C1 is reachable.
2. Can `substrandName` repeat across subject-grades in real data? This decides whether C2 matters beyond the code's own stated intent.
3. Does `CompareToOfficialLink` or the server enforce the same delete guard that the client's `canDelete` relies on? The client does not re-check it, which is by design, but this was not verified.
