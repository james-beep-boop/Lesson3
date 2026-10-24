# C23 — Authentication flows (source part)

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Mandatory checks for this part:** every C23 bullet in the catalog, answered from source at the
  baseline plus the installed Payload 3.91.0 auth operations it delegates to (read from the published
  `payload@3.91.0` package, outside the checkout): lockout/rate limiting, enumeration on login /
  forgot-password / signup, reset-token lifecycle, session invalidation, cookie flags and CSRF posture,
  verification bypass, first-user bootstrap, signup field stripping.
- **Artifacts:** this report; candidates in [findings/C23-auth.md](findings/C23-auth.md); one local
  timing measurement of Payload's password hash (recorded in F-C23-003).
- **Exclusions (superseded by the runtime results below):** no live requests at the time of writing. This session had no approved C01 target, so every runtime bullet
  (~50 rapid attempts, response/timing comparison over HTTP, cookie flags on the wire, cross-origin
  POST, Cloudflare/proxy behaviour) is **blocked, not covered**. Edge/proxy limits belong to the
  deployment-parity pass.
- **Exit:** each bullet below is source-answered or carries an exact runtime next action; candidates
  carry evidence scope "source-confirmed" until reproduced on the C01 target.

## Outcome

**Source part complete; runtime part done on 2026-10-24 (see Runtime results below).** Three candidates (all author-verified/unreviewed,
security tier → full opposite-family cycle required):

| ID | Summary | Provisional severity |
|---|---|---|
| F-C23-001 | ~1,000 unauthenticated requests per hour deny sign-in to every account; smaller counts deny reset, signup and verification site-wide | Medium |
| F-C23-002 | 20 requests per hour keep one chosen account from signing in; 5 per day block its email reset | Low |
| F-C23-003 | Login reveals whether an address is registered (password hash runs only for real accounts; lockout message) | Low |

## Coverage by catalog bullet

| Bullet | Source answer at baseline | Runtime next action |
|---|---|---|
| Lockout / rate limiting | Planning premise corrected: `maxLoginAttempts` is not set in `Users.ts`, but Payload's default applies (5 attempts, 10-minute lock; `collections/config/defaults.js:140–142`). App-level buckets in `hooks/authRateLimit.ts:149–198` + `lib/rateLimit.ts:148–193`. Their shared-bucket design is F-C23-001/002 | 50 rapid wrong attempts on a throwaway account; record 401→LockedAuth→429 sequence |
| Enumeration | Forgot-password: uniform body + 400 ms floor (`endpoints/forgotPassword.ts:249–377`) — no new oracle found. Login: F-C23-003. Signup: deliberate disclosure in the UI ("may already exist", `SignupForm.tsx:42`) — recorded as policy question Q-C23-01, not a finding | Time login for known vs unknown addresses (n≥20 each), after clearing `login%` counters |
| Password reset | Token = 20 random bytes, 1 h expiry, single use (expiration set to now on use, `resetPassword.js:64`); all sessions cleared on reset (`:92`); disabled accounts refused (`refuseDisabledLogin`). Token scrubbed from the address bar; `Referrer-Policy: strict-origin-when-cross-origin` (`next.config.ts:76`). Link base from `ADMIN_URL`/`SERVER_URL` (`lib/emailLinkBase.ts`) | Capture a reset mail; confirm host, reuse refusal, expiry |
| Sessions | `tokenExpiration: 7200`; sessions enabled (Payload default); JWT strategy requires the token's `sid` in the user's `sessions` (`jwt.js:111`), so logout and reset revoke. Self password change keeps only the current session (`collections/operations/utilities/update.js:302`). Unlimited concurrent sessions (Info) | Old cookie after logout/password change; inactivity expiry |
| Cookie flags / CSRF | `Secure` only when `SERVER_URL` is https (`Users.ts:79`); `SameSite=Lax`; Payload's Origin/Sec-Fetch allowlist only when `SERVER_URL` is set (`payload.config.ts:98`). No state-changing GET endpoint found (all 14 custom GETs read only). Lead L-C23-01 | Cross-origin form/fetch POST from a foreign page; same-site sibling origin |
| Verification bypass | `_verified` create/update are Site-Admin-only (`Users.ts:233–240`); login refuses unverified only after the password matches (`login.js:188`, not an oracle); JWT strategy refuses unverified users | Log in / call API as the unverified fixture |
| First-user bootstrap | Anonymous create needs existing users (`access/index.ts:158–162`); `/first-register` after initialization is refused (`hooks/userRoles.ts:305–306`); public boot refuses an empty DB (`lib/publicPosture.ts`) | Direct `POST /api/users/first-register` on a seeded DB |
| Signup | `roles`, `assignments`, `_verified`, `signInDisabled`, provenance stripped on create by field access; per-address 3/day + global 100/day. Header injection: subjects are constants; name/email rendering belongs to C24 | Mass-assignment bodies (shared with C22) |

## Leads (not findings)

