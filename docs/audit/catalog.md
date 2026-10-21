# Lesson3 audit chunk catalog

[Operating handbook](audit_plan.md)

## Prior-work references

Read relevant portions rather than all history each session:
`SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DECISIONS.md`, `USER_GUIDE.md`, `README.md`, `docs/OPS.md`;
`docs/CODE-REVIEW-PLAN.md`; dependency reviews; `docs/drift.md`; `docs/ARES-canonical-json-audit.md`;
and the design documents cited by the assigned chunk.
Reuse verified known issues/decisions, but do not suppress new contradictory evidence.

## Catalog use

This is the full required catalog, not a declaration that setup or any audit is complete.
Read only the assigned chunk/unit and its immediate prerequisites with the operating handbook.
Light/Strong indicate investigation depth, not provider, account or a promised model allowance;
Hand means deterministic tooling. S/M/L are relative chunk sizes, not timing guarantees.
Source paths in the Phase 5 table are relative to `app/` unless already prefixed `app/`.
Exclude generated output/build caches from manual line review; inspect provenance, inputs and
trust boundaries. Manifest exclusions need reasons, not an assumption that generated code is safe.
C00–C01 establish an approved isolated target; eligible runtime chunks follow those gates.
Shared deployment confirmation is a separate environment label, not a substitute for local tests.
Use private role-to-host configuration; never substitute literal infrastructure details into public notes.

### Phase 0 — Setup and baseline

#### C00 — Environment, parity, baseline · Light · M
1. Read the handbook, applicable source rules, recent decisions and prior audits. Record known issues
   and accepted tradeoffs in `known.md`; supersede the old review plan by reference, not by editing it.
2. Preserve work and prepare isolated source clones at one selected base SHA. Record clean/dirty state,
   tool/runtime/dependency/fixture versions. Use the pinned Node 24 workflow, not an arbitrary host npm.
3. Initialize fixed assignments/progress (table below), complete tracked-file coverage manifest and
   component-map scaffold. Remeasure LOC, largest files and split large units (target about 1,500 LOC
   per part); record generated/vendor/config exclusions with their required checks.
4. Run baseline lint, typecheck, format check, unit/integration/HTTP tests, dependency audits and build
   in their appropriate isolated environments. Run contract-check, ingest-extract-check, adapter-fidelity
   and verify-rbac with documented arguments/fixtures. Record pass/fail/not-run and reasons in
   `scans/baseline.md` / `scans/test-results.md`. Distinguish setup/environment failures from defects.
5. Select the approved disposable test target and establish readiness for C01; do not require access
   to a shared deployment just to begin local runtime testing. Keep exact access/host/account metadata
   in private ops notes and shared-host resource limits separate from audit findings.
6. At the deployment-confirmation pass, record the observed deployed SHA and compare to the audit
   base, using private connection details. Until then, parity is pending; source evidence is not
   deployed evidence. Publish only necessary non-sensitive software revision evidence.
7. Inventory all required synthetic roles/capabilities, two subject-grade scopes, mixed assignments,
   second peer users and an unverified user. Provision missing fixtures on the disposable stack in
   C01 rather than treating operator-created shared-site users as a global prerequisite.

**Exit:** source baseline, manifest/components/known/test outcomes and approved target readiness
recorded. Pending environment tasks have exact next actions; eligible independent work can proceed.

#### C01 — Reseed drill and mail capture · Light · S · [exclusive]
1. Establish an isolated full stack from the repository workflow: database, migration/app and PDF
   service, plus local mail capture if selected. Use a dedicated run-specific Compose project and
   validated overrides/config outside tracked product files. Inspect resolved ports, host binds,
   volumes, networks, image tags and resource ceilings before launch.
2. Seed synthetic roles, users and assignments needed by C20–C24, including unverified and peer accounts.
   Secrets and captured reset links remain private. No external recipient receives test email.
3. Write `docs/audit/tools/reset-test.sh` for the approved target. Prove reset/restore and fixture login
   end-to-end; record duration and data boundary. Do not reset a generic default Compose project.
4. Implement target-local atomic lock acquisition/release from the handbook: create a lock directory,
   record run/owner, refuse an existing lock and release only the current run's lock. Coordinator
   excludes all other live work before reset/load. Reconcile stale ownership and process state manually.
5. Verify mail capture and the harness helper for reset links; keep raw messages/tokens private.
   Record host/container/DB connection and log-access details only in private ops, not `scans/host.md`.
   Sanitized public evidence records only capability/result and the tested revision.
6. Enable eligible RBAC/auth/immutability/upload tests as soon as these gates pass. Record an explicit
   blocker/next action if setup fails; local dynamic testing is not abandoned or indefinitely deferred.

**Exit:** isolated stack, accounts/mail capture, target identity, resource caps, reset/restore and
serialization verified. This cleanup is a plan update, not a stack startup or test authorization.

---

### Phase 1 — Automated static scans

