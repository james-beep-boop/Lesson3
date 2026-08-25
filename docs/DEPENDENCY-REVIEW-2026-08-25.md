# Dependency review — 2026-08-25

This review covers the components shipped in the Lesson3 application and its local-server release.
It uses the npm registry, upstream release notes, official support pages, resolved container
manifests, a production dependency audit, and the repository's build and test suites. “Latest” is a
point-in-time observation, not an instruction to update automatically: Lesson3 deliberately pins
versions and promotes changes only after its output and application gates pass.

## Updates included in this deployment work

| Component | Previous | Selected | Decision |
|---|---:|---:|---|
| Node.js | 24.19.0 | 24.19.0 | Keep. It remains the current Node 24 LTS line and the repository's exact runtime authority. |
| Payload packages | 3.87.1 | 3.88.0 | Update the whole Payload family together. The release includes fixes for multipart parsing and copied sibling-row data. |
| Next.js | 16.2.12 | 16.3.2 | Update after a successful production build and application suites. npm began reporting 16.3.3 during this review, before corresponding upstream release notes were available; hold that additional patch for a normal tested maintenance change. |
| React / React DOM | 19.2.6 | 19.2.8 | Apply the current compatible patch pair. |
| DOMPurify | 3.4.13 | 3.4.14 | Apply the current patch. |
| Mammoth | 1.12.0 | 1.12.1 | Apply the current patch. |
| GraphQL | 16.14.1 | 16.14.2 | Apply the current 16.x patch. Payload 3.88.0 declares support for GraphQL `^16.8.1`; GraphQL 17 remains outside that peer range. |
| TypeScript | 5.7.3 | 5.9.3 | Move to the mature 5.9 compiler while staying inside the supported range of the repository's ESLint tooling. The stricter DOM types caught two response-boundary assumptions, which were corrected and exercised over the wire. |
| Test helpers | several patches behind | current compatible patches | Update `@testing-library/react`, `tsx`, `vite-tsconfig-paths`, and Vitest within their current major versions. |
| PostgreSQL | floating `16-alpine` | 16.15 plus manifest digest | Stay on major 16 and pin its current patch. A move to PostgreSQL 18 is a separate database upgrade with dump/restore and rollback rehearsal, not a container refresh. |
| Gotenberg | 8.34.0 | 8.36.0 plus manifest digest | Update. The intervening releases include path-handling and outbound WebSocket policy security fixes. The internet image retains the required Arial fonts; the local-server bundle uses the smaller official LibreOffice-only variant. |

Authoritative references: [Node release status](https://nodejs.org/en/about/previous-releases),
[Payload 3.88.0](https://github.com/payloadcms/payload/releases/tag/v3.88.0),
[PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/),
[Gotenberg 8.35.0](https://github.com/gotenberg/gotenberg/releases/tag/v8.35.0), and
[Gotenberg 8.36.0](https://github.com/gotenberg/gotenberg/releases/tag/v8.36.0).

## Deliberately deferred

| Component | Installed | Registry latest observed | Reason to defer |
|---|---:|---:|---|
| `docx` | 9.6.1 | 9.7.1 | This is part of the byte-sensitive ARES generator path. Upgrade only with the generator corpus/fidelity oracle, not as deployment plumbing. |
| Playwright | 1.58.2 | 1.62.1 | A browser/runtime jump deserves an isolated CI change so failures are attributable. |
| Sentry Node SDK | 10.63.0 | 10.71.0 | Observability is not on the local-server critical path; update and exercise capture separately. |
| TypeScript | 5.9.3 | 7.0.2 | TypeScript 7 is a compiler/tooling major, including the native compiler transition and API/configuration changes. It needs a dedicated compatibility change rather than riding deployment work. |
| GraphQL | 16.14.2 | 17.0.2 | GraphQL 17 is outside Payload 3.88.0's declared `^16.8.1` peer range; coordinate the major with Payload support. |
| `dotenv` / `cross-env` | 16.4.7 / 7.0.3 | 17.4.2 / 10.1.0 | Major tooling changes with no deployment benefit. |
| Prettier | 3.8.3 | 3.9.6 | Trial formatting changed unrelated source files, so it was reverted rather than mixing mechanical churn into the release work. |
| `eslint-config-next` | 16.2.6 | 16.3.3 | Trial upgrade introduced two new warnings that require navigation-behaviour decisions; handle them as a focused change. |

Next.js 16.3 also reports that the `middleware` file convention is deprecated in favour of `proxy`.
The production build still succeeds, but that migration should be planned before a future Next major
release rather than hidden in this deployment change.

## Security and verification result

`npm audit --omit=dev` reports no high or critical findings. Five moderate findings remain in the
Payload Postgres dependency chain (`drizzle-kit` to an older development-server `esbuild`) and npm
offers no compatible fix. The production runner does not expose that development server, but the
finding should be rechecked when Payload updates its database tooling.

TypeScript 5.9's DOM definitions no longer accept a Node `Buffer`-derived view whose backing store is
typed as the broader `ArrayBufferLike` as a Fetch response body. The DOCX download and PDF preview
endpoints now make one bounded `Uint8Array` copy at the response boundary instead of weakening the
type with a cast. The production HTTP suite exercised both paths and verified real DOCX and
Gotenberg-produced PDF bytes.

The selected set passed 999 unit tests, 224 PostgreSQL integration tests, 200 production HTTP tests,
all 47 Playwright browser cases, typecheck, lint, formatting, production and runner-image builds, an
empty-database migration on PostgreSQL 16.15, the container-release bundle checks, and the production
audit threshold. One browser login navigation timed out on its first attempt, passed on Playwright's
CI retry, and the affected case then passed in a separate no-retry run. Dependency freshness alone is
not the acceptance criterion; generator fidelity and an exact published-container installation
remain required before a GitHub Release is declared supported.
