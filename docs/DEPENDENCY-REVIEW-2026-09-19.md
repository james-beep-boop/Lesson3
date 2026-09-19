# Dependency review - 2026-09-19

This review is intentionally limited to the three security-sensitive runtime components selected for
the `v0.84` maintenance release. Other available package updates remain separate changes so migration,
editor, and export regressions are attributable.

## Selected updates

| Component | Previous | Selected | Reason |
|---|---:|---:|---|
| Payload family | 3.88.0 | 3.90.1 | Payload 3.90.0 contains critical security fixes and requires an auth-schema migration. 3.90.1 is the immediate bug-fix release. All Payload packages move together. |
| Node.js | 24.19.0 | 24.21.0 | Stay on Node 24 LTS while taking updated root certificates, OpenSSL 3.5.8, and Undici 7.29.1. Docker stages and both `.nvmrc` files use the same exact patch. |
| Gotenberg | 8.36.0 | 8.37.0 | Take the outbound-URL policy security fixes and related resource bounds. Both the custom Arial image and the smaller local-server image are pinned by multi-architecture manifest digest. |

Authoritative references: [Payload 3.90.0](https://github.com/payloadcms/payload/releases/tag/v3.90.0),
[Payload 3.90.1](https://github.com/payloadcms/payload/releases/tag/v3.90.1),
[Node.js 24.21.0](https://nodejs.org/en/blog/release/v24.21.0), and
[Gotenberg 8.37.0](https://github.com/gotenberg/gotenberg/releases/tag/v8.37.0).

## Payload impact review

Payload 3.90 adds `resetPasswordRequestedAt` to auth collections. Types were regenerated and migration
`20260919_222201_add_reset_password_requested_at` adds exactly one nullable
`timestamp(3) with time zone` column to `users`. The migration was exercised four ways:

- the complete migration chain applied to an empty PostgreSQL 16.15 database;
- an existing 3.88 schema with a sentinel user migrated forward without changing that user;
- the new migration rolled back, removing only the new column while preserving the sentinel;
- the migration reapplied and restored the nullable column.

The 3.89 jobs-access default changed. Lesson3 already defines explicit access for both job-system
endpoints and every `payload-jobs` collection operation, so the upstream default is not an authority
boundary here. Payload 3.90 also updates Lexical from 0.41 to 0.50. Lesson3 has no direct Lexical
dependency or custom Lexical node, and the complete unit, integration, HTTP, and browser suites cover
the editor and generated output.

Lesson3 does not use Payload storage adapters, client uploads, scheduled publishing, API keys, the
form-builder plugin, or polymorphic joins, so the corresponding 3.90 actions do not apply. Its custom
upload-size controls remain explicit.

## Export fidelity

The post-upgrade Physics 4.1 DOCX probes reproduce the recorded pre-upgrade baseline:

- all 470 Lesson Sequence blocks, 52 Final Explanation blocks, and 41 Summary Table blocks match;
- all seven Section-C table widths, fills, striping, and eight page breaks match;
- `fidelity-spike` remains 3/4 and `adapter-fidelity` remains 5/6 only because the supplied fixture and
  oracle already disagree on `ares.local` versus `ares.edu` and one extra supplied hyperlink.

The custom Gotenberg 8.37 image builds on arm64 with `ttf-mscorefonts-installer=3.8.1`, and its build
asserts that Arial is registered. Representative Lesson Sequence, Final Explanation, and Summary Table
DOCX files were converted with both the previous 8.36 image (LibreOffice 26.2.5) and 8.37
(LibreOffice 26.8.0). Page counts and page dimensions are unchanged. At 96 DPI, Final Explanation and
Summary Table renders are pixel-identical; the 37-page Lesson Sequence has only minute glyph
rasterization differences around a few link/icon areas (maximum mean channel delta 0.0031 on a
0-255 scale), with no visible clipping, reflow, or table movement. Production HTTP tests also verify
real DOCX and Gotenberg PDF bytes.

The release bundle's official `8.37.0-libreoffice` image was checked separately against its pinned
`8.36.0-libreoffice` predecessor. It produces the same 37/5/2 page counts, matching page dimensions,
pixel-identical Final Explanation and Summary Table pages, and the same maximum 0.0031 Lesson Sequence
raster delta. This preserves the documented local-server font tradeoff while ruling out new layout
drift from the Gotenberg/LibreOffice update.

## Verification

Local evidence before opening the maintenance pull request:

- production build and fresh empty-database migration: pass;
- typecheck, ESLint, Prettier, contract (16/16), and ingest extraction (25/25): pass;
- unit 1127/1127, PostgreSQL integration 236/236, and production HTTP 217/217: pass;
- Chromium: all 51 scenarios pass; two navigation-sensitive cases needed configured retries in the
  loaded full run, then both passed together with retries disabled;
- deploy-sidecar 13/13, backup/status 53/53, and local release-bundle/update/publish checks: pass;
- `npm audit --omit=dev --audit-level=high`: pass with no high or critical finding.

Five moderate esbuild development-server advisories remain through Payload's Drizzle tooling and
Vite. npm reports no compatible fix. The production audit threshold remains fail-closed, and none of
those development servers is exposed by the standalone production image.

The protected pull-request CI gate is still required before merge. `v0.84` must be tagged only from
the accepted `main` commit, after that gate passes.

## Deliberately deferred

The broader `npm outdated` result includes small patches and several majors. They are not part of this
security maintenance release:

- `docx` 9.7.1 remains deferred because it is on the byte-sensitive ARES generator path;
- Playwright 1.63, Vitest 5, ESLint 10, Vite React plugin 6, jsdom 30, and type-package majors need
  isolated test-tooling changes;
- React 19.3, Sentry 10.75, Sass, DOMPurify, Mammoth, JSZip, PostCSS, Acorn, testing-library, and `tsx`
  updates can be reviewed as a normal application-maintenance batch after `v0.84`;
- TypeScript 7, GraphQL 17, `dotenv` 18, and `cross-env` 10 remain deliberate major-version projects.
