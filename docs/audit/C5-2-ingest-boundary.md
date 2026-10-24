# C5.2 — Ingest and upload boundary

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Environment:** disposable cloud stack (as C40/C41). Source **source-confirmed**; live probes
  **locally reproduced**.
- **Mandatory checks:** the authorization gate before any input is read; `.js` never reaches an
  interpreter; the contract gate; ZIP handling; caps; no prototype pollution; no partial write on
  rejection.
- **Exclusions:** transport-level body limits (chunked, missing `Content-Length`) and the proxy
  ceiling belong to the deployment-parity pass (L-C40-01).
- **Exit:** the boundary answered from source, and every refusal path exercised; F-C40-001 is the only
  candidate, filed in C40.

## Outcome

**No new candidate.** The boundary held in source and live. The one gate miss, F-C40-001 (built-in
property names bypass the contract gate), is filed in
[findings/C40-ingest-code.md](findings/C40-ingest-code.md) and is not repeated here.

## Source

- **Gate first.** `endpoints/uploadBundles.ts` checks `isSiteAdmin` before buffering or inspecting
  any input (line 38 precedes the body read at line 86). Anonymous and non-admin callers are refused
  before any parse.
- **No execution.** `.js` is handled by an acorn AST walk and `extractAresJson` does `JSON.parse`; no
  `require`, `eval` or `Function` on uploaded content (grep of the ingest tree found none outside the
  tests).
- **Caps and pre-counts.** JSZip directory pre-count before inflation; entry-count and byte caps;
  streamed stop at the cap. Matches C41's live results.
- **Prototype keys.** `__proto__` rejected at parse (`extract.ts`); the other inherited names are the
  F-C40-001 gap.
- **Write path.** `ingest/index.ts` writes only the five bundle groups through the trusted path after
  the gate, and creates versions through the immutable-create rule (C30).
- **Sweep.** Searched the TypeScript tree for `in`-operator checks on input-derived objects. Every
  remaining use tests a fixed field name (`roles`, `assignments`, `_verified`, `officialVersion`,
  `subjectGrade`, `title`) and none of those is an `Object.prototype` member. The only input-driven
  schema walk is `ingest/contract.ts`, already filed. `hasOwn` appears twice in the tree; the
  F-C40-001 fix has not spread.

## Live results

Covered in full in [C41-upload-abuse.md](C41-upload-abuse.md) (every row of the corpus), with the
authorization gate run for anonymous (401), editing-access and Subject Administrator (403).

## Resume point

- F-C40-001 fix, then add the four built-in names to the contract tests.
- Transport-level body limits on the deployment-parity pass.
