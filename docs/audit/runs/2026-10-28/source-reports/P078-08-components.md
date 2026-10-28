# P078-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

- **Read:** `app/src/components/exportClient.ts:1-340`, as supplied in the request text. I made no tool calls, so I did not confirm that this text matches baseline `6e75a173e822e4c4be42821b0a4af48ca457bd36` or the working tree.
- **Not assessed:** `exportClient.spec.ts` (referenced at line 182), the export and status endpoints, `DocButtons` and other callers, and the server's `Content-Disposition` output. No caller or runtime behaviour was checked.
- **Policy excerpts:** they do not address this module's behaviour, so I applied no policy expectations.

## Purpose and invariants (as implemented)

- Two-phase export: `POST` prepares (200 ready, or 202 then poll the status URL), then an idempotent `GET` downloads (lines 71–137, 327–340).
- Popup-blocker handling: the tab is opened synchronously in the click gesture. The post-`await` retry is checked and throws `POPUP_BLOCKED_MESSAGE` rather than succeeding silently (lines 139–166, 210–265).
- Failure paths close the placeholder tab and surface an `onState('error')` message.
- Blob URLs are revoked after a delay, not immediately (lines 35, 260).

## Candidates

No confirmed medium or high severity defect in this range. Three low-severity leads, each with a stated precondition:

**1. Low, confirmed by local regex reasoning; server emission unverified.** `filenameFrom`, `exportClient.ts:21`, uses `/filename="?([^"]+)"?/i`.
- (a) Unquoted value with a following parameter. Precondition: header `attachment; filename=a.docx; size=10`. Expected `a.docx` (RFC 6266 token grammar, external standard). Actual `a.docx; size=10`, because `[^"]+` is greedy.
- (b) RFC 5987 `filename*=`. Precondition: header `attachment; filename*=UTF-8''Lesson%201.docx`. The regex needs `filename=` directly, so nothing matches and the fallback (`lesson-plan.docx`, or `export.zip`) is used silently.
- Repro: a Vitest case stubbing `fetch` and `document.createElement('a')` for `downloadPreparedDocument`, asserting `a.download`. `filenameFrom` is not exported, so the test must go through the public function.

**2. Low, uncertain intent.** `deliverToTab`, `exportClient.ts:162`. If the placeholder tab is closed during the 5–11 s warm-up, `tab.location.replace(url)` is a no-op. Both `openPreparedPdfInNewTab` (line 216) and `openGeneratedPdfInNewTab` (line 253) then resolve as success. This conflicts with the file's own statement at lines 150–151 that silent success is the worst outcome. However, the user closed the tab, so the discard may be intended. Expected behaviour is a product decision not given in the source, so I have not assumed it.
- Repro: open the tab, close it while the stubbed prepare is pending, and assert the promise's resolution and any `onState` output.

**3. Low lead, caller unseen.** `downloadVersionJson`, `exportClient.ts:315-318`. It calls `fetch` with no try/catch and no `onState`, so a network failure rejects with the browser's raw `TypeError` message. `fetchExport` (lines 50–62) maps the same failure to a user-facing message. Whether the user sees the raw text depends on the caller's catch, which I did not read.

## Unresolved questions

1. Does the server send `filename*=` or unquoted filenames followed by parameters? This decides whether candidate 1 is user-visible. Check the export endpoint headers.
2. What should happen when the placeholder tab is closed mid-warm-up: silent completion, or a message? This needs a product decision.
3. Can the cache evict between a `POST` returning ready and the `GET` (lines 332, 296)? If so, a non-200 GET shows "could not be downloaded" with no retry guidance. Server behaviour is unseen, so this is unconfirmed.
4. Does `exportClient.spec.ts` already cover the filename and closed-tab cases? I did not read it.
5. Does `downloadVersionJson`'s caller map `TypeError` to a user-facing message?

No tests were run. This is a read-only audit and no files were changed.
