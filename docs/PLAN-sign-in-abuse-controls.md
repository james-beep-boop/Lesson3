# Sign-in abuse controls — F-C23-001/002/003

The operator authorized fixing all three sign-in findings; Cloudflare remains unchanged. Keep the
native Payload password verifier, cookie/session issuance, verification and disabled-account gates.

1. Capture the TCP peer before Next handles HTTP, using Node 24's HTTP diagnostics channel and a
   per-request random, server-owned header token. Honor forwarded addresses only when the immediate
   peer and subsequent hops are in an explicit trusted-proxy CIDR allowlist; default is no trust.
2. Replace the site-wide login window with client and client+requested-address PostgreSQL counters.
   Bound concurrent login work per process and per client; release in `finally`, never queue hashes.
   Disable Payload's account-wide lockout so another client cannot lock a victim account.
3. Equalize password work for unknown, current-hash and legacy-hash accounts. Dummy computations
   never verify credentials; Payload continues to do the actual comparison. Keep generic wrong-
   password/unknown failures and correct-password verification/disabled guidance.
4. Exercise spoofed forwarding/internal headers, two distinct clients, capacity release, both hash
   formats, legacy lock state, cookies, verification, recovery and administrator reauthentication.
5. Build and test on a disposable stack, publish a separate PR, and document proxy setup and the
   shared-NAT/overload limits. No merge or deployment is included.

Limits: clients sharing an IP share abuse budgets. Distributed attacks can still saturate a server;
the fix removes attacker-spendable site/account lockouts, not the need for edge traffic controls.

## Validation record — 2026-10-25

The production app and migrate images build on pinned Node 24.22.1. Formatting, ESLint,
TypeScript, generated Payload types and shell syntax checks pass. On the isolated synthetic stack:

- Unit suite: 1,885 passed, including first-request tracking, spoof resistance, per-client/process
  admission and admission shared across separate server module loads.
- Integration suite: 339 passed.
- Full HTTP suite: 487 passed, four SMTP-dependent cases skipped on the no-SMTP stack.
- Browser checks: five passed without retries, covering offline signup/approval, account recovery
  actions and System access.

After making admission state shared across server module loads, the production images were rebuilt;
59 authentication/settings HTTP checks and the five browser cases were repeated on that final build.

Existing and absent addresses share generic failures after repeated attempts; another client can
still authenticate after the attacker's target/aggregate budget is exhausted. Native cookie/token
issuance, legacy hash upgrade, legacy lock removal, verification/disabled gates and settings
reauthentication are covered over real HTTP. No live deployment or Cloudflare configuration changed.
