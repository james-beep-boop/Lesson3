# C20 — Surface inventory and harness

## Chunk contract

- **Owner:** coordinator (Codex); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Mandatory checks:** every frontend/admin/API surface, registered custom and framework endpoints,
  collections/globals and job triggers; role-specific crawl/XHR evidence; Chromium/WebKit harness
  with private cached role storage and an API client. GraphQL remains an unreachable-surface check.
- **Artifacts:** this report, `scans/surface.md`, `scans/crawl.md`, `scans/rbac-implemented.md`,
  the isolated audit helpers and private runtime output.
- **Exclusions:** static registration alone does not establish reachability/authorization. No production
  fixtures, model-account credentials, browser state or reset links are published.
- **Exit:** source inventory and role crawl reconcile; harness signs in as every required account in
  both browser projects; unresolved surfaces have an explicit next action rather than presumed coverage.

## Progress — 2026-10-24

Static inventory started without consuming author-account allowance. `c20-inventory.ts` awaits the
pinned sanitized Payload config but does not call `getPayload`, initialize a database or start jobs.
It runs in the pinned dependency container with networking disabled and resolves dynamic endpoint
factories, including framework-added collections and globals.

`scans/surface.md` records **15 page patterns, 16 collections, two globals, five job tasks and 263
ordered endpoint descriptors**, including four root descriptors. Access function names are references
to investigate, not policy or proof. Native disabled-feature handlers and duplicate shadowed auth
descriptors remain explicit. The generated Next API catch-all exports six HTTP verbs.

The live inventory now covers all ten actor scenarios in Chromium and WebKit: eight verified accounts,
an anonymous context and a refused unverified login. Each authenticated login is checked against
`/api/users/me`; private per-account storage is cached for subsequent tests. The harness limits requests
to the explicit internal target, strips query values from inventory records and retains sensitive
artifacts outside Git. `playwright.audit.config.ts` selects the surface crawl by default and the
Manage supplement with `LESSON3_AUDIT_CRAWL_PHASE=panels`; the latter requires the private state mount.

Usable evidence comprises **360 route visits, 420 explicit API reads/probes and 48 Manage-panel visits**.
All 15 page patterns have representative visits and all 15 current Manage panel identifiers were
requested through three deep links. The supplement passed 16/16 cases using cached role states.
GET/POST GraphQL probes returned 404 for every role in both browsers. The observed API union reconciles
to 24 registered patterns plus three deliberate absent/disabled probes (GraphQL verbs and migrations).
The separate source map traces all 42 application custom descriptors and key collection/field/hook gates.

Keep the original **18-pass/two-fail** crawl and the first focused two-fail follow-up: those exposed
harness redirect handling, not a product conclusion. The corrected two-case Chromium follow-up passed;
combined coverage uses those records plus the 18 unaffected originals. The matcher now accepts login
redirect queries and each route gets a separate tab. Failed locks were reconciled against dead owner
processes, absent runners and known outcomes; no uncertain mutation was retried. A synthetic discussion
topic was prepared once using a persisted submission key.

**C20 exit met for inventory/harness.** This is not 263 passing authorization tests or exhaustive UI
interaction coverage. C22–C24 own method/body/ID/ownership, field-filter and bulk-operation attacks;
C60–C63 own broader interaction/viewport coverage. Public-enabled and deployed-edge postures remain
separate checks. `scans/crawl.md` records exact environment and limits. C21 remains a policy/source
work item rather than interpreting status codes as expected permissions.

TypeScript, ESLint and helper formatting checks pass. Final harness maintenance gives test titles
human-facing capability labels and separates crawl-phase discovery; those changes do not change
the executed request assertions. Private snapshots and logs preserve the executed earlier versions.

Helper artifact SHA-256: `e76d75942513ab231d9b87e364707bf18a2e626def9690d716a2497da4d7381b`.
