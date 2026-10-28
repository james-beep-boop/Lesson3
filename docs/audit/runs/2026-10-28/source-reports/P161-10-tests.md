# P161-10-tests — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

**Scope and method.** No tools were run and no source was checked. I read only the seven supplied ranges, which are test files. Not assessed: the implementations they exercise (`hooks/authRateLimit`, `lib/advancedTools`, `lib/appVersion`, `LinkedTextarea/aresAddress`, `LinkedTextarea/insertLink`, `lib/aresReleasePresentation`, `lib/formatDate`, `generator/artifactCache`), the hooks and schema behind the release-record fields, and all runtime behaviour. The tests were not run. Statements below describe what the tests assert, not verified product behaviour. Security and integrity claims remain unreviewed until independent review.

**Ranges read**
- `app/tests/unit/adminResetLinkAllowance.spec.ts:1-74`
- `app/tests/unit/advancedTools.spec.ts:1-26`
- `app/tests/unit/appVersion.spec.ts:1-15`
- `app/tests/unit/aresAddress.spec.ts:1-196`
- `app/tests/unit/aresReleasePresentation.spec.ts:1-101`
- `app/tests/unit/artifactCacheBestEffort.spec.ts:1-138`
- `app/tests/unit/artifactCacheCleanup.spec.ts:1-45`

**Asserted invariants**
- **adminResetLinkAllowance:** the allowance flag exists only during the callback and is removed after success or throw. Existing context identity is preserved.
- **advancedTools:** Standard mode unless the site switch is `true`. Exactly four actions are advanced; `insertLink` stays everyday.
- **appVersion:** labels for release tags, build hashes, development builds, and unavailable values.
- **aresAddress:** stored ARES addresses normalise to the `ares.local` base. Matching is exact on host, scheme and port. Tracker `target` values are kept. `?prev…` is dropped only from ARES addresses. Localhost on ARES ports maps to `ares.local`.
- **aresReleasePresentation:** release labels come from calendar date and fingerprint, with "not stated" when the date is missing. The Official-update notice comes from the change record. The combine suggestion needs a surviving, older ARES base.
- **artifactCacheBestEffort:** cache failures never throw to the caller. A miss is not logged as a failure. At most one warning is logged per operation kind (read or write).
- **artifactCacheCleanup:** the per-write temp file is removed when rename fails. Temp files older than one hour are removed on the next write.

**Candidates**

1. **Lead, uncertain, low to medium severity: the Official-update notice may appear for a human change whose actor was later deleted.**
   - Evidence: `aresReleasePresentation.spec.ts:55` expects a notice when `officialChangedBy: null`. Line 71 expects no notice when `officialChangedBy: 7`.
   - Policy: related deletions clear the nullable references, and the notice must never appear for a human change.
   - Precondition (unverified): a human Make Official by a user who is later deleted. The record would then have `officialChangedAt` set and `officialChangedBy` null, which is the same shape as a system import.
   - Expected: no notice for a human change. Actual per the test contract: a notice for any null actor.
   - Repro: `officialUpdateNotice({officialChangedAt:'2026-12-03T15:00:00Z', officialChangedFrom:2, officialChangedBy:null}, official, history)` returns non-null, and a deleted-actor human change produces the same input.
   - Needs checking: whether the stamping hook or schema stores anything else that separates the two cases. Those files were not supplied.

No other mismatch was confirmed. The asserted labels, date handling, localhost mapping and navigation stripping are consistent with the policy excerpts supplied.

**Unresolved questions**
1. `aresAddress.spec.ts:9-10` and `:185-186`: a demo-host `/kolibri/en/learn` address maps to `ares.local:8069/en/learn` with the path dropped. A localhost `/kolibri/en/learn` address maps to `ares.local/kolibri/en/learn` with the path kept. The policy excerpts do not say which is intended, so I did not report this as a defect.
2. `aresAddress.spec.ts:17`: any path on the demo host maps to `ares.local`. The policy is silent on non-Kolibri ARES paths.
3. `artifactCacheCleanup.spec.ts`: nothing checks that a recent temp file from a concurrent writer is kept. The one-hour threshold is not in the policy. A missing test alone is not a defect.
4. `advancedTools.spec.ts:7`: the only unreadable-settings case tested is `undefined`. Non-object settings are not covered by the tests, so the implementation would need checking.
