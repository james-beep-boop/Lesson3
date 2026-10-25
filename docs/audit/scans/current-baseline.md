# Current baseline check outcomes

Source: `bd5f07863a150cd51245b9c942502efa19d4014d`. Date: 2026-10-25.
Runtime: Linux ARM64, Node 24.22.1, Payload 3.92.0, Next.js 16.4.3, React 19.3.1,
Vitest 4.1.12. Commands run from app through the namespaced `scripts/in-deps.sh` wrapper unless noted.
Private raw logs and exact configuration are retained outside the checkout.

| Check | Command or method | Current outcome |
|---|---|---|
| Runtime | `node --version` | Passed: v24.22.1, exit 0 |
| Lint | `npm run lint` | Passed, exit 0 |
| Types | `npx tsc --noEmit -p tsconfig.json` | Passed, exit 0 |
| Formatting | `npm run format:check` | Passed, exit 0 |
| Unit | `npm run test:unit -- --maxWorkers=4` | Passed: 193 files, 1,867 tests, exit 0 |
| Production build | `docker build --target runner`, separate audit image, APP_RELEASE_VERSION=1.07 | Passed, exit 0 |
| Migration image | `docker build --target builder`, separate audit image | Passed, exit 0 |
| Production schema/start | New isolated Compose project with production migrations | Passed startup; `/login` HTTP 200 |
| Integration | `npm run test:int`, separate empty test database, NODE_ENV=test | Passed: 42 files, 339 tests, exit 0 |
| HTTP initial run | `npm run test:http`, new production app/database, SMTP catcher enabled | Exit 1: 477 passed, two failed, two skipped, 23 files; missing PDF test configuration |
| HTTP endpoints follow-up | `npm run test:http -- tests/http/endpoints.http.spec.ts`, test-only PDF service/mount added | Exit 1: 120 passed, two failed, two skipped; copied PDF was mode 0600 and unreadable by non-root app |
| HTTP PDF permission follow-up | Same file, `-t 'opens the test-stack PDF\|an inherited folder'`, synthetic fixture mode 0644 | Passed: both selected cases, exit 0; 122 deselected |
| All-dependency advisories | `npm audit --json` | Exit 1; five moderate dependency entries, zero high/critical |
| Production-dependency advisories | `npm audit --omit=dev --json` | Exit 1; same five moderate entries, zero high/critical |
| Restore mock/kernel locks | `bash scripts/test-restore-db.sh` | 95 assertions passed, zero failed, exit 0; no live database |
| Updater transactions | `bash scripts/test-online-update.sh` | Passed, exit 0; local stubs |
| Cache failure probe | `bash docs/audit/tools/repro-restore-cache.sh` | Candidate reproduced: exit 0 with retained file after deletion failure; writable control removes file |
| C01 target proof | Marked reset/reseed, synthetic restore, role logins and captured reset link | Passed, exit 0; see C01-current-target.md |
| Full-stack restore suite | Existing restore-stack assertions with namespaced external harness and current images | Passed: 104 checks, zero failed, exit 0; disposable target torn down; assertions/product scripts unchanged |
| Browser suites | Existing Chromium suite and required WebKit audit coverage | Not run yet |
| Contract/extraction/fidelity/RBAC CLIs | Handbook's documented CLI/fixture checks | Not run yet on current baseline |
| Deployment parity | Observed shared-site SHA, edge headers and delivery | Pending |

The five advisory entries trace to one underlying
[esbuild development-server CORS advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99):
`esbuild`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit` and
`@payloadcms/db-postgres`. npm reports no available fix for the installed dependency paths.
The upstream advisory concerns the esbuild serve feature; presence in production dependency
resolution does not prove that feature is served by Lesson3. Installed-source and image reachability
triage remains C11 work; these entries are scanner observations, not five confirmed product defects.

Baseline suites cannot establish every role/action cell, race, malicious input, browser state or
restoration invariant. Audit-specific checks and the file/component evidence register remain required.

HTTP qualifications: the complementary runs cover 479 distinct passing cases, with two no-SMTP
cases still skipped. They are not a single green full-suite run. Both original failures and the
intermediate permission failures were harness/configuration errors, not demonstrated product bugs.
Run the no-SMTP complement in a matched environment; do not erase the original failed outcomes.
