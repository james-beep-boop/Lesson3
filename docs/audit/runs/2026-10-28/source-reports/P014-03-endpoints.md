# P014-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Correctness audit: `app/src/endpoints` (supplied ranges)

**Coverage**
- Read: `app/src/endpoints/resourceLibrary.ts:1-186`, `respond.ts:1-184`, `serverTime.ts:1-23`, `systemSettingsSave.ts:1-225`. I reviewed only the supplied text, with no tools, runs, or tests.
- Policy excerpts: used as context only. Not assessed as code.
- Not assessed: callers, imports (`lib/txDb`, `lib/loginProtection`, `lib/systemFlagNames`, `lib/schoolName`, `access`), Payload internals (`initTransaction`/`killTransaction` semantics, `logoutOperation`, `findByID` with `disableErrors`), and deployment config such as the reverse proxy and `PDF_LIBRARY_DIR`.

**Purpose and invariants (summary)**
- `resourceLibrary`: lists and streams only flat, regular, small `.pdf` files. Tokens are canonical base64url of the name. Serving uses `O_NOFOLLOW`, a PDF signature check, and a size bound. Public serving requires an explicit opt-in.
- `respond`: 401-before-403 gate, re-authentication refresh inside transactions, declared-length body guard, and JSON response helper.
- `serverTime`: Site-Admin-only clock read, `no-store`.
- `systemSettingsSave`: sole writer of `system-settings`. Order: authorize, validate allowlist, re-authenticate by password, then take the advisory lock, re-check admin, check freshness, and write.

**Candidates**

1. **Blocking open on non-regular `*.pdf` entries** (medium if the public opt-in is enabled; low otherwise)
   - Evidence: `resourceLibrary.ts:93` calls `open(filePath, O_RDONLY|O_NOFOLLOW)` before the `isFile()` check at `:95`. Opening a FIFO for read without `O_NONBLOCK` blocks until a writer appears (POSIX `open(2)` semantics). The listing filter (`:66`) excludes FIFOs, but the serve path does not.
   - Precondition: a FIFO or device node named `something.pdf` exists in `PDF_LIBRARY_DIR`. This needs write access to that directory, which the app does not control. The request must name it by token.
   - Expected: a fast `not-found`. Actual: the handler's `open` waits indefinitely. Node runs `fs` operations on the libuv threadpool, so repeated requests could plausibly starve it. I have not verified that runtime behaviour.
   - Reproduction: in a temp directory, `mkfifo x.pdf`, then call `readPdfFile(dir, encodePdfToken('x.pdf'))` under a 1-second timeout. Expect `{kind:'not-found'}`; the call should time out instead.

2. **Listed files that the download endpoint rejects** (low; user-visible)
   - Evidence: `listPdfFiles` (`:62-76`) checks only extension, dirent type, and size. It does not check the signature. `readPdfFile` (`:97-99`) returns `not-found` for a zero-length file or one without the `%PDF-` prefix.
   - Expected: the file header does not state that listed items are downloadable, so this is a lead, not a stated invariant. Actual: such a file appears in the list, and its link returns 404.
   - Reproduction: create an empty `x.pdf`. The list includes it; `GET /api/resource-library/file/<token>` returns 404.

3. **`readJsonBody` overclaims its size guarantee** (low to medium; depends on deployment)
   - Evidence: `respond.ts:150-156` says folding the ceiling into the read makes "no request may make the process allocate an unbounded body" hold by construction. But `:172-183` only checks the declared `Content-Length` (`assertDeclaredBodyWithin`, `:116-125`). When the header is absent or the body is chunked, `req.json()` reads the whole body. The file's own note at `:111-114` says the proxy must enforce this.
   - Expected, per the doc comment: a bounded read. Actual: bounded only if the proxy enforces it.
   - Reproduction: call `readJsonBody` with a chunked stream of about 2 MiB and a 16 KiB ceiling. Expect rejection. Actual: the full body is read.
   - Security claim unreviewed until independent review.

**Items I did not classify as defects**
- `serverTime.ts`, `respond.ts` `refreshCaller`/`reassertSiteAdmin`/`json`, and `systemSettingsSave.ts` allowlist/`parseSaveBody` match their stated contracts on the supplied text. No defect found.
- `systemSettingsSave.ts:141-168`: if `logoutOperation` fails after a successful re-auth, the minted session stays, and the Save fails. The comment at `:136-139` describes this fail-closed path, so it is an open question, not a defect.

**Unresolved questions**
- `systemSettingsSave.ts:178-223`: if `initTransaction` returns `false` (outer transaction present), `killTransaction` in the `catch` may roll back a transaction the endpoint does not own. Needs Payload semantics to settle.
- `resourceLibrary.ts:97-108`: a file truncated after `handle.stat()` yields a body shorter than the declared `Content-Length`. Likely harmless, but needs runtime confirmation.
- `resourceLibrary.ts:75`: `readdir` or `stat` failing on one entry (e.g. a file removed mid-listing) makes the whole listing return 503. Intended, or should it skip the entry?
- Expected policy for listing: should it promise downloadability, which would make item 2 a defect?
