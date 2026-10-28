# Haiku response — clipboard fallback

## P072-C1 (copy-link fallback on non-secure origins): Retain, amend, Low

**Disposition:** Retain. Amend the status from "local reasoning, browser behaviour not verified" to "reasoning confirmed by Sol's runtime observation." Severity stays **Low**.

**Basis:** I re-read the supplied source. `copyResetLink` calls `navigator.clipboard.writeText(reset.link)` directly, so when `navigator.clipboard` is `undefined` the property access throws synchronously inside the click handler. The `.then` and `.catch` chain is never attached, and the fallback `setError(...)` is unreachable on that path. Sol's observation (isSecureContext=false, `navigator.clipboard` undefined, one `writeText` TypeError, fallback text absent, manual input still visible) matches this mechanism. I have not executed anything here; this rests on Sol's runtime report and my reading of the code.

**Amendments:**

- **Trigger is broader than the original wording.** The defect fires whenever the Clipboard API is absent, which is the insecure-context case, not only "plain-HTTP LAN." Permission denial on a secure origin is different: that rejects the promise and reaches `.catch` correctly. The candidate should say the fallback is dead code exactly on the insecure-context path.
- **Repro should set the context explicitly.** Under jsdom, `navigator.clipboard` is absent by default, so the existing repro passes for the right reason, but it should also assert `isSecureContext === false` to document the supported case rather than rely on the jsdom default.
- **Impact unchanged.** There is no token leak and no auth failure. The reset link is still displayed in a selectable read-only input, and the user sees no error message on click, which is a usability and feedback defect on a supported deployment path.

**Suggested fix (for the author to choose):** guard before the call, e.g. `if (!navigator.clipboard?.writeText) { setError('Could not copy automatically — select and copy the link below.'); return }`, or wrap the call so synchronous throws are caught. Optionally, select the input and fall back to `document.execCommand('copy')` on that path. Any of these should be covered by a test that runs with `navigator.clipboard` undefined and asserts the fallback text.

**Not accepted here:** the other P072 leads (2 through 4 in the author's draft) are outside this adjudication and are not decided by this response. Candidate 3 in particular still depends on the server's `PATCH /users/:id` behaviour, which remains unresolved.
