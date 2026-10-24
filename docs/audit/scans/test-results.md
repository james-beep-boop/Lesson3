# Baseline outcomes — C00/C01

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Execution began 2026-10-24.
Commands below run on the isolated heavy-worker; exact private invocation/configuration and raw logs
are retained outside Git. Pending checks are not passes and no result is a cross-family finding verdict.

| Check | Command / method | Outcome |
|---|---|---|
| Pinned runtime | `scripts/in-deps.sh --network none -- node --version` | Passed: v24.22.1 |
| Resolved target isolation | Inspect resolved Compose JSON before launch | Passed configuration check; runtime/reset proof pending |
| ESLint | `npm run lint` | Passed, exit 0 |
| Prettier | `npm run format:check` | Passed, exit 0 |
| Types | `npx tsc --noEmit -p tsconfig.json` | Passed, exit 0 |
| Unit | `npm run test:unit -- --maxWorkers=2` | Passed: 192 files, 1,852 tests, no retries; exit 0 |
| Contract | `npx tsx scripts/contract-check.ts` | Passed, exit 0 |
| Production dependency advisories | `npm run audit:prod` | Exit 0 at configured high/critical gate; five moderate advisories remain |
| All dependency advisories | `npm run audit:all` | Exit 1: five moderate and one high advisory; C11 triage pending |
| Production build/migrations | Pinned Dockerfile builder/runner; isolated Compose migrate | Passed builds and migrations; empty first-administrator page verified over HTTP |
| Integration | `npm run test:int`, separate empty test database | Passed: 41 files, 333 tests; exit 0 |
| HTTP | `npm run test:http`, production mode against migrated disposable database | Passed: 21 files, 440 tests; two no-SMTP branches skipped with SMTP enabled; exit 0 |
| Browser, SMTP-enabled | `npm run test:e2e`, pinned Chromium runner, retries disabled | Exit 1: 141 passed, two offline-only expectations failed, one offline-signup test skipped |
| HTTP, no-SMTP complement | Existing endpoint specs filtered to `without SMTP`, matched temporary app and runner environment | Passed: both selected tests, exit 0; other tests intentionally deselected |
| Browser, no-SMTP complement | Existing Advanced tools, Manage user actions and offline-signup tests against matched temporary app | Passed: all three selected tests, no retries, exit 0 |
| Ingest extraction | `npx tsx scripts/ingest-extract-check.ts`, approved legacy fixture mount | Exit 1: 24 passed, one diagnostic-wording assertion failed; see qualifications |
| Adapter fidelity, default config | `npx tsx scripts/adapter-fidelity.ts`, JSON/DOCX from upstream library pin | Exit 1: 3/7 checks passed; four document comparisons differ at intended ARES Education attribution |
| Adapter fidelity, historical-config control | Same probe with explicit upstream attribution config at the oracle revision | Passed: 7/7, exit 0; this is a labelled compatibility control, not a default-config pass |
| RBAC CLI | `npx payload run scripts/verify-rbac.ts` | Seven passed, exit 0; last-administrator cleanup warning left one synthetic fixture for the C01 reset |
| C01 readiness | Target lock, reset/reseed/restore, synthetic logins and captured reset link | Passed with reconciled output-ownership harness issue; see C01-isolation.md |
| Audit helpers | Target lock success/failure/contention checks; new TS helper lint/types; runtime C01 proof | Passed; raw logs and exact helper hashes recorded with baseline provenance |
| D01–D03 | Cycle deferred acceptance register | Deferred, required hardware/material unavailable |

## Qualifications and leads

- **Advisories:** the high advisory is Zod GHSA-mrhx-c7xc-m3w5; `npm ls zod` places version 4.4.3
  beneath `eslint-config-next` → `eslint-plugin-react-hooks`/`zod-validation-error`. This is an
  observed dependency path, not a reachability/severity verdict for Lesson3. No audit fix was run.
- **Extraction CLI:** `ingest-extract-check.ts` expects `/missing SLO/i` and `/invalid phase/i`.
  The validator instead returned the current plain-language missing-outcome and phase-choice
  diagnostics (and the expected missing-resource diagnostic). Preserve the failed CLI result as a
  test-maintenance lead; the command did not show acceptance of the invalid lesson.
- **Oracle provenance:** Physics 4.1 JSON and DOCX were exported together from upstream library
  revision `f83db61931566df6bde9252db552bd353ed43d7a`. The default uses the baseline's newer
  attribution config; the operator confirmed **ARES Education** is intentional. Re-running with
  `ATTRIBUTION_YAML` pointing at the exported historical config passed all seven adapter/package
  checks. No product file or approved oracle was changed. Current-config golden acceptance remains
  a distinct C42 evidence task; do not describe the default CLI as green.

These observations remain baseline results/leads, separate from accepted defect or improvement totals.

The SMTP-enabled browser failures expected no Email action and the offline "Awaiting approval" state;
the configured app correctly exposed SMTP-dependent behavior. Both pass in the matched no-SMTP
configuration, alongside the previously skipped offline-signup test. Preserve the original exit 1:
the two complementary runs cover the 144 distinct browser cases, but they are not one green full-suite
run. Existing tests were not edited. WebKit and additional audit-specific attack cases remain pending.
