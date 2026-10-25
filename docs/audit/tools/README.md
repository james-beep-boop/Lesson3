# Current audit helper execution

Product baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. Run application helpers through
`scripts/in-deps.sh` in pinned Node 24, using an approved disposable Compose network. The worker
uses a private Docker namespace shim to preserve unrelated images/volumes. Credentials, host
mappings, raw results and browser state remain outside Git.

## Private target contract

`with-target-lock.sh TARGET_DIR COMMAND...` requires `state/identity.json`, uses atomic
`state/target.lock` acquisition and exports an ownership token for nested reset operations. Success
releases only its own lock; failure/interruption retains it. Reconcile actual process/outcome before
releasing a failed run's lock. A file/PID record alone does not prove liveness.

`reset-test.sh TARGET_DIR [SYNTHETIC_DUMP]` requires:

- `state/identity.json`: `project` matching `l3audit-[a-z0-9-]+`, `purpose` exactly
  `synthetic-disposable-audit`, immutable `sourceSHA` and absolute `sourceCheckout`.
- `state/source-sha` and `state/config.sha256`, matching source and `private/compose.json` bytes.
  Product changes outside audit output/test paths are refused.
- `private/runtime.env`, captured SMTP service `mail`, database service `postgres`, database/user
  `lesson3`, and app connection to that database. Actual database-container project and database
  comment marker match `project`. Volumes/networks are namespaced, binds stay under TARGET_DIR,
  published ports bind only loopback. Managed writers are `app` and test-only `pdf-private`.
- Restore input under TARGET_DIR/private. Never point this at an existing installation.

Private fixture JSON can be mounted at `/audit-fixtures`. Use the caller's UID/GID for owner-only
fixture writes. Keep the repository wrapper's narrow mounts; do not mount checkout `.git` into a
third-party dependency container.

## Probe execution

API probes require `E2E_BASE_URL=http://app:3000`, approved target env and private
`LESSON3_AUDIT_FIXTURE_FILE`. The marked fixture contains synthetic password/accounts/scopes/IDs.
Seed only after target-marker and empty-user checks, with `LESSON3_AUDIT_RUN_ID`,
`LESSON3_AUDIT_PASSWORD` and private fixture output. Runtime commands below run inside pinned Node,
on the correct private network, under the target lock. Set `LESSON3_AUDIT_RESULT_FILE` privately
where used; static inventory instead takes `LESSON3_AUDIT_SURFACE_FILE`.

| Helper | Command / additional input |
|---|---|
| Seed | `npx tsx tests/audit/c01-seed.ts` |
| Role/mail readiness | `npx tsx tests/audit/c01-readiness.ts`; `LESSON3_AUDIT_CHECK_MAIL=1` initially, otherwise 0 |
| Static inventory | `npx tsx tests/audit/c20-inventory.ts`; no database/network needed |
| Native privacy/GraphQL | `npx tsx tests/audit/c22-private-fields.ts` |
| Native writes/favorites | `npx tsx tests/audit/c22-native-matrix.ts`; eight favorites created/deleted; verify fingerprints |
| Sparse/full/bulk PATCH | `node tests/audit/c22-immutable-followup.mjs`; private `/audit-fixtures` output |
| Save boundary | `npx tsx tests/audit/c30-save-matrix.ts`; eight candidates created/deleted; clean two-plan fixture required for exact patch controls |
| Targeted auth budget | `npx tsx tests/audit/c23-auth-budgets.ts`; `LESSON3_AUDIT_AUTH_MODE=target` |
| Global auth budget | Same, mode `global`; at most 1,005 requests, concurrency four, 120-second deadline |
| Controlled save races | `node tests/audit/c31-save-barrier.mjs`; private corpus directory and marked target DB URI; holds/releases a plan-row lock, creates/deletes one plan and four candidates |
| Pending-authority lock waits | `npm run test:http -- tests/http/pendingAuthority.http.spec.ts`; existing HTTP suite against the marked target; real barriers cover revocation during grants/deletes, source retirement, recovery saves and Make Official |
| Native editing locks | `npm run test:http -- tests/http/lockedDocuments.http.spec.ts`; existing HTTP suite against the marked target; forged-create, takeover, holder-only unlock and 423 deletion barrier |
| Approved-taxonomy rollback | `node tests/audit/c41-taxonomy-wire.mjs`; marked disposable DB with narrowly conditional fault trigger; standard private paths; controller must remove trigger/function in finally |
| Rich prose sinks | `node tests/audit/c41-content-sinks.mjs`; browser image, marked target network, synthetic source/recipient; stored/unsaved preview, Chromium DOM, DOCX export and Mailpit attachment; helper deletes owned plan |
| Declared body ceilings | `node tests/audit/c40-body-ceilings.mjs`; private fixture/result paths, marked target network; honest oversized multipart `Content-Length` probes for upload, preview and save-as-new |
| Chunked body ceilings | `node tests/audit/c40-chunked-body.mjs` and `c40-chunked-upload.mjs`; marked target network; no-`Content-Length` preview/save field caps plus a streamed just-over-limit upload with private resource sampling |
| Generate upload corpus | `node tests/audit/c41-generate.mjs`; network disabled; absolute private `LESSON3_AUDIT_CORPUS_DIR` outside `/app` |
| Web upload corpus | `node tests/audit/c41-web-corpus.mjs`; private corpus/fixture/result paths; optional `LESSON3_AUDIT_CORPUS_GROUP` narrows non-control groups; imports/deletes candidate plans |
| Static CLI extractor corpus | `npx tsx tests/audit/c41-cli-corpus.ts`; private result path, network disabled, no database |
| CLI ingest entry point | `npx payload run scripts/ingest.ts -- /audit-corpus/role-control.json` (plus valid+prototype-key batch); pinned Node 24 dependency container, marked runtime database, private cleanup through Payload Local API |
| Timing/lockout | `npx tsx tests/audit/c23-enumeration.ts`; three wrong passwords per each of three roles, then one account to six attempts |

Restore the approved synthetic dump before/after every auth probe and prove role readiness afterwards.
An auth-proof exit 0 means the known defect was reproduced, not that abuse protection passed.
Retain original failed runs and exact helper/source versions.

The host-only `bash docs/audit/tools/repro-restore-cache.sh` requires an ordinary user and shell
tools. It uses a temporary cache and Docker-function stub, no daemon/database. It proves failure
masking and a writable control, not the complete restored-export consequence.
