# Sign-in protection

The fixes for F-C23-001/002/003 replace attacker-spendable site/account login budgets with
client-scoped limits. They preserve Payload's password verification, sessions, email verification,
and disabled-account checks. No database migration is needed; the old lock columns remain for
restore compatibility, and login clears pre-upgrade lock state.

## Before deploying behind a proxy

Set `AUTH_TRUSTED_PROXY_CIDRS` in the application's environment to the exact addresses or narrow
CIDRs of the reverse proxies that connect to Node. Restart/recreate the app after changing it.
The value is a comma-separated list, for example `127.0.0.1/32,::1/128` **only if the app actually
sees those peers**. Docker forwarding can present a bridge address instead; verify the actual TCP
peer on your deployment. The release bundle reads application settings from its `.env` too.

Each trusted proxy must overwrite `X-Forwarded-For` or append the address of its actual caller.
The app walks the chain from the socket towards the caller and stops at the first untrusted hop.
Trust every legitimate proxy hop, including a tunnel connector when applicable. Block direct public
access that would bypass those proxies. Never use `0.0.0.0/0` or `::/0`: that would let a caller choose
its own limit key. Do not trust a broad network containing untrusted clients.

The default is empty: forwarding headers are ignored and the socket peer is the client. That is
appropriate for direct local-network connections. Behind a proxy, leaving it empty groups all of
that proxy's users into one budget. `CF-Connecting-IP` alone is not trusted. This setting is separate
from Cloudflare WAF configuration; this change installs no Cloudflare rule and changes no live server.

Use the supplied Docker command or `npm run start`/`npm run dev`. They preload
`scripts/login-client.mjs` before Node handles HTTP, overwriting any caller-supplied internal request
token. A custom Node launcher must also load it with `--import ./scripts/login-client.mjs`.
Missing request tracking fails sign-in closed with 503 rather than trusting a header.

## Budgets and remaining limits

| Setting | Default | Scope |
| --- | --- | --- |
| `RATE_LIMIT_LOGIN_MAX` / `RATE_LIMIT_LOGIN_WINDOW_MS` | 20 / 3,600,000 | Client + requested email |
| `RATE_LIMIT_LOGIN_CLIENT_MAX` / `RATE_LIMIT_LOGIN_CLIENT_WINDOW_MS` | 60 / 60,000 | Client across all requested emails |
| `LOGIN_MAX_CONCURRENT` | 4 | In-flight login operations per Node process |

One client may have one login operation in flight. Further simultaneous requests receive 429;
process-wide saturation receives 503. No password-work queue accumulates. Client and client+email
counters are shared through PostgreSQL; concurrency limits are per process. Reauthentication for
system settings uses the same client identity, budgets and capacity limits.

`RATE_LIMIT_LOGIN_GLOBAL_MAX` and `RATE_LIMIT_LOGIN_GLOBAL_WINDOW_MS` are obsolete and ignored;
remove them from operator configuration. Old counter rows are harmless and expire through pruning.
Counter keys hash the client address and requested email; these hashes are not a secrecy guarantee.

Users behind the same NAT share limits, and an abusive user on the same school IP can still affect
others there. Distributed attacks can still consume the bounded capacity; edge controls remain useful.
There is deliberately no account-wide lockout that an anonymous caller on another client can trigger.
Correct-password logins consume budget too. Existing authenticated sessions continue working.

Every well-formed wrong-password login performs both supported Payload password workloads: current
PBKDF2-SHA256 (600,000 iterations, 32 bytes) and legacy PBKDF2-SHA256 (25,000 iterations, 512 bytes).
Known users do one dummy derivation plus native verification; unknown users do both dummy derivations.
This costs more CPU per request and closes the large missing-hash timing gap; it is not a claim of
constant-time HTTP or complete resistance to statistical enumeration. Wrong-password/unknown-user
responses remain generic, including after five failures. Correct passwords retain verification and
disabled-account guidance. Tests pin the dummy parameters to installed Payload source for upgrades.

Signup and public forgot-password mail budgets are unchanged. Their separate site/recipient ceilings
can still be exhausted; administrator hand-delivered reset links and operator recovery retain their
own allowances. Signup's registration disclosure is also unchanged.

## Verification

Use a disposable database and `docker-compose.test.yml` for the real-network suite. That override
trusts Docker test runners as synthetic proxies on `app`; `pdf-private` trusts none. Never use the
test override in production. `loginProtection.http.spec.ts` checks client isolation, spoof resistance,
legacy locks/hashes, generic failures, cookies and account gates. Unit tests cover real first-request
tracking, trusted-hop parsing, capacity release, and hash-work parameters. Existing recovery and
settings suites cover authenticated recovery and password confirmation.
