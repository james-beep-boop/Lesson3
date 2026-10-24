# Baseline provenance — C00

- **Source:** `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`, immutable detached heavy-worker checkout.
- **Runtime:** repository-pinned Node 24.22.1 dependency container; Linux ARM64 execution.
- **Dependencies:** baseline `app/package-lock.json` and `.npmrc`, including the guarded postinstall
  patch. No product dependency or configuration edits. Exact image IDs and hashes are private evidence.
- **Invocation:** unmodified `scripts/in-deps.sh` through an external run-specific Docker namespace
  shim. Source-only `app/` and the wrapper's individual parity files are mounted, never `.git`.
- **Resources:** baseline command containers capped at four CPUs/eight GiB (dependency audits two
  CPUs/four GiB); unit suite uses two workers. Dedicated image builder capped at four CPUs/12 GiB.
- **Target:** own Compose project/images/volumes, internal network, no host ports, synthetic secrets
  and internal mail capture. Service caps and resolved configuration were validated before launch.
- **Isolation:** existing worker services remain outside the audit configuration. No deployment-host
  runtime operations have been performed for this cycle.

This provenance records successful preparation. `test-results.md` records actual command outcomes;
neither this file nor existing CI results substitutes for a new test run. Raw output stays outside Git.

## Audit helper artifact versions

These uncommitted audit outputs are versioned by SHA-256 for this run; they do not change the
product baseline. Raw run-specific orchestration/configuration is retained privately.

| Artifact | SHA-256 |
|---|---|
| `app/tests/audit/c01-browser.ts` | `aa9f96a355fb6d3d1c6878434c2f86305a5dbf1c0fb891e5a9007b68abe1e7dd` |
| `app/tests/audit/c01-fingerprint.ts` | `75802ac3921aa240f3af6eca97f2ee4f58f191f13c805a30ea7d8952a71aa4a1` |
| `app/tests/audit/c01-readiness.ts` | `7689a020953de23da1d35ff628848172fbe9cf20247dc85004b2989c0561a907` |
| `app/tests/audit/c01-seed.ts` | `ee53967f51e1550a769009844d212ff8567cf2849ff3cfcc3136c7fd79677bb3` |
| `docs/audit/tools/reset-test.sh` | `cd3a0ff241c290195a621eb9ac377d0339b481ace92cf2aa6de8d19930ccb2e9` |
| `docs/audit/tools/with-target-lock.sh` | `22006c0d7d893023533bde9fce2bc344ce9983434eb6d2e94a609664483d1241` |