- **L-C23-01 — CSRF posture without `SERVER_URL`.** With `SERVER_URL` empty, the only CSRF control
  is `SameSite=Lax`, which treats other ports and subdomains of the same registrable domain as
  same-site. A page on a sibling origin (e.g. another service on the same host) can therefore send
  credentialed POSTs. Deployment-dependent; confirm what the shared deployment sets before rating. Codex review (2026-10-24) rates this Info pending deployment evidence, and Medium if an untrusted sibling origin can reach authenticated mutations. **Server-side evidence (2026-10-24, disposable stack rebuilt for this check, `SERVER_URL` empty):** a cookie-authenticated `POST /api/messages` was accepted (201) for an empty `Origin`, a sibling origin on another port with `Sec-Fetch-Site: same-site`, and a foreign origin with `Sec-Fetch-Site: cross-site`. The control with no cookie was refused (403). So the app does not check `Origin` in this configuration; the only defence is the browser's `SameSite=Lax` cookie rule, which still sends the cookie to a same-site sibling origin. This was measured with Node's fetch, which sends cookies regardless of SameSite, so it confirms the missing server check, not browser behaviour. **Browser half, measured (Chromium on the same stack, signed-in context, DevTools network events, same-origin control sent its cookie):** the cookie **is sent** to a same-site sibling origin (`127.0.0.1:3399`) and **is not sent** to a cross-site origin (`attacker.example:3399`). So `SameSite=Lax` is the only barrier, and it does not stop a same-site sibling. The GET result is measured; for POST, the SameSite rule allows same-site requests of every method. That is inferred, not browser-tested. Rating stays Info while no untrusted same-site origin is known on the shared deployment; Medium if one exists.
- **L-C23-02 — Login hash cost as unauthenticated CPU load.** Each login for a real address costs one
  600,000-iteration PBKDF2 (~137 ms here). Bounded by the 1,000/h global bucket; measure on the
  target hardware in C62.

## Runtime results (2026-10-24, disposable cloud stack)

Reproduced on a throwaway stack (baseline production build, Node 24.22.1, Payload 3.91.0, PostgreSQL
16.15, Mailpit; all services loopback-only; nine synthetic accounts; torn down with the session).
**Locally reproduced**, not deployment-reproduced.

| Bullet | Result |
|---|---|
| Role logins | All eight verified accounts 200; the unverified account 403 "Please verify your email before logging in." |
| **F-C23-001** | 1,001 anonymous wrong logins with distinct random addresses took **5 s**; the 1,001st and the next Site-Admin and Teacher logins returned **429** ("wait 3333s"). Confirmed. |
| **F-C23-002** | 20 wrong logins naming one account returned 429 for the rest of the hour; the real owner's correct password then got 429 even after Payload's own 5-attempt lock was cleared. Confirmed. |
| **F-C23-003** | Wrong-password login (≤4 per account, so no lockout): known addresses median **362 ms** (min 320), unknown **16 ms** (min 12, max 23) — fully separable, one sample classifies. Lockout message differs too: a real account returns "This user is locked…" after 5 attempts; an unknown address always returns the generic message. Confirmed. |
| Lockout default | Payload's default fires: 5 wrong attempts → "This user is locked due to having too many failed login attempts" (401); the correct password is refused while locked. |
| Forgot-password oracle | Known and unknown addresses returned identical 200 bodies; times 415 ms vs 409 ms (both at the floor). Mail reached only the real account, at the catcher. No oracle — safe. |
| Reset token | Link host `127.0.0.1:3300` (from `ADMIN_URL`); first use 200, second use 403 "Token is either invalid or has expired"; the pre-reset password then failed and the new one worked (sessions/credentials rotated). Safe. |
| Signup | Registered address → 400 "field is invalid: email"; fresh → 201. Existence is distinguishable (Q-C23-01). A body carrying `roles:['siteAdmin']`, `_verified:true` and `assignments` created an account with no roles, `_verified=f` and zero assignments — mass assignment stripped. Safe. |
| Verification bypass | The unverified account could not log in (403). Safe. |
| First-register | `POST /api/users/first-register` on the seeded DB → 403 "You are not allowed to perform this action." Safe. |
| Cookie flags | `payload-token … Path=/; HttpOnly; SameSite=Lax`, no `Secure` (SERVER_URL empty here, matching source). Logout revoked only that session's cookie; a second concurrent session stayed valid (expected per-session logout). |

CSRF cross-origin POST (L-C23-01) was not exercised — it needs a second origin and belongs to the
deployment-parity pass. The cookie posture above is the source-confirmed input to it.

## Policy question

- **Q-C23-01 — Is signup's existence disclosure accepted?** `POST /api/users` with a registered
  address fails with Payload's duplicate-email error, and the signup form says the account "may
  already exist". This contradicts the anti-enumeration stance taken for forgot-password, but it is a
  visible UI choice, so it is recorded for the operator rather than filed. The answer sets F-C23-003's
  final severity.

## Resume point

Runtime half of C23 on the C01 target, holding the target lock: lockout sequence, timing samples for
F-C23-003, global-bucket exhaustion for F-C23-001 (then clear `rate_limit_counters`), cookie flags,
cross-origin POST, unverified-fixture API calls, first-register on a seeded DB. Then opposite-family
review of the three candidates.
