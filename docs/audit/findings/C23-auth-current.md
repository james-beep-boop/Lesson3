# Current authentication findings

Source: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 product source). Runtime: production
build, Linux ARM64 heavy-worker, Node 24.22.1, Payload 3.92.0, PostgreSQL 16.15, synthetic users,
captured SMTP. No deployed edge/proxy behavior is asserted. Default rate and lockout settings were used.

All three IDs are **previously known and deferred**, recorded in `docs/DECISIONS.md:197–216`
(2026-10-25 wrap-up triage) and the
[historical report at its immutable package revision](https://github.com/james-beep-boop/Lesson3/blob/3b5dc1a/docs/audit/findings/C23-auth.md).
They are not counted as newly discovered defects. Current-baseline reproductions and source
rechecks below support retaining them. The operator selected a sole auditor; no independent
cross-family review is claimed for this cycle.

## F-C23-001 — Anonymous login attempts exhaust every user's sign-in budget

- **Severity:** Medium. **Priority:** P1, address before relying on untrusted-network sign-in.
- **Category:** authentication availability. **Exposure:** current default stack, locally reproduced;
  shared deployment edge reachability/mitigations pending.
- **Known status:** previously known, deferred in the decision above.
- **Audit status:** accepted after sole-auditor source/control recheck, 2026-10-25.
- **Evidence scope / confidence:** locally reproduced; high confidence in the default-stack behavior.
- **Location:** `app/src/hooks/authRateLimit.ts:184–198`,
  `app/src/lib/rateLimit.ts:148–155`; native login invokes the before-operation hook before checking
  whether the requested account exists.

### Scenario and reproduction

On a restored disposable target, both teacher and Site Administrator sign in successfully (200).
Run `tests/audit/c23-auth-budgets.ts` through the pinned wrapper under the target lock, with approved
synthetic fixture/result paths and `LESSON3_AUDIT_AUTH_MODE=global`. It sends at most 1,005 wrong-password
requests, each naming a different nonexistent address, with concurrency four and a two-minute deadline.
It probes health throughout and attempts the two real logins afterwards.

Observed: **995 responses 401 and ten 429**, in **2,172 ms** for the bounded burst. Earlier controls
had spent five slots in this fixed window. Both subsequent correct-password logins returned 429,
with **3,335 seconds** remaining. The reproduction command exited 0 because it asserted the defect
and its controls; this is not a passing security regression assertion. The target was restored and
all eight verified fixture roles could sign in afterwards.

The hook charges a per-requested-address bucket, then `loginGlobal` keyed `all`. Fresh addresses
avoid the per-address ceiling while charging the shared default 1,000/hour budget. Requests after
its exhaustion reject a legitimate user's password before authentication. Expected abuse controls
bound the abuser's cost without handing them all users' ability to establish sessions.

### Impact, counterevidence and remedy

A reachable unauthenticated client can deny **new sign-ins** to every account until the window
resets, including administrators. It does not log out existing sessions: a previously issued teacher
token still returned a user from `/api/users/me` (200). The forgot-password control remained 200;
these are separate buckets. No data disclosure, modification or complete site outage was shown.
An edge limiter may reduce exposure; merely having one is insufficient unless its configured budgets
actually prevent shared-capacity exhaustion. Shared-site parity remains untested.

Apply trusted-client abuse controls before expensive work and redesign aggregate protection so one
client cannot consume legitimate users' entire authentication capacity. Preserve bounded password
hash work and proxy identity integrity. Regression: one abusive client cannot stop a different
client's valid login, including spoofed forwarding-header cases and independent bucket controls.

- **Disposition:** previously deferred design work; no product change in this audit.

## F-C23-002 — Naming a victim spends their legitimate sign-in budget

- **Severity:** Low. **Priority:** P2.
- **Category:** targeted authentication availability. **Exposure:** current default stack; victim
  address and network access to login are required, credentials are not.
- **Known status:** previously known/deferred. **Audit status:** accepted after sole-auditor recheck.
- **Evidence scope / confidence:** locally reproduced, high confidence.
- **Location:** same hook, per-address `login` bucket, default **20 attempts/hour** at
  `app/src/lib/rateLimit.ts:148–151`; native lockout is an additional, distinct mechanism.

Restore the synthetic target and run the same probe with `LESSON3_AUDIT_AUTH_MODE=target`.
Controls sign in teacher and administrator and make one known-address wrong-password request.
Twenty further wrong-password requests naming the teacher returned **18 × 401 and two × 429**,
in **397 ms**. The teacher's subsequent correct password returned 429 with **3,347 seconds**
remaining; the administrator still signed in (200). The teacher's existing token still worked.
Command exit 0 denotes successful reproduction; post-test restore/login proof passed.

The attack spends a bucket identified by the victim's address, not the requesting client. Native
five-attempt/ten-minute lockout already creates a related denial tradeoff; the application budget
can continue refusing correct credentials for the remainder of its hour. This finding concerns
one account, with an address precondition and existing-session/administrator countercontrols;
it is not the whole-site effect of F-C23-001. Retain brute-force protection while preventing an
anonymous caller from monopolizing another user's legitimate attempts. Test targeted and global
controls separately and preserve authenticated recovery mechanisms.

- **Disposition:** previously deferred design work; no product change.

## F-C23-003 — Login timing and a locked-account message reveal registration

- **Severity:** Low. **Priority:** P2.
- **Category:** account enumeration. **Exposure:** unauthenticated login, locally reproduced;
  network jitter and deployment parity limit timing extrapolation.
- **Known status:** previously known/deferred. **Audit status:** accepted after sole-auditor recheck.
- **Evidence scope / confidence:** locally reproduced timing and deterministic message channel;
  high confidence in the local distinction, no claimed remote detection rate.
- **Location:** installed `payload@3.92.0/dist/auth/operations/login.js:22–28,151–168` and
  `auth/strategies/local/authenticate.js`; `generatePasswordSaltHash.js` sets current PBKDF2
  parameters to 600,000 SHA-256 iterations, 32-byte output.

`tests/audit/c23-enumeration.ts` makes three wrong-password attempts per each of three verified
roles, paired with nine absent addresses; pair order alternates and requests are sequential.
All these failures have the same 401 status and generic message, including the separate initial
unverified/wrong-password control. There is no demonstrated unverified-message oracle here.

| Local timing sample | n | Minimum | Median | Maximum |
|---|---|---|---|---|
| Registered, unlocked | 9 | 65.74 ms | 70.57 ms | 278.28 ms |
| Absent | 9 | 6.93 ms | 10.95 ms | 12.76 ms |

The installed login source rejects an absent user before authentication hashing, but invokes PBKDF2
for an unlocked registered user. This independently supports the timing interpretation. Nine pairs
are a bounded demonstration, not a statistical claim about all hardware, load or remote networks.

The same script continues the teacher to attempts four through six. Attempt six returned 401 with
“This user is locked due to having too many failed login attempts.” An absent-address control
returned the ordinary incorrect-credentials message, also 401. Sanitized resolved configuration
confirmed **five attempts, 600,000 ms lock time**. This message distinction is a deterministic second
channel and does not require timing precision. Full probe/recovery wrapper exit 0; original role
readiness was restored afterwards.

Impact is account-presence inference, not a recovered email address, password or session. Signup's
separate disclosure policy and rate bounds remain relevant counterevidence; the prior decision
explicitly deferred this login issue. Normalize public unknown/wrong/locked failures and equivalent
expensive work under safe abuse controls, including the already-locked path. Preserve intended
correct-credential verification guidance. Tests should pin public failures and hash-work equivalence;
timing measurements belong outside ordinary flaky CI thresholds.

- **Disposition:** previously deferred design work; no product change.
