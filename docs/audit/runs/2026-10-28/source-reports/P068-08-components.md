# P068-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Correctness audit: partial assessment (5 supplied ranges, read-only)

I reviewed the supplied text only. I ran no tools, so I did not confirm that it matches baseline `6e75a173`, and I did not check callers, `proseLinkTokens`, `custom.scss`, or any runtime behaviour. Policy excerpts were context, not assessed.

**Read in full:** `app/src/components/LinkedTextarea/aresAddress.ts:1-68`, `LinkedTextarea/index.tsx:1-246`, `LinkedTextarea/insertLink.ts:1-49`, `Manage/Accordion.tsx:1-158`, `Manage/BackupStatusPanel.tsx:1-86`.

## Purpose and invariants

- **aresAddress.ts:** maps an ARES/Kolibri address onto `ares.local` by matching origin plus whole path prefix, preferring the longest prefix, and strips `?prev`.
- **insertLink.ts / index.tsx:** inserts `Label (url)` at the remembered caret, validates the label, and encodes parentheses in URLs.
- **Accordion.tsx:** a disclosure list in which closed panels stay mounted (`hidden`) and heading rank derives from the id.
- **BackupStatusPanel.tsx:** a read-only report. Reading the file confirms it has no start or restore control.

## Candidates

**C1: Medium. Uncertain lead (browser-event dependent).**
`index.tsx:97-105, 117-123`. Locally, `insert` sets the DOM caret to `result.cursor` in a timeout, but `cursorRef` is refreshed only by capture handlers. `focus()` runs before `setSelectionRange`, and assigning `value` moves the caret to the end, so `cursorRef` may hold end-of-text.
- Expected (from the component's own design): the next insert lands at the caret.
- Actual (predicted, not run): it lands at end-of-text.
- Repro (Playwright, real browser): fill "Alpha Beta", caret at 5, insert `X` with `http://ares.local/a`. Without clicking the text, open the dialog and insert `http://ares.local/b`. Assert the second link sits at the `selectionStart` recorded before the dialog opened.

**C2: Low. Confirmed local output; expected behaviour unknown.**
`insertLink.ts:15-19, 41-49`. An unlabelled insert adds no separator, so `insertParenthesizedUrl('see', 3, 'http://ares.local/x')` yields `see(http://ares.local/x)`. A label such as `Figure (a)` passes `labelError` and yields `Figure (a) (http://ares.local/x)`. Whether the tokenizer accepts these forms is unverified.
- Repro (unit): round-trip these outputs through `proseLinkTokens` and assert the URL and label are recovered.

**C3: Low. Question, not a defect.**
`aresAddress.ts:50-53, 65-67`. If `siteUrl` and `kolibriUrl` share an origin with an empty path, every path on that origin is rewritten to `:8069`. For example, `https://school.example/modules/x` becomes `http://ares.local:8069/modules/x`. The comment at line 52 states this intent, but the supplied policy does not say which mapping is correct.
- Repro (unit): `siteUrl = kolibriUrl = https://school.example`; assert the output for `/modules/x`.

**C4: Low. Confirmed local output; the stated rules conflict.**
`aresAddress.ts:14-18, 65-67`. `withoutAresNavigation` truncates the rebuilt string at the first `?prev`, including inside a tracker's `?target=` value. The tracker comment says addresses are "kept as copied", while the navigation rule says to remove "everything after" `?prev`.
- Input: `http://ares.local/tracker/x_launch.html?target=http://ares.local/a?prev=1`
- Output: `http://ares.local/tracker/x_launch.html?target=http://ares.local/a`
- Repro (unit): assert that output. The owner must decide which rule governs.

**No confirmed defects** in `Accordion.tsx` or `BackupStatusPanel.tsx`. The panel's `hidden` correctness depends on a `custom.scss` guard that was not supplied. The restore procedure text is not verifiable from this file.

## Unresolved questions

1. `index.tsx:214`: the server PDF `href` is inserted without a scheme check. Does the endpoint guarantee `http(s)`?
2. Do the C2 forms round-trip through `proseLinkTokens`?
3. Does C1 reproduce in the target browsers?
4. Which host should a pathless shared origin map to (C3)?
5. `BackupStatusPanel.tsx:67`: does the guide anchor `site-admins.backups` exist?
