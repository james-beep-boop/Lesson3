# Mechanical checks and the dead-code correction

Source: fixed v1.10 `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`; fixes rechecked against main.
All Node tools ran through scripts/in-deps.sh, Node 24.22.1. Tool dependencies stayed in an external
prefix; no audit packages were added to the application.

## Original checks

- jscpd 4.0.5: 18 retained source clusters after excluding generated output; 97 test clusters.
  Hits were checked for distinct permission/null/race/fixture contracts before considering reuse.
- TypeScript 5.9.3 unused-local/parameter pass: mostly JSX-era React imports and mock parameters.
- **Knip 5.66.0 was initially unconfigured.** Its 67 unused-file leads were largely framework/CLI
  entries, but dismissing the list missed real unused declarations. That run was insufficient.

## Configured follow-up

PR #480 adds app/knip.json with explicit Next routes/proxy/instrumentation, Payload config, migration
registry, top-level CLIs, test suites and test/config entry points. Test helpers remain traversed
modules, not blanket entry points that would hide unused helpers. Migration registry edges are
traversed; generated/migration output and vendor files are not deletion targets. Next 16's proxy
convention was confirmed from installed source: the old Knip plugin did not recognize it automatically.

At the fixed baseline: **0 unused files, 56 export hits, 93 type-export hits, one dependency hit and
one undeclared import**. Every hit has a disposition in the [evidence ledger](https://github.com/james-beep-boop/Lesson3/tree/review/simplification-v1.10-evidence/docs/simplification/2026-10-28-c8d8f3d2/first-pass).
An additional include-entry-exports run exposed only REQUEST_HEADER (used locally) and Next's
proxy/config convention exports; all three were retained.

- Remove unused contractDriftSummary (James approved), BACKUP_PATHS and the formReq test helper.
- Keep 51 declarations with local uses: unused outward exports do not mean dead implementations.
- Keep two unused forwarding API paths whose implementations are live; an export-only sweep is optional.
- Keep 93 locally used types; unused type exports are not dead runtime code.
- Keep tsx: CI invokes it and Playwright preloads tsx/esm through NODE_OPTIONS.
- Import benchmark Chromium via declared @playwright/test, not transitive playwright. Installed
  source/runtime checks confirmed the identical Chromium object.

After cleanup: 0 unused files, 53 export hits and 93 type hits retained with dispositions; only the
known external-loader tsx dependency hit remains. Temporary negative controls proved detection of an
unreachable file and an unused export in a live module, then were removed.

## Reproduce and limits

Use app/knip.json from #480 and pinned knip@5.66.0/typescript@5.9.3 in an external tool prefix, then:

```sh
scripts/in-deps.sh --network none -v /absolute/audit-tools:/audit -- \
  /audit/node_modules/.bin/knip --config knip.json --reporter json
```

Exit 1 denotes retained findings, not a clean result. The evidence branch keeps exact config,
before/after/entry-export/control output and per-symbol identifier references. Static results still
need caller and dynamic-registration checks. Intentional CLI entry points are not proof every CLI
is still useful; shell functions, CSS classes, generated/vendor internals and dynamically named
members are outside this scan. No claim of exhaustive runtime reachability or security coverage.