#### C10 — Run all scans · Hand · S
Write and run `docs/audit/tools/run-scans.sh`. Private raw outputs go outside the checkout
(the handbook); only sanitized scan artifacts and condensed summaries go into `scans/`. Tools live outside
the repo (the handbook). Every scan hit is retained for triage even when the model reads only a short summary.

| Scan | Command sketch | Summary keeps |
|---|---|---|
| Outdated deps | `npm outdated --json`; `npm view <pkg> time` for majors | package, current, wanted, latest, age of latest |
| Advisories | `npm audit --json` (all and `--omit=dev`) | advisory, severity, path, fix available |
| Override audit | for each `overrides` entry: `npm ls <pkg> --all` | which overrides still change resolution |
| Unused code/deps | `knip --reporter json` | unused files, exports, deps, devDeps |
| Duplication | `jscpd app/src --min-tokens 50 --reporters json` (handbook exclusions) | top 30 clone clusters by size |
| Strict lint (report-only) | `eslint -c docs/audit/tools/eslint.audit.mjs app/src` with typescript-eslint strict-type-checked + sonarjs | counts by rule, top files |
| TS strictness probe | `tsc --noEmit --noUnusedLocals --noUnusedParameters` | counts, top files |
| Suppressions | `rg -n "@ts-ignore\|@ts-expect-error\|eslint-disable\|as any\|: any\b\|TODO\|FIXME\|HACK"` | counts by kind and file |
| Complexity | sonarjs cognitive complexity + largest functions | top 30 functions |
| CSS lint | `stylelint` (standard + scss configs) on `styles.css`, `custom.scss`, `app-tokens.scss` | counts by rule |
| CSS inventory | script: hard-coded colors/px vs tokens, `!important`, z-index values, duplicate selectors, media queries | tables |
| Secrets | `gitleaks detect --source . --log-opts="--all"` (full history — repo is public) | hits (redacted) |
| Shell | `shellcheck` on `deploy/**/*.sh`, `scripts/**/*.sh`, `app/scripts/**/*.sh` | issues by file |
| Dockerfile | `hadolint app/Dockerfile` | issues |
| Actions | list `uses:` in `.github/workflows/*.yml`; flag tag-pinned (not SHA-pinned) actions | table |
| Coverage | `npm run test:unit -- --coverage` and `test:int -- --coverage` | per-directory %, zero-coverage files |

**Exit:** every scan has a summary file; failures to run are noted, not fixed.

#### C11 — Triage: dependencies · Strong · S
Using `scans/` summaries and the latest `DEPENDENCY-REVIEW`: for each outdated or advised package,
decide whether it matters (reachable at runtime? prod or dev? known exploit path in this app?). Check
Payload and Next.js changelogs between pinned and latest for security fixes. Check that each
`overrides` entry is still needed. Check base images (`node:24.22.0-alpine`, `node:24.22.0-bookworm`),
Gotenberg `8.38.0`, Postgres `16.15`, and GitHub Actions versions. Check `docx` against ARES's
generator version. Apply release-age caution to routine updates; a necessary verified security fix is not blocked by an arbitrary waiting period. Note the one caret range in
devDependencies (`@testing-library/dom`). Findings: `findings/C11-dependencies.md`.

#### C12 — Triage: dead code and duplication · Light→Strong · M
Confirm knip hits by grep (Payload/Next resolve many things by convention — config-referenced
components, route files, hooks — so knip false positives are expected; verify before reporting). For
each jscpd cluster, decide whether it is real duplication worth consolidating or justified repetition.
Findings: `findings/C12-dead-code-duplication.md`.

#### C13 — Triage: lint, types, suppressions, complexity · Strong · M
Read the strict-lint and complexity summaries; open only the flagged regions. Each suppression
(`@ts-ignore`, `eslint-disable`, `as any`) is checked for whether it hides a real bug. Complexity
hotspots are queued for Phase 5 with a note. Findings: `findings/C13-static-quality.md`.

#### C14 — Triage: CSS static · Light · S
Two styling systems exist: the frontend (`app/src/app/(frontend)/styles.css`, ~2.2k lines plain CSS)
and the Payload admin (`app/src/app/(payload)/custom.scss`, ~2.9k lines SCSS) with
`app/src/app/app-tokens.scss`. Compare token sets: is the frontend consuming the same tokens, or
re-declaring values? List hard-coded colors/spacing that duplicate tokens, duplicate selectors,
`!important` usage, z-index sprawl, inconsistent breakpoints, unused selectors (cross-check class
names with `rg` in `.tsx`). Compare against `docs/DESIGN-visual-system-2026-07-31.md` and
`docs/DESIGN-button-system-2026-07-30.md`. Findings: `findings/C14-css-static.md`.

#### C15 — Triage: secrets, shell, Docker, CI · Light · S
Triage gitleaks (any real secret in history is **Critical** — the repo is public), shellcheck,
hadolint, Actions pinning, `app/test.env` contents, `.env.example` defaults.
Findings: `findings/C15-config-secrets.md`.

---

### Phase 2 — Live RBAC and auth (highest value)

