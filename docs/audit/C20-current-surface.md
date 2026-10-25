# C20 Current surface inventory

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: sanitized collection/global/custom/native endpoint and job inventory; app/admin route
  inventory; role login/client harness; Chromium and WebKit route/XHR crawl with observed feature gates.
- Artifacts: scans/surface-current.md, C01 fixtures and current API probes; private raw inventories,
  browser state and request evidence. No source-only inventory counts as a live crawl.
- Exclusions: none. Exit: reconcile static inventory against observed routes and every required role.

`app/tests/audit/c20-inventory.ts` resolved the actual Payload 3.92.0 config, exit 0, without database
startup. It found **16 collections, two globals, four root endpoints and five job tasks**, with
GraphQL disabled. [The full inventory](scans/surface-current.md) includes native generated handlers
as well as custom handlers, access descriptors and tracked page/route files.

Resolved native version handlers do not prove a corresponding history table or reachable operation.
`payload-migrations` appears in the sanitized config but rejects native REST access with 501.
`payload-jobs-stats` and native document locks have current explicit policies; their earlier open
defaults are not assumed to remain. Job tasks and native collection writes remain distinct surfaces.

C01 proved every fixture login and unverified refusal; C22 now has a same-origin API harness with
finite deadlines, no mutation retries and sanitized results. Authenticated API requests use freshly
issued tokens; unverified scenarios document a refused login followed by unauthenticated requests.
They do not claim testing a formerly valid token after unverification.

Chromium/WebKit per-role route/XHR crawling and endpoint-to-test reconciliation remain pending.
The inventory is not complete C20 coverage.
