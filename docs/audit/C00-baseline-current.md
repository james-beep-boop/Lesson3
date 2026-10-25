# C00 Current baseline and environment

## Chunk contract

- **Owner:** sole auditor (Codex), operator-confirmed; no independent model review claimed.
- **Source:** main `bd5f07863a150cd51245b9c942502efa19d4014d`, product-equivalent to release v1.07.
- **Mandatory checks:** pinned runtime, source/dependency provenance, all-file manifest and component
  map, known issues, baseline lint/types/format/unit/integration/HTTP/browser/build and documented
  ingest/fidelity/RBAC CLIs, target readiness and deployment revision parity.
- **Artifacts:** this report, manifest-current.md, scans/current-baseline.md, continuation notes and
  private raw logs/configuration. Runtime and CLI gaps remain explicit.
- **Exclusions:** none. No historical suite result is substituted for current-baseline execution.
- **Exit:** each mandatory check has current evidence, remaining gaps have precise next actions,
  and the isolated runtime target is ready for C01 proof.

## Provenance and isolation

The immutable product baseline and observed remote main match. Release v1.07 resolves to
`69dd7d2ec1f3d8b9e78bff8c7f0892cdf41a2234`; `git diff v1.07 bd5f078 -- app scripts deploy SPEC.md`
is empty. The operator's 1.0.7 designation is recorded as repository release v1.07.

The executor is Linux ARM64 with sufficient RAM for the authorized test workload. The host Node is
22.23.4; all application commands use `scripts/in-deps.sh` and the pinned **Node 24.22.1** image.
A private argument-translating Docker shim gives dependency images and volumes a dedicated namespace;
it refuses prune commands and restricts volume enumeration to that namespace. No tracked dependency,
product configuration, vendor or existing-test file was modified.

Production and migration images were built from the current source. A new dedicated Compose project
uses separate database/cache volumes and network, private owner-only host directories, loopback-only
published app/mail ports, internal database/PDF/SMTP endpoints and bounded service resources.
Resolved configuration was checked before startup. Production migrations completed, and `/login`
answered HTTP 200. The optional PDF fixture surface and public-discovery configurations remain to
be exercised. The older audit target and unrelated services were preserved.

The baseline integration suite uses a separate empty database in this new project's Postgres.
Its private env file is mounted over `/app/test.env` inside the test container, preserving the tracked
file. HTTP tests use the new production app/database and hold the target's audit lock. These are
baseline fixture-writing suites; reset/reseed/restore/mail proof and attack harness readiness remain
distinct C01 gates.

## Resume

Read scans/current-baseline.md for outcomes. Finish active suites without restarting them; inspect
the retained execution handles and private exit-status files. Then establish C01 synthetic fixtures,
mail/reset/restore proof, proceed to the first-wave permission/version/ingest attacks, and fill the
remaining scan/component/UI/operations coverage alongside that wave.
