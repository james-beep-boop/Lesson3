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
- **Exclusions:** no live requests. This session had no approved C01 target, so every runtime bullet
  (~50 rapid attempts, response/timing comparison over HTTP, cookie flags on the wire, cross-origin
  POST, Cloudflare/proxy behaviour) is **blocked, not covered**. Edge/proxy limits belong to the
  deployment-parity pass.
- **Exit:** each bullet below is source-answered or carries an exact runtime next action; candidates
  carry evidence scope "source-confirmed" until reproduced on the C01 target.

## Outcome

**Source part complete; runtime part pending.** Three candidates (all author-verified/unreviewed,
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
  credentialed POSTs. Deployment-dependent; confirm what the shared deployment sets before rating.
- **L-C23-02 — Login hash cost as unauthenticated CPU load.** Each login for a real address costs one
  600,000-iteration PBKDF2 (~137 ms here). Bounded by the 1,000/h global bucket; measure on the
  target hardware in C62.

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
