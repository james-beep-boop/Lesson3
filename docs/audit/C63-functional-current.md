# C63 functional bug hunt — current evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07 source). The current browser pass used
the full Chromium suite and a WebKit subset on the disposable target. It covered the guide journeys,
lesson details, messages, unavailable-version behavior, upload bundles, signup, editor navigation,
Manage, discussion/reference flows, and the existing recovery/export journeys.

The full Chromium run listed 145 tests (149 executions including retries): **142 passed, 1 skipped,
2 failed**. The two failures are test-environment expectation mismatches on the Mailpit target:

1. `advancedTools.e2e.spec.ts` expects no “Email all…” controls when SMTP is absent; the Mailpit
   target correctly exposes two controls.
2. `manage.e2e.spec.ts` expects `Awaiting approval`; with SMTP configured the app correctly shows
   `Teacher · Unverified` and `Mark verified`. The same flow passed 38/38 in the explicitly SMTP-
   disabled replacement app, and the dedicated offline-signup flow passed 1/1 there.

The WebKit subset passed **11/11** (lesson details 2, messages 3, unavailable-version 6). The
private WebKit browser was installed into an audit-only Docker volume; no tracked product image or
configuration changed. WebKit runner hash is
`e589a243b9a2174e82d786b7fccd779d87b6eb93332e052b86af79c2c3ed1709`; raw log hash is
`7d081aa1350af2ef4af574c6c2cb4ea887a7bd9bc88b60ab7d7eabf94b5aca10`. Chromium runner hash is
`2f532b9ef2f0460b0e2f1e50cba92af169425861f6b8cd865da5606e54d1be3b`; raw log hash is
`126c93ea1a7906f7546157e63dbde5c49d585f9f2a37174fec02c7776edfc889`.

The Chromium run recorded 13 expected 404 console messages on the one-version compare fixture;
there were no captured 5xx responses. Existing `versionUnavailable` tests cover the intentional
missing-version behavior. No product functional finding is accepted. Linkinator, full throttled
journeys, expiry-mid-edit, and public-library deployment parity remain qualified gaps.

**Exit:** Chromium and WebKit functional coverage was executed; the two Chromium failures were
reconciled as SMTP-fixture mismatches and the same branches passed under their intended posture.
