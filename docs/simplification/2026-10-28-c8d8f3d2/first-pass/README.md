# Mechanical first pass

Source: tag `v1.10`, `c8d8f3d22c432061c8bff27e8357dd9f2d4feb91`. All Node tools ran through
`scripts/in-deps.sh`, on Node 24.22.1, against the separate review checkout. Product dependencies
and configuration were unchanged. These are navigation leads, not verified defects.

- `jscpd@4.0.5`, JSON reporter, source/app scripts/root shell scripts: 19 clusters before filtering;
  18 after removing the generated Payload route pair. Generated types, vendor and migrations were
  excluded by glob. Retained source pairs are in `duplicates.json`.
- `knip@5.66.0`, JSON reporter: 67 unused-file leads and 82 file issue groups before filtering.
  The default entrypoint detection does not understand this project's CLI, Payload configuration,
  migration registry and style-test entrypoints. Therefore its unused-file list is mostly false
  positives. Generated migrations are omitted from the committed navigation report.
  Two `npx` launches failed to resolve Knip's TypeScript peer dependency. Successful run used a
  separate temporary tool prefix with exact `knip@5.66.0` and `typescript@5.9.3`, then
  `knip --directory /app --reporter json`; exit 1 denotes findings, stderr empty.
- Installed `typescript@5.9.3`: `tsc --noEmit --noUnusedLocals --noUnusedParameters`, exit 2 with
  unused-symbol diagnostics. Most are automatic-JSX-runtime React imports and unused test mock
  parameters, rather than unused runtime code. No tsconfig change made.
- `helpers.md` indexes exported declarations in lib/access/hooks/fields. Reviewers establish their
  semantics from source; the index alone is not a conclusion that two helpers are interchangeable.

Full raw tool logs, transient dependencies and package lock stay outside the repository. The
curated outputs contain source references, no environment values or operational credentials.
