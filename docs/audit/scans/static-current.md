# Current static scan inventory

Source baseline: `bd5f07863a150cd51245b9c942502efa19d4014d` (v1.07). These are current-source
observations from the pinned Node 24 dependency image and host-only text scans. Raw JSON, stderr and
line inventories remain private under the audit target directory. No product files were changed.

## Dependency age and resolution

`npm outdated --json` returned exit 1 because fourteen packages have newer releases. The pinned
versions remain the wanted versions, so this is release-age data rather than a failed install:

| Package group | Current → latest |
|---|---|
| `@sentry/node` | 10.76.2 → 11.9.0 |
| `@types/jsdom`, `@types/node` | 28.0.3 → 30.0.0; 24.19.2 → 26.6.5 |
| `@vitejs/plugin-react`, `cross-env` | 4.5.2 → 6.1.2; 7.0.3 → 10.1.0 |
| `docx`, `dotenv`, `drizzle-orm` | 9.6.1 → 9.14.0; 16.4.7 → 18.0.9; 0.45.2 → 0.45.4 |
| `eslint`, `graphql`, `jsdom` | 9.39.5 → 10.13.0; 16.14.2 → 17.0.2; 28.1.0 → 30.1.3 |
| `sass`, `typescript`, `vitest` | 1.79.6 → 1.106.1; 5.9.3 → 7.0.2; 4.1.12 → 5.0.5 |

The existing `npm audit` all/prod result remains five moderate entries with no high/critical and no
available npm fix; the current-baseline report records the underlying esbuild advisory. `npm ls
--all` returned `ELSPROBLEMS` in both the pinned image and the mounted dependency environment:
missing peer packages (`monaco-editor`, `yjs`) and invalid/peer-resolution entries for
`@opentelemetry/api`, `fdir`, `picomatch`, `tinyglobby`, and `yaml`. The application image, lint,
typecheck, unit/integration suites and production build all passed; this resolution report needs
dependency triage and a clean-install comparison before it can be treated as a product issue.

## Suppression and configuration inventories

The requested ripgrep suppression inventory found 35 lines. Most matches are prose containing the
word “any”; the semantic matches are the generated `payload-types.ts` file-wide eslint disable,
two unit-test `@ts-expect-error` assertions, several narrowly scoped React/Next eslint disables,
and one test `as any` pattern. They were not treated as defects without opening each flagged region.

All 14 GitHub Actions `uses:` references found in the current workflows are full commit SHAs with
version comments; no tag-only action reference was observed. Ten shell-risk matches are guarded
cleanup `rm -rf` calls in deployment/test scripts and the app-router check; no `curl | shell` or
unbounded `eval` match was found in this scan.

## Tools not available in this worker

`knip`, `jscpd`, `gitleaks`, `shellcheck`, `hadolint`, and `stylelint` are not installed in the
approved runtime, and no unpinned third-party scanner was added to the product environment. Their
dead-code, duplication, secret-history, shell, Dockerfile and CSS reports remain open C10–C15 work.
The available npm advisory/outdated/override data and text inventories are mechanical observations,
not accepted findings.