#### C20 — Audit harness and surface inventory · Light · M
1. Build `app/tests/audit/` with `playwright.audit.config.ts` (base URL from `.env.audit`; Chromium +
   WebKit projects), a role login helper with cached storage state per account, and an API client for
   Payload REST (`/api/<collection>`), GraphQL (`/api/graphql`), and custom endpoints.
2. **Surface inventory** → `scans/surface.md`: every frontend route (`app/src/app/(frontend)/**`),
   admin route, collection and its REST/GraphQL operations (`app/src/collections/*.ts`, including
   versions endpoints), every custom endpoint (`app/src/endpoints/*.ts` — method, path, auth check),
   jobs that can be triggered by users, and globals. Supplement by crawling the site as each role and
   recording every distinct URL and XHR.

**Exit:** harness logs in as every account; surface inventory complete.

#### C21 — Expected permission matrix · Strong · M
From `SPEC.md` §8, `docs/DESIGN-who-manages-what-2026-08-29.md`,
`docs/DESIGN-user-model-language-2026-07-29.md`, build `scans/rbac-expected.md`. Independently map
access code/collection/field guards as implemented behavior; code cannot define away an intended-policy
mismatch. Expected matrix: rows = action (collection × operation,
field reads/writes, custom endpoint, admin page); columns = anonymous, unverified, teacher, teacher with editing access
(own SG), teacher with editing access (other SG), subject admin (own SG), subject admin (other SG), multirole, site admin.
Where SPEC and code disagree, record both and verify the consequence before classifying the
finding. Ambiguous policy remains a recorded question; implemented behavior is not automatically expected.

#### C22 — Actual permission matrix (attack run) · Strong · L
Encode the matrix as data-driven specs (`rbac.audit.spec.ts`) so every cell is executed, then diff
actual vs expected. Split into parts by collection group if needed. Cover at minimum:
- REST **and** GraphQL for every collection operation, including `versions` endpoints and
  `?draft=true`, `depth=` population leaking related documents, `select`/`where` on hidden fields
  (e.g. `where[email][like]=` as a teacher to probe whether hidden fields act as an oracle).
- GraphQL introspection availability to anonymous users; query depth/complexity limits.
- **Mass assignment:** signup and self-update bodies carrying `roles`, `_verified`, `assignments`,
  provenance fields; subject admin granting `siteAdmin` or assignments outside their subject-grade.
- Subject-admin **transfer of administration** (irreversible per code comments): can it be done to a
  subject-grade you don't administer, to yourself, repeatedly, or by a teacher with editing access?
- Last-site-admin protection; site admin self-demotion; deleting a user who owns versions.
- Field-level reads: `email` readable only by owner and site admins — check list endpoints, GraphQL,
  populated relations (e.g. author on versions, discussion replies), and admin UI. Respect the
  deliberate Roles & Access projection carve-out for Subject Administrators in SPEC §8.
- Admin-panel access for teachers (should be denied) via direct URL, not just navigation.
- Every custom endpoint × every role, including unauthenticated, with tampered IDs.

Findings: `findings/C22-rbac.md`. Any confirmed escalation is **Critical** — write it immediately.

#### C23 — Authentication flows · Strong · M
- **Lockout/rate limiting:** no `maxLoginAttempts` was seen in `app/src/collections/Users.ts` during
  planning — verify whether brute-force protection exists anywhere (app, middleware, Cloudflare).
  Test with ~50 rapid wrong attempts against a throwaway account.
- **Enumeration:** compare responses and timing for existing vs non-existing emails on login,
  forgot-password, and signup.
- **Password reset:** token single use, expiry, reuse after password change, token in URL leaking via
  `Referer`, reset for unverified accounts, link host correctness (`SERVER_URL`/`ADMIN_URL`, see the
  2026-07-18 incident in `docs/OPS.md`).
- **Sessions:** cookie flags (HttpOnly, Secure, SameSite), invalidation on logout and password change
  (old cookie/JWT still valid?), the 2-hour inactivity window, concurrent sessions.
- **CSRF:** cross-origin state-changing requests from a foreign origin page; confirm the `SERVER_URL`
  allowlist works behind Cloudflare.
- **Email verification bypass:** can `unverified@` log in, create content, or reach the API?
- **First-user bootstrap:** confirm `/login` never offers "Create the first Site administrator" on a
  non-empty DB, including via direct API calls to the first-user endpoint.
- **Signup:** behavior when registration is disabled; disposable/malformed emails; header injection
  in name/email fields (see `app/src/lib/emailAddress.ts`).

Findings: `findings/C23-auth.md`.

