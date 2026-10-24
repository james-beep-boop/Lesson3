# C40 — Ingest candidates

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. These are candidates, not accepted totals.
Coverage and confirmed-safe checks are in [C40-ingest.md](../C40-ingest.md).

## F-C40-001 — The contract gate accepts unknown keys named after built-in object properties

- **Severity:** provisional Low. **Category:** ingest / input validation (integrity).
  **Exposure:** live, Site-Administrator upload and CLI ingest only.
- **Known status:** new. `__proto__` is handled (`extract.ts:130,233–242`); the other inherited names
  are not mentioned anywhere found.
- **Audit / review status:** candidate, author-verified/unreviewed; ingest is a security/integrity
  topic, so the full cycle applies. Author: author-a (Claude), 2026-10-24.
- **Evidence scope / confidence:** locally reproduced over HTTP (disposable cloud stack, 2026-10-24)
  and at unit level against the baseline's own `contract.ts`. High confidence.
- **Scenario:** an uploaded bundle with `"META": { …, "constructor": "x" }`, or a top-level
  `"toString": { … anything … }` → no "unexpected key" drift; the file passes the hard gate.
- **Where:** `app/src/ingest/contract.ts:125–131` (the `key in props` test).

### Evidence

`walk` decides whether a key is allowed with `key in props`, where `props` is the schema's ordinary
`properties` object. `in` also finds inherited members, so `constructor`, `toString`, `valueOf`,
`hasOwnProperty` and the other `Object.prototype` names count as declared. The walk then recurses with
`props[key]` — a built-in function, which has no `type`, `properties` or `additionalProperties` — so
nothing beneath that key is checked either.

Probe (scratch directory outside the checkout; Node 22.22.0 with `--experimental-strip-types`): copy
`contract.ts` and `ares-contract.schema.json` unchanged except for loading the schema with
`createRequire`; call `contractDrift` on the five groups plus one extra key, at the root and inside
`META`. Source file hash `bcc759032874d6ca…` (sha256 prefix). Exit 0. Output:

```
bogus           root: ["bogus: unexpected key"]  META: ["META.bogus: unexpected key"]
constructor     root: []  META: []
toString        root: []  META: []
hasOwnProperty  root: []  META: []
valueOf         root: []  META: []
```

### Impact and limits

- The stored version is not affected directly: Payload saves only fields the collection defines, and
  `rawToBundle` takes only the five groups. No code-execution or prototype-pollution path was found —
  `JSON.parse` and the acorn extractor both create plain own properties.
- What it does break: (1) the gate's own promise that a drifted ARES file is rejected; (2) the release
  fingerprint is computed over the parsed bundle *including* the smuggled keys
  (`ingest/releaseFingerprintContext.ts`), so a version can carry a fingerprint of content it does not
  store; (3) re-ingest "unchanged" detection compares the parsed bundle with the stored one, so a file
  that differs only by such a key creates a new major version with identical stored content.
- The `required` check in the same function also uses `in` (`contract.ts:122–124`); no required key is
  a built-in name today, so that is latent.

- **Repro (done over HTTP, cloud stack 2026-10-24):** as Site Administrator, `POST
  /api/lesson-plans/upload` a valid ARES bundle (the app's own `ares-export` output) with
  `META.constructor = {smuggled:[1,2,3]}` added → **200, bundle created**, no drift rejection. A
  top-level `toString` key likewise passed the gate (200; skipped only because its content matched an
  existing sub-strand). A `__proto__` key, by contrast, was rejected ("`__proto__` keys are not
  allowed"), and `({}).polluted` stayed undefined — no prototype pollution. Unit probe output in
  [C40-ingest.md](../C40-ingest.md).
- **Expected vs actual:** contract-drift is a hard gate (DECISIONS, warn-only → hard gate): any key not
  in the schema should reject the file. Actual: built-in names pass.
- **Suggested fix:** use `Object.hasOwn(props, key)` (and `Object.hasOwn(obj, key)` for `required`),
  and add the probe's four names to the contract tests.
- **Related:** C41 corpus item "prototype-pollution keys".
- **Disposition:** _(blank until triage)_
