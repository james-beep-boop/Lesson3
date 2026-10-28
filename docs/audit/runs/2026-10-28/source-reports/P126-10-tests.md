# P126-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope and method.** No tools were run. I reviewed only the supplied text for `app/tests/http/endpoints.http.spec.ts:1601-2000`, not the file on disk. Line 2000 is the `describe` header only; its body was not assessed. Helpers (`call`, `auth`, `url`, `rateCount`, `freshUpdatedAt`, `MARK`, `fx`), the endpoints under test, the login route, and the rate limiter were not in range. I make no claim about callers or runtime behaviour.

**Purpose and asserted invariants (test-stated, not independently verified):**
- Role assign/unassign: a stale `expectedUpdatedAt` returns 409 and changes nothing; a Site Admin target and non-admin callers are refused.
- Email-a-doc: 401 without auth; 400 for invalid recipients; 404 for unreadable versions, which spend no shared recipient cap; the daily cap returns 429 and counts invalid bodies; 202 or 503 depending on SMTP.
- Messaging: sender is server-stamped; non-participant admins cannot read; PATCH and DELETE are refused.
- Self-registration: `roles`, `assignments` and `_verified` are stripped; unverified login is refused; the verify endpoint is throttled; the per-address signup cap is 3; `overrideAccess` cannot be forged.

**Candidates**

1. **Lead, low–medium (user-visible wording).** `endpoints.http.spec.ts:1897-1901` asserts unverified login returns a message matching `/verify your email/i`, with no SMTP gate. Its neighbours at 1708 and 1734 are gated, and the file's own comment at 1666 says CI and offline installs lack SMTP. The policy amended 2026-10-19 says that on no-SMTP sites the message must say "waiting for approval" and must not name an email.
   - Precondition: run with `SMTP_HOST` unset.
   - Expected (policy): "waiting for approval".
   - Actual (per this assertion): "verify your email" on any stack.
   - Reproduction: run this `it` without SMTP and assert `/waiting for approval/`.
   - Either the product emits the SMTP wording without SMTP, or this test fails on offline CI. The login error source is outside the range, so I cannot say which.

2. **Lead, low; security/privacy, unreviewed.** `:1961-1968` and `:1974-1996` treat a duplicate signup as a distinct 400, which is an existence oracle for anonymous visitors. The per-address cap does not stop enumeration across many addresses. The policy excerpt does not say whether this disclosure is intended, so this is not a confirmed defect. Independent review is needed.

3. **Test-coverage gaps (not product defects).**
   - `:1683-1689` is titled "nothing queued" but asserts no queue state.
   - `:1770-1774` comments "no row" but does not assert it.
   - `:1817-1830` does not check that the rejected PATCH left `readAt` unchanged.
   - `:1720-1730` and `:1795-1804` look up jobs with a fixed `limit` and no sort, so they can false-fail or match stale rows.
   - `:1622-1639` is titled as a Subject Admin caller, but no caller key is passed in range, and the comment at `:1623` describes a different actor.

4. **Unverified claim in a comment.** `:1925-1927` says Payload's native verify handler has no throttle. That is an external claim I could not check.

**Unresolved questions**
- Which code produces the 403 message at `:1901`, and does it branch on SMTP?
- What caller key does the default `call` use at `:1626`, and does it match the title at `:1622`?
- Is the duplicate-email 400 (`:1968`) an intended, policy-approved disclosure?
- Can the shared `verifyEmailGlobal:all` drain at `:1931-1945` race other specs against the same database?
