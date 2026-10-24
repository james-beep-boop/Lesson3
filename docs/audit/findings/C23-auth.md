# C23 — Authentication candidates

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. These are candidates, not accepted totals.
Payload references are to the published `payload@3.91.0` package (`dist/`), the version the baseline
pins. Coverage, confirmed-safe checks and leads are in [C23-auth.md](../C23-auth.md).

**Runtime reproduction (2026-10-24).** All three were reproduced on a disposable cloud stack —
production build of the baseline, Node 24.22.1, Payload 3.91.0, PostgreSQL 16.15, Mailpit, every
service bound to loopback, synthetic data only, torn down with the session. This is **locally
reproduced**, not deployment-reproduced; the shared deployment's edge/proxy posture is a separate
parity check. Evidence summary in [C23-auth.md](../C23-auth.md) "Runtime results"; raw request logs
kept out of Git.

## F-C23-001 — Unauthenticated requests can deny sign-in to every account

- **Severity:** provisional Medium. **Category:** authentication / availability.
  **Exposure:** live on any deployment reachable without the OPS edge rate limiter.
- **Known status:** partly known. `lib/rateLimit.ts:186–189` notes per-IP throttling is deferred to
  Phase 5 edge rate limiting, and `docs/OPS.md` ("Going public", item 2) lists an edge limiter. The
  site-wide denial consequence for login is not recorded anywhere found.
- **Audit / review status:** candidate, author-verified/unreviewed; full security cycle required.
  Author: author-a (Claude), 2026-10-24. Opposite-family critique pending.
- **Evidence scope / confidence:** locally reproduced (disposable cloud stack, 2026-10-24), high confidence.
- **Scenario:** an anonymous client sends 1,001 login attempts in one hour, each to a different made-up
  address → every later login in that window, for every account including Site Administrators, gets 429.
- **Where:** `app/src/hooks/authRateLimit.ts:149–198`; bucket sizes `app/src/lib/rateLimit.ts:105–112`,
  `148–167`, `190–193`; `app/src/endpoints/verifyEmail.ts:28–34`.

### Source chain

1. `rateLimitAuthOperations` runs for every `login`, `forgotPassword` and anonymous `create`. It
   charges the per-address bucket, then the site-wide bucket keyed `'all'` (`authRateLimit.ts:191–198`).
2. The per-address key is whatever address the request names, so a fresh address per request never
   trips the per-address cap, while every request charges the shared site-wide bucket.
3. Site-wide budgets: `loginGlobal` 1,000/hour, `forgotPasswordGlobal` 100/day, `signupGlobal`
   100/day; the verify endpoint has only `verifyEmailGlobal` 300/day (`verifyEmail.ts:28–34`), keyed by
   nothing the caller cannot vary.
4. Once a site-wide bucket is spent, the hook throws 429 before Payload looks at the request, for every
   caller. Counters are fixed windows in Postgres (`rateLimit.ts:208–226`), so the denial lasts until
   the window ends (up to an hour for login, up to a day for the others).

### Impact and limits

- Login: no account can sign in, including Site Administrators, so the installation cannot be
  administered for up to an hour; repeatable every hour at ~1,000 requests. Existing sessions continue.
- Forgot-password and signup: about 100 requests a day stop email resets and new accounts site-wide.
  The Site-Admin reset-link path is exempt (`ADMIN_RESET_LINK_CONTEXT`), so administrators keep a
  recovery route — unless login is also being denied.
- Verify: 300 bogus tokens a day stop every new account from verifying.
- Does not establish: whether the shared deployment has an edge limiter in front (deployment parity),
  or how quickly requests can be sent there. No data is exposed or changed.

- **Repro (done, cloud stack 2026-10-24):** 1,001 `POST /api/users/login` with distinct random
  addresses and a wrong password, sent in ~5 s; the Site-Admin and Teacher logins that followed both
  returned 429 "Too many sign-in attempts — please wait 3333s". Counters cleared afterwards.
- **Correction (Codex review, 2026-10-24):** these are separate buckets. Exhausting the login budget blocks sign-in only; reset, signup and verification each need their own budget spent. The wording above is narrowed accordingly.
- **Expected vs actual:** SPEC §11 asks for rate limiting on auth so that abuse is bounded; the limit
  should not itself let one anonymous client lock out every user. Actual: it does.
- **Suggested fix (revised after Codex review):** add trusted-client throttling before expensive work, and redesign aggregate overload protection so one client cannot consume shared capacity. Keep the resource bounds. Do not exempt addresses that have a recent successful login: anyone can name them. An edge limiter alone is insufficient unless its settings prevent exhaustion. **Test:** disposable HTTP tests showing one abusive client cannot deny another client's valid login, buckets stay independent, and spoofed forwarding headers cannot mint fresh client identities.
- **Related:** F-C23-002 (same buckets, targeted form); OPS "Going public" item 2.
- **Disposition:** _(blank until triage)_

## F-C23-002 — A chosen account can be kept from signing in or resetting its password

- **Severity:** provisional Low. **Category:** authentication / availability.
  **Exposure:** live (same deployment caveat as F-C23-001).
- **Known status:** new. The design comment says the per-address cap *bounds* the lockout attack
  (`authRateLimit.ts:9–12`, `rateLimit.ts:142–147`); the source shows it adds a second lock.
- **Audit / review status:** candidate, author-verified/unreviewed; full security cycle required.
  Author: author-a (Claude), 2026-10-24.