#### C24 — Discussions, messages, favorites, recovery · Strong · M
IDOR on discussion topics/replies/participation, messages (read or mark-read others'), favorites,
edit-recovery rows; moderation endpoints (`moderate.ts`, `discussionThreadDelete.ts`) by
non-moderators; access to deleted or hidden threads; **stored XSS** payloads in every user-text field
(titles, bodies, names) rendered in frontend, admin, emails and exports; notification/message flooding
and missing rate limits; `discussionNavState` leaking other users' state. Findings:
`findings/C24-social-features.md`.

---

### Phase 3 — Versioning and immutability (core promise)

#### C30 — Write-path analysis · Strong · M
Read `app/src/access/versionImmutability.ts`, `versioning.ts`, `bundle.ts`,
`app/src/collections/LessonBundleVersions.ts`, `LessonPlans.ts`, `EditRecovery.ts`, and related
hooks. Enumerate **every** path that can create, modify, or delete a version: REST, GraphQL, Local API
calls inside endpoints and jobs (which bypass access control unless `overrideAccess: false`), admin
bulk actions, recovery/restore, request-editing locks, migrations, scripts. For each, state the guard.
Any Local API call that writes versions without an explicit guard is a finding.
Findings: `findings/C30-version-write-paths.md`.

#### C31 — Immutability attack run · Strong · M · [exclusive]
1. Snapshot checksums of all version rows via read-only `psql` (hash of each row's content columns).
2. Attempt to update/delete historical versions through every C30 path as every role.
3. **Races:** fire concurrent saves from two teachers with editing access (and the same teacher in two sessions) with
   `Promise.all`; look for duplicate version numbers, lost updates, non-monotonic version numbering,
   or orphaned rows. Test request-editing lock stealing and stale locks.
4. Recovery and restore paths: can restoring create a version attributed to the wrong user or with
   altered history?
5. Re-run checksums; any change to a historical row is **Critical**. Check DB constraints (unique
   indexes on version number per lesson) exist.

Findings: `findings/C31-immutability-attacks.md`. Reset afterward.

---

### Phase 4 — Ingest, upload, export

#### C40 — Ingest code review · Strong · M
Review `app/src/ingest/**` (including `extract.ts`, which uses **acorn** to parse ARES JavaScript data
files — confirm it only walks the AST and never evaluates code), the contract schema gate, and
`previewParse.ts`, `recoveryParse.ts`, `parseFormat.ts`. Check size/time limits, use of mammoth,
jszip, jsdom (is jsdom run with scripts disabled and no resource loading?), DOMPurify configuration,
error handling for malformed input, and all-or-nothing semantics. Findings: `findings/C40-ingest-code.md`.

#### C41 — Malicious upload corpus · Strong · M · [exclusive]
Generate the corpus outside the checkout with a script; record sanitized fixture recipes/hashes.
Upload each as the relevant roles while watching resource usage and private target logs:
- DOCX zip bomb; very deeply nested XML; XML external entity and billion-laughs payloads inside DOCX
  parts; zip entries with path traversal names (`../../`); huge embedded images; truncated/corrupt zip.
- Wrong extension vs content, polyglot files, empty files, 0-byte parts.
- JS data files containing executable code, prototype-pollution keys (`__proto__`, `constructor`),
  enormous literals, deeply nested arrays.
- Script/HTML injection in every text field that later renders in preview, editor, export, email.
- **Local body limits and approved deployment proxy confirmation:** oversized bodies with correct `Content-Length`, missing
  `Content-Length`, and chunked transfer encoding — `docs/OPS.md` says a proxy-layer ceiling is
  mandatory; verify the deployed proxy ceiling separately from the local application limit.

Findings: `findings/C41-upload-abuse.md`.

#### C42 — Export fidelity and robustness · Light→Strong · M · [exclusive for the load part]
1. Export each sample lesson to DOCX and PDF; compare with operator-supplied golden files: DOCX via
   XML diff of `word/document.xml` and styles; PDF via page count, extracted text diff, and rendered
   page image diff.
2. Edge content: Swahili and other diacritics, emoji, very long tables, empty sections, maximum-length
   fields.
3. `exportAuth.ts`: can a teacher export unpublished or out-of-scope versions? Are download URLs
   guessable or reusable by others? Cache-key collisions between versions?
4. `emailVersion.ts`: can a user email artifacts to arbitrary addresses (spam relay), how is it rate
   limited, and is header injection possible? (Only send to `@lesson3.local` or the mail catcher.)
5. Fire 20–50 concurrent exports; observe Gotenberg and the artifact cache.

Findings: `findings/C42-export.md`.

---

### Phase 5 — Unit-by-unit code review (from CODE-REVIEW-PLAN, re-sized)

The unit sequence and focus notes come from `docs/CODE-REVIEW-PLAN.md`, ordered risk-first. Sizes are
re-measured (2026-10-13): `lib/` has grown from ~1.2k to ~6.5k LOC, `components/` from ~2.8k to
~11.5k, and `endpoints/` from ~1.7k to ~4k with new discussion, recovery and admin endpoints — so
those units are split and a new social/recovery unit is added. C00's manifest fixes the exact split
points. Every unit reads its own tests and scripts alongside the source (read tests with source, as required by the handbook).

**Coordination with the live phases.** C5.1 and C21 read the same files: if one executor does both,
do C5.1 first and reuse its notes. Likewise C5.2↔C40 and C5.4↔C42. Where a live chunk already
covered a file deeply, the unit records `covered by C<nn>` for it in Coverage instead of re-reading.

| Unit | Scope (source + its tests/scripts) | ~LOC | Exec | Focus |
|---|---|---|---|---|
| **C5.1 Authorization core** | `src/access/*`; `scripts/verify-rbac.ts`; access int tests | ~440 | Strong | The whole RBAC model: per-subject-grade scoping, field-level perms, version immutability. Highest stakes. Pair with C5.12 if budget allows. |
| **C5.2 Ingest & upload boundary** | `src/ingest/*`; `endpoints/uploadBundles.ts`, `parseFormat.ts`, `previewParse.ts`; `scripts/ingest-extract-check.ts`, `contract-check.ts`, `contract-drift.ts`, `corpus-resource-check.ts`; ingest tests | ~1,700+ | Strong | **Never `require()`/execute an uploaded `.js`** — confirm `extract.ts`'s acorn path only walks the AST. Extraction `.js`→JSON, contract gate, upload authz. Prime attack surface. |
| **C5.3 Auth, account & admin endpoints** | `endpoints/`: `forgotPassword`, `verifyEmail`, `requestEditing`, `userAssignments`, `userAdminActions`, `userSearch`, `markMessagesRead`, `respond`; their http tests | ~1,200 | Strong | Unauthenticated and account-lifecycle surface. Enumeration and timing oracles (two were fixed previously — confirm there's no third, and that `userSearch` isn't a new one), rate limits, endpoint-shadowing trust, assignment/transfer logic. |
| **C5.4 Export & data endpoints** | `endpoints/`: `exportVersion`, `exportAuth`, `emailVersion`, `versionEdit`, `previewVersion`, `previewShared`, `resourceLibrary`; their http tests | ~1,300 | Strong | The **authorize-with-caller-access-then-write-with-`overrideAccess: true`** pattern: confirm the gate always runs first. Export authz and rate limits. Each endpoint has 401/403/404 tests that actually gate (`CLAUDE.md` rule). |
| **C5.5 Social, recovery & settings endpoints** *(new)* | `endpoints/`: `discussionActions`, `discussionNavState`, `discussionThreadDelete`, `moderate`, `recovery`, `recoveryParse`, `systemSettingsSave`; their tests | ~1,200 | Strong | Newest code, least battle-tested. Same overrideAccess pattern; moderation authority; recovery restoring data across users; settings writes limited to site admins. |
| **C5.6 Collections + hooks** *(split a: collections ~1.9k / b: hooks ~2.4k, further split at C00)* | `src/collections/*`, `src/hooks/*`; their int tests | ~4,300 | Strong | Data model and lifecycle: sender-stamping, Official-pointer moves, field split, versioning hooks, auth rate limit, assignment provenance stamping. |
| **C5.7 Jobs & queue** | `src/jobs/*`, `src/lib/enqueue.ts`; job tests | ~610 | Strong | The **L3-03 transaction/orphan class**: confirm invariants hold and that the tests pinning them would fail against unfixed code. Retry semantics (`passwordResetEmail` retries vs `emailVersionArtifact` none). |
| **C5.8 Generator & fidelity** | `src/generator/*` (**excluding `vendor/`**); `scripts/adapter-fidelity.ts`, `roundtrip-regression.ts`, `fidelity-spike.ts`, `verify-stage2-export.ts`; fidelity tests | ~1,650 | Strong | **Byte-fidelity is the product.** Adapter grammar subset, artifact/HTML cache scoping and invalidation, DOCX→PDF conversion. |
| **C5.9 lib/ utilities** *(split a/b/c at C00)* | `src/lib/*`; their unit tests | ~6,550 | Light→Strong | Shared primitives — a bug here is systemic. `sanitizeHtml` allowlist, session/expiry, rate-limiter correctness, canonical-JSON stability, `emailAddress` validation, `systemFacts`. |
| **C5.10 Frontend — server & wiring** | `src/app/(frontend)` server components, `(payload)` wiring, `src/proxy.ts`, `src/instrumentation.ts`, `src/errors/*`; page/SSR tests | ~1,600+ | Strong | Server-side reads under caller access, request wiring, telemetry init, SSR data flow, what the error pages leak. |
| **C5.11 Frontend — components & client** *(split ~6 parts at C00: admin, upload, editor, session, export/preview, discussions/misc)* | `src/components/*`; client-component tests | ~11,500 | Light→Strong | Client-side auth flows, form/CSRF posture, preview/PDF client paths, unsafe HTML rendering (`dangerouslySetInnerHTML`), duplicated components (feeds C12/C14). |
| **C5.12 Fields & editor grammar** | `src/fields/*` | ~570 | Strong | The editable-field definitions and the grammar-subset invariant (plain strings, `\n` = paragraph, `- ` = bullet, no inline markup; `phase` controlled). |
| **C5.13 Config & wiring** | `app/src/payload.config.ts`, `next.config.ts`, `eslint.config.mjs`, `vitest.setup.ts`, `playwright.config.ts`, `scripts/seed-users.ts`, `scripts/recover-site-admin.ts`, `scripts/check-approuter.mjs` | ~600 | Strong | Central Payload wiring (jobs, collection/access registration, GraphQL settings, CSRF/CORS from `SERVER_URL`), headers config. A misconfig here is a systemic hole. (`Dockerfile`, CI and `deploy/**` are read in C70.) |
| **C5.14 Migrations (spot-check)** | `src/migrations/*` — **hand-edited only** | — | Light | Data migrations, custom `down()`, enum-narrowing `down()` (delete-before-cast), anything non-generated. Don't read generated schema. |

**Per-unit checklist:** logic errors and wrong conditions; unhandled promise rejections and swallowed
errors; null/undefined paths; dates and time zones; multi-step writes without a transaction; Local API
calls without `overrideAccess: false` where user context matters; N+1 queries; dead branches and unused
parameters; duplication confirmed from C12; comments that no longer match the code; tests that exist
but wouldn't fail if the behavior broke.

---

### Phase 6 — UI, CSS, accessibility, performance, functional bugs

#### C60 — Visual consistency crawl · Light · M
Playwright visits every route from `scans/surface.md` as each role at 360, 768 and 1280 px widths,
saving raw screenshots outside the checkout and extracting computed styles of buttons, links, headings,
inputs, cards and tables into a table. Report distinct variants per component (e.g. "buttons render
with 6 different paddings across pages"), frontend vs admin mismatches, overflow and horizontal
scroll at 360 px, and clipped text. Findings: `findings/C60-visual-consistency.md`.

#### C61 — Accessibility · Light · M
Run `@axe-core/playwright` on every route per role; keyboard-only walkthrough of key flows (login,
find lesson, edit, save, export, discuss); focus visibility; color contrast; form labels and error
messaging; heading structure; screen-reader names on icon buttons. Findings: `findings/C61-a11y.md`.

#### C62 — Performance and low bandwidth · Light · M · [exclusive for the load part]
- Lighthouse (mobile, throttled) on home, library, a lesson page, editor, discussion page.
- `next build` route size output; page weight and request counts; caching headers through Cloudflare
  (static assets cached? HTML not?); compression; fonts and images.
- Server timing for key API calls; obvious N+1s seen in logs.
- Light load test with `k6` or `autocannon`: ramp anonymous and logged-in read traffic until latency
  degrades; monitor CPU, RAM, and swap on the approved test target through private monitoring. Record the knee and the resource that
  saturates first.
- Note the `--max-old-space-size=8000` build flag against target hardware.

Findings: `findings/C62-performance.md`.

#### C63 — Functional bug hunt · Strong · M
Use `USER_GUIDE.md` as the script and walk every journey as each role in Chromium and **WebKit**
(iPhone/Safari users): broken links (run `linkinator` against the site), console errors, 404s/500s,
form validation, double-submit, back/forward behavior, session expiry mid-edit, refresh during save,
two tabs editing, very slow network (Playwright throttling), `publicLibrary` on/off behavior.
Findings: `findings/C63-functional.md`.

---

### Phase 7 — Ops, docs, tests

#### C70 — Deployment and ops review · Strong · M
`deploy/online/install.sh`, `update.sh`, `compose.template.yaml`, `app/Dockerfile`, CI and release
workflows, backup/restore procedures in `docs/OPS.md`: idempotency, failure modes mid-install/update,
rollback path, digest pinning, container hardening (non-root — the runner uses `USER nextjs`;
read-only filesystem, capabilities, resource limits, healthchecks), secrets handling, log retention.
**Edge headers:** inspect `Strict-Transport-Security`, any `x-powered-by` disclosure and the actual
Content-Security-Policy; check whether it allows `'unsafe-inline'` styles, assess impact and recommend.
Findings: `findings/C70-ops.md`.

#### C71 — Documentation drift · Light · M
Compare `SPEC.md`, `CLAUDE.md`, `AGENTS.md`, `USER_GUIDE.md`, `README.md`, `docs/OPS.md`, and
`docs/NEXT-SESSION.md` against the code and live behavior gathered in earlier chunks. Report stale
instructions, wrong paths/commands, features described but absent, and features present but
undocumented. Findings: `findings/C71-docs-drift.md`.

#### C72 — Test-suite quality · Light→Strong · S
From C10 coverage: zero-coverage modules, especially in `access/`, `endpoints/`, `ingest/`. Spot-check
tests that assert nothing meaningful, rely on timing (flaky), or mock the thing under test. Map e2e
specs to features and list uncovered features. Recommend which `app/tests/audit/` specs should be
promoted into the permanent suite and CI. Findings: `findings/C72-tests.md`.

---

### Phase 8 — Reconciliation, cross-model review, synthesis

#### C80 — Cross-cutting reconciliation · Strong · M
Synthesis over every earlier findings file and the tests already read — compact matrices, **not** a
re-read. Write `scans/matrices.md`:
- **Endpoint → authz-test matrix:** every custom endpoint × its http tests for 401/403/404 + happy
  path. Gaps are findings under the `CLAUDE.md` endpoint rule.
- **Role/action matrix:** C21 expected vs C22 actual, condensed, with every mismatch linked to a finding.
- **Invariant → test matrix:** each security or integrity invariant (version immutability, never
  execute uploaded JS, grammar subset, email field privacy, transfer irreversibility, etc.) × the test
  that pins it.
- **Coverage-by-environment:** what is tested in CI vs only locally vs only on a shared deployment vs only in a
  browser.
- **Tests that would still pass against a known-bad implementation** — the most valuable column. For
  key invariants, reason whether a removed guard breaks the test. If authorized, mutation probes use
  a throwaway source copy outside audit checkouts, never product files on the audit branch.

Also reconcile leads: verified, discarded with evidence, or explicitly unresolved. Incorporate the handbook
review/response outcomes; no model-agreement shortcut for contested evidence.

#### C81 — Vertical-flow pass · Strong · M
The capstone: trace whole flows across modules to find boundary failures that unit-by-unit review
misses. Use code plus the audit harness to follow each flow end to end:
- signup → verify → login → password reset/recovery;
- upload → validate → store → preview → export;
- edit → immutable version → Official-pointer move → discussion/notification;
- export/email request → job queue → artifact cache → delivery;
- session expiry mid-edit → edit recovery / working-draft restore.

Findings: `findings/C81-vertical-flows.md`.

#### C82 — Blind cross-model review · Cross · M
A different model family (e.g. Codex if Claude did the originals) independently reviews
`app/src/access/**`, the C30 write paths, and `app/src/ingest/**` **without** reading earlier findings
first, writing `findings/C82-cross-review.md`. Only then compare against C22/C30/C31/C40/C41/C5.1/C5.2
and note agreements, new findings, and disputed findings. New candidates enter the mandatory
review tiers in the handbook; this blind missing-issue pass supplements finding validation.

#### C83 — Synthesis and roadmap · Strong · M
1. **Change sweep:** compare immutable audit base to a separately recorded current main SHA, not
   worker audit-branch HEAD. Reopen changed covered files in an identified follow-up sweep; preserve
   original evidence/revision. If none changed, note "no reopen needed".
2. De-duplicate and incorporate all handbook critiques/author responses. Build `FINDINGS.md` with accepted
   findings and separate withdrawn/duplicate/unresolved sections, each linking its audit trail.
   Include final evidence/review status, severity/class/category/location and later fix disposition.
   Only accepted findings enter confirmed totals or the fix roadmap; list unsampled author-verified
   observations separately, without implying peer confirmation.
3. Write `SUMMARY.md` as a self-contained handoff (see the handbook): executive summary, audited/deployed revisions,
   environment and exclusions; accepted counts by severity/class/category and prioritized risks with
   rationale; test results/coverage gaps; unresolved/withdrawn outcomes; and a PR-sized fix roadmap.
   Link component understanding and include the minimum sanitized evidence/repro needed to act,
   without depending on chat history. Accepted live-risk Critical/High lead, each with a regression test.
4. List audit checks worth adopting permanently (scans for CI, audit specs to promote).
5. Remind the operator to rotate all audit account passwords, remove extra accounts if unwanted, and
   remove Mailpit or point SMTP back if it was added only for the audit.

**Re-running later.** Reset chunks to `todo` only after a substantial feature lands, and then only the
chunks and units whose files changed (use `manifest.md` to find them). The scans (C10) and audit specs
can be re-run without model calls; execution still consumes compute and interpretation uses allowance.

---

## Severity reference

| Level | Meaning |
|---|---|
| **Critical** | Exploitable now with serious impact: privilege escalation to admin, version history altered, data loss, remote code execution, auth bypass, secrets exposed |
| **High** | Serious bug or security weakness requiring some precondition; core feature broken for a role; integrity risk |
| **Medium** | Real bug with workaround or limited blast radius; notable performance/accessibility failure; dependency with relevant known CVE |
| **Low** | Minor bug, inconsistency, small inefficiency, hardening gap |
| **Info** | Cleanup, duplication, dead code, style inconsistency, doc drift, suggestions |

## Finding template

```markdown
### F-C22-007 — Teacher with editing access on SG-B can PATCH a lesson plan in SG-A via REST
- **Severity:** Critical   **Category:** rbac   **Class:** live-risk
- **Audit status:** candidate | under-review | author-recheck | accepted | author-verified/unreviewed | withdrawn | unresolved | duplicate
- **Revision / provenance:** source SHA, deployment SHA if tested, artifact version/hash, author role/model/date (account identity private)
- **Review tier / coverage:** full-cycle | single-pass | sampled | unsampled; selection rule/batch/IDs if sampled
- **Peer review:** reviewer role/model/date (account identity private); verdict/evidence and author response where required by the tier
- **Evidence scope:** source-confirmed | locally reproduced | deployment reproduced | pending reproduction
- **Scenario:** one line — concrete input/state → wrong outcome
- **Where:** `PATCH /api/lesson-plans/:id` · `app/src/access/bundle.ts:L42-L61`
- **Evidence:** sanitized source/request/test result; exact command, exit status, source SHA and relevant runtime/tool/fixture conditions
- **Interpretation / limits:** how the evidence establishes the claimed outcome; remaining uncertainty and what it does not establish
- **Repro:** numbered steps or the audit spec that reproduces it (`app/tests/audit/rbac.audit.spec.ts › …`)
- **Expected vs actual:** what SPEC/code intent says vs what happened
- **Suggested fix:** one or two sentences; no code changes made
- **Related:** other finding IDs, DECISIONS.md entries, known.md items
- **Disposition:** _(left blank during the audit; filled at triage)_ fix-PR #… | deferred | won't-fix — reason
```

IDs are `F-<chunk>-<nnn>`, numbered within the chunk file (Phase 5 units use e.g. `F-C5.3-002`).

## Evidence classification

| Class | Meaning |
|---|---|
| **live-risk** | Real and currently exploitable or broken on the deployed code |
| **known-planned** | Already on the roadmap or in `known.md` (e.g. working drafts, the `emailVersionArtifact` no-op) — record once with a pointer, never re-flag |
| **future** | Only matters at a scale or exposure the project isn't at yet (e.g. thousands of concurrent users) |

## Progress table

Cycle base SHA: `<sha>` · Started: `<date>`

| Chunk | Title | Exec | Size | Status | Agent | HEAD SHA | Accepted findings (C/H/M/L/I) | Notes / resume point |
|---|---|---|---|---|---|---|---|---|
| C00 | Environment, parity, baseline | Light | M | todo | | | | |
| C01 | Reseed drill + mail capture | Light | S | todo | | | | exclusive |
| C10 | Run all scans | Hand | S | todo | | | | |
| C11 | Triage: dependencies | Strong | S | todo | | | | |
| C12 | Triage: dead code + duplication | Light→Strong | M | todo | | | | |
| C13 | Triage: lint/types/complexity | Strong | M | todo | | | | |
| C14 | Triage: CSS static | Light | S | todo | | | | |
| C15 | Triage: secrets/shell/Docker/CI | Light | S | todo | | | | |
| C20 | Audit harness + surface inventory | Light | M | todo | | | | |
| C21 | Expected permission matrix | Strong | M | todo | | | | |
| C22 | Actual permission matrix | Strong | L | todo | | | | split a/b/c |
| C23 | Auth flows | Strong | M | todo | | | | |
| C24 | Discussions/messages/favorites/recovery | Strong | M | todo | | | | |
| C30 | Version write-path analysis | Strong | M | todo | | | | |
| C31 | Immutability attack run | Strong | M | todo | | | | exclusive |
| C40 | Ingest code review | Strong | M | todo | | | | |
| C41 | Malicious upload corpus | Strong | M | todo | | | | exclusive |
| C42 | Export fidelity + robustness | Light→Strong | M | todo | | | | exclusive (load) |
| C5.1 | Authorization core | Strong | S | todo | | | | pair with C5.12 |
| C5.2 | Ingest & upload boundary | Strong | M | todo | | | | coordinate with C40 |
| C5.3 | Auth, account & admin endpoints | Strong | M | todo | | | | |
| C5.4 | Export & data endpoints | Strong | M | todo | | | | coordinate with C42 |
| C5.5 | Social, recovery & settings endpoints | Strong | M | todo | | | | |
| C5.6a/b… | Collections + hooks | Strong | L | todo | | | | split points from C00 |
| C5.7 | Jobs & queue | Strong | S | todo | | | | |
| C5.8 | Generator & fidelity | Strong | M | todo | | | | excl. vendor/ |
| C5.9a/b/c | lib/ utilities | Light→Strong | L | todo | | | | split points from C00 |
| C5.10 | Frontend server & wiring | Strong | M | todo | | | | |
| C5.11a–f | Components & client | Light→Strong | L | todo | | | | split points from C00 |
| C5.12 | Fields & editor grammar | Strong | S | todo | | | | |
| C5.13 | Config & wiring | Strong | S | todo | | | | |
| C5.14 | Migrations spot-check | Light | S | todo | | | | hand-edited only |
| C60 | Visual consistency crawl | Light | M | todo | | | | |
| C61 | Accessibility | Light | M | todo | | | | |
| C62 | Performance + load | Light | M | todo | | | | exclusive (load) |
| C63 | Functional bug hunt | Strong | M | todo | | | | |
| C70 | Deployment + ops | Strong | M | todo | | | | |
| C71 | Docs drift | Light | M | todo | | | | |
| C72 | Test-suite quality | Light→Strong | S | todo | | | | |
| C80 | Cross-cutting reconciliation | Strong | M | todo | | | | promotes/discards all leads |
| C81 | Vertical-flow pass | Strong | M | todo | | | | capstone |
| C82 | Blind cross-model review | Cross | M | todo | | | | different model family |
| C83 | Synthesis + change sweep + roadmap | Strong | M | todo | | | | |