- **Evidence scope / confidence:** locally reproduced (disposable cloud stack, 2026-10-24), high confidence.
- **Scenario:** an anonymous client sends 20 wrong-password logins naming the victim's address → the
  victim's own correct login gets 429 for the rest of the hour; 5 forgot-password requests block the
  victim's reset for the rest of the day.
- **Where:** `app/src/hooks/authRateLimit.ts:184–194`; Payload `auth/operations/login.js:156,179`.

### Source chain

1. The per-address login bucket (20/hour) is keyed only by the address, shared by the attacker and the
   real owner, and charged before Payload checks the password (`authRateLimit.ts:187–194`).
2. Independently, Payload locks the account for 10 minutes after 5 wrong passwords and refuses even the
   correct password while locked (`login.js:156` → `LockedAuth`).
3. So 5 requests lock the account for 10 minutes, and 20 requests block it until the hour window ends.
   Repeating costs 20 requests per victim per hour.
4. Forgot-password has the same shape at 5/day per address. Each of those requests also issues a new
   reset token, which invalidates a link the victim was just sent.

- **Interpretation / limits:** narrower than F-C23-001 but quieter (tiny volume) and aimed: a Site
  Administrator's address is the obvious target. Payload's `unlock` clears its lock but not these
  counters (DECISIONS 2026-09-12). Reproduced 2026-10-24 (see Repro below).
- **Repro (done, cloud stack 2026-10-24):** 20 wrong logins naming one fixture address; the owner's
  correct password then returned 429 ("wait 3339s"), even after Payload's 5-attempt lock was cleared.
- **Expected vs actual:** the cap should limit an attacker's guesses, not the owner's sign-in.
- **Suggested fix (revised after Codex review):** address together with F-C23-001. Do not simply exempt successful logins in this hook: it runs before password validation, and Payload refuses locked accounts separately before hashing. Reconsider the hard per-account lockout as well as the counters. **Test:** after failures from a separate client, check the owner's intended sign-in and reset behaviour, continued brute-force resistance, the reset-mail caps, and Payload's lockout together with the application counters.
- **Related:** F-C23-001.
- **Disposition:** _(blank until triage)_

## F-C23-003 — Login reveals whether an email address has an account

- **Severity:** provisional Low. **Category:** authentication / information disclosure.
  **Exposure:** live.
- **Known status:** new. It is the same class as the forgot-password oracles the project closed
  (status L3-R1, DECISIONS 2026-07-20; timing, 2026-07-21), on a different endpoint.
- **Audit / review status:** candidate, author-verified/unreviewed; full security cycle required.
  Author: author-a (Claude), 2026-10-24.
- **Evidence scope / confidence:** locally reproduced (disposable cloud stack, 2026-10-24); the
  timing gap was measured over HTTP there. High confidence.
- **Scenario:** one `POST /api/users/login` with any password: an unknown address answers without
  hashing; a registered address first runs a 600,000-iteration PBKDF2, so it answers measurably later.
- **Where:** Payload `auth/operations/login.js:151–185`, `auth/strategies/local/generatePasswordSaltHash.js:5–7`.

### Evidence

1. `login.js:151–156`: find the user; if none, `checkLoginPermission` throws `AuthenticationError`
   immediately. No password hash runs.
2. For a real account, `authenticateLocalStrategy` (`login.js:165`) runs PBKDF2-SHA256 at 600,000
   iterations (current hashes) or 25,000 × 512-byte key (legacy hashes).
3. Measured in this cloud container (Node 22.22.0, 4 vCPU; not the pinned Node 24, not the target
   hardware): 600,000 iterations / 32 bytes = **137 ms**; legacy parameters = 91 ms. The forgot-password
   gap the project treated as an oracle was 23–29 ms vs 60–140 ms.
4. Second channel: after 5 wrong passwords a real account returns Payload's "locked" message
   (`LockedAuth`, `login.js:27`), while an unknown address always returns the ordinary incorrect-login
   message. Both are 401; the message differs. This costs 6 requests and locks the victim for 10 min.

- **Interpretation / limits:** signup already tells a caller that an address "may already exist"
  (Q-C23-01 in the C23 report), at 3 attempts/address/day and 100/day overall, and creates an account
  as a side effect. Login raises the rate to the 1,000/hour global cap with no side effect. If the
  operator accepts signup's disclosure, this may be rated Info; that is a policy call.
- **Repro (done, cloud stack 2026-10-24):** wrong-password logins, ≤4 per account to avoid lockout:
  known median 362 ms (min 320), unknown median 16 ms (min 12, max 23), distributions disjoint. The
  lockout-message channel also observed after 5 attempts on a real account.
- **Expected vs actual:** project policy (L3-R1) is that unauthenticated endpoints should not tell
  whether an address is registered. Actual: login does, by time and by lockout message.
- **Suggested fix (revised after Codex review):** normalise the public failure status and body for unknown, wrong-password and locked accounts, and equalise the expensive work for all three under the same pre-hash load controls. A dummy hash for unknown accounts alone leaves the locked-account channel open. Keep the disabled-account and verification rules. **Test:** identical public failures across the three cases; deterministic checks that equivalent hash work runs; timing measured outside ordinary CI. Signup's disclosure stays a separate policy decision (Q-C23-01).
- **Related:** DECISIONS 2026-07-20/21 (forgot-password oracle fixes); Q-C23-01.
- **Disposition:** _(blank until triage)_
