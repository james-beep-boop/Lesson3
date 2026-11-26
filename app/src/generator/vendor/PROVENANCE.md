# Vendored ARES generator — provenance

The five files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current library source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Library commit:** `129ffc5f86ca3334fe4c0aa91af61af5b67ead4f` (`129ffc5`, upstream 2026-11-09 UTC). Upstream
  HEAD on 2026-11-26 (`d201e611`) has byte-identical library files, schema and attribution config.
- **Vendored:** 2026-11-26
- **Reason:** ARES contract revision **R1** (`schemaVersion` 1.1.0). The Final Explanation rubric prints four
  CBE levels — Exceeds (4), Meets (3), Approaches (2), Below Expectations (1) — from the new required
  `belowExpectations` key. `build_docs.js` also drops its silent `|| ''` / `|| []` defaults (the adapter supplies
  strings and arrays) and its `run()` now refuses a module that breaks upstream's data contract, which it
  `require`s from the new **`lib/lesson_contract.js`** — vendored only so that require resolves; Lesson3 never
  calls `run()` or `checkModule()`. `sections.js` throws on an unknown phase label instead of falling back to the
  Observe resources (Lesson3's controlled vocabulary already prevents one). `docx_kit.js` and `attribution.js`
  are byte-identical to the previous pin.
  **Previous pins:** `f83db61` (2026-10-08), `b3743ff` (2026-10-07), `6591146` (2026-10-06), `a546ee3` (2026-09-19).
- **Upload contract:** `ingest/ares-contract.schema.json` is upstream's `ares-contract.schema.json` from the same
  commit, byte-verbatim (hash below; `tests/unit/ingestContract.spec.ts` recomputes it). The R0 schema it
  replaced is kept, frozen, as `ingest/ares-contract-1.0.0.schema.json`; ingest picks the schema by the file's
  `schemaVersion`.
- **Mirror tag:** none created for this local change. Create one only as a separately approved
  upstream-repository operation.

## Attribution configuration pin — 2026-10-22

- **Configuration commit:** `d3d2b875d5a2e6e6ad2409f900a4df06fd245c3e` (upstream 2026-10-21).
- Only `config/attribution.yaml` is synced from this revision. (When it was synced the vendored `lib/` files
  stayed at `f83db61`; the library pin above has since moved, and upstream's config is unchanged.)
- The copyright paragraph and lesson footer now name **SeaVuria and ARES Education**. The
  Production & Layout text and "technical implementation by ARES" remain unchanged. The upstream
  `slide_footer` key is retained verbatim but is not consumed by the lesson renderer.
- Renderer revision **10** regenerates DOCX, PDF and HTML previews with the corrected attribution.
  The old cache entries are unreachable and age out normally; no manual cache purge is required.

## Licence — MIT, resolved 2026-09-19

The upstream `markknit/cbe-generation-system` repository adopted the MIT License in commit
`15283e42a49975a0c6e56dbca088e7588ba0c078` on 2026-09-20 UTC, with copyright `2026 markknit`.
GitHub identifies the repository license as SPDX `MIT`.

The upstream license is copied verbatim into this directory as `LICENSE`; retain it with these
vendored files. Lesson3's root `LICENSE` covers Lesson3-authored code under the same license but a
different copyright notice. Matching license terms close the prior redistribution and compatibility
gap without changing the authorship or provenance of the byte-pristine library files.

## Pristine files

| Lesson3 path | Upstream path | SHA-256 |
| --- | --- | --- |
| `lib/build_docs.js` | `generators/lib/build_docs.js` | `cf378b8c338efa3ab27a34d129c9723816068912efb815c16fd7dc0d7b8814c4` |
| `lib/sections.js` | `generators/lib/sections.js` | `5a2c3b8fcf9c503637f1c470e51f8f1b1092505a05b37d45043e2fa9e067233d` |
| `lib/docx_kit.js` | `generators/lib/docx_kit.js` | `3359cf217a07975b276907ecb2628970ef0b8981b509c67e1bc37a686486cfbd` |
| `lib/attribution.js` | `generators/lib/attribution.js` | `7ac867b861ea1be8f6cfe8590cf7171c94b5536cc828c4d29983bd6abe6f9288` |
| `lib/lesson_contract.js` | `generators/lib/lesson_contract.js` | `79d3c06ec7a2bf066a87dd0f4feb0739c979a9bd400c310a6a33fb9a2411c354` |
| `ingest/ares-contract.schema.json` | `ares-contract.schema.json` | `6a103c32ea4ef00dd919f73918e45cb0dbc7c597cb768f0a77d45ed93063e501` |
| `vendor/config/attribution.upstream.yaml` | `config/attribution.yaml` | `0f20f7dba14508f7eeb74b78bf82d4b38657d06801f97a33109669d8ebe4649c` |

`tests/unit/vendorProvenance.spec.ts` recomputes these hashes from the files on disk, so this table cannot
silently drift from the vendored bytes.

## Attribution config — the one deliberate deviation

`lib/attribution.js` reads `config/attribution.yaml` (by default relative to itself: `generator/config/`; in the
production bundle that default does not resolve, so `generator/index.ts` sets `ATTRIBUTION_YAML` explicitly). Upstream's
file says `year: auto`, which stamps the **render-time** year: the same immutable snapshot re-rendered in
January would change bytes, contradicting the byte-stability contract in `renderVersion.ts`.

Lesson3 therefore ships `generator/config/attribution.yaml` (SHA-256
`4650f3e27ccbecad9737c4c8f3a5a9676774635bb43cb8823e7d84fb77975f89`) whose **only** difference from the pristine
copy is `year: 2026` — the **configured copyright year for this generator release**. It is not a claim about
when any particular lesson was first published, and it says nothing about future lessons. `scripts/
vendor-generator.sh` produces it and aborts unless that is the only changed line. Changing the year later is
a deliberate act that **must accompany a `GENERATOR_RENDER_VERSION` bump**.

Runtime needs: `js-yaml` (now a direct, pinned dependency; bundled into the server chunks) and the yaml file
(listed in `outputFileTracingIncludes`; the `Dockerfile` only proves it shipped). That the running app finds it and
renders attribution is proved over the wire by `tests/http/teacherKey.http.spec.ts`.

## Lesson3-owned resource bridge

Upstream `generators/aresResources.js` invokes a Python recommender backed by SQLite. It is not
vendored. A Lesson3-owned CommonJS module at `vendor/aresResources.js` occupies the fixed require
location used by pristine `sections.js` and `build_docs.js`.

Since link-selection v2, pristine `sections.js` either queries the ARES content database (only when a
file exists at the exported `DB_PATH`) or — its own supported path for "no database on this machine" —
renders each lesson's own `lesson.resourceLinks`. The bridge deliberately selects the second path: it
exports a `DB_PATH` that cannot exist, a `getAllPhaseResources` that throws if ever called, and a no-op
`takeDiagnostics`. That is order-independent and shares no state between concurrent builds; it replaces
the earlier positional `AsyncLocalStorage` queue, which could prove call count but never call order.
Upstream prints one `console.warn` per lesson on this path; that is accepted, because suppressing it
would mean replacing the global `console.warn` under concurrent exports.

The bridge reproduces upstream's safe-input paragraph/link formatting and null-slot wording ("No closely
matching video/reading in the ARES library for this activity", the search link, and the visible
`Search terms:` line), filters hyperlink targets to `http` and `https`, and never invokes Python, a
subprocess, the recommender, or SQLite. It cannot reproduce upstream's partial-match "Related topic"
labels: those come from judge diagnostics that live outside the contract JSON.

`vendor/aresResources.js` and `vendor/package.json` are Lesson3-owned integration files. The latter
marks the directory as CommonJS so the ESM application can load the pristine sources via
`createRequire`.

## Re-sync procedure

From the Lesson3 repository root:

```sh
scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> <library-commit-sha> [config-commit-sha]
```

Omitting the configuration revision preserves the original single-commit behavior. To reproduce
**the current split pins**, pass both revisions explicitly:

```sh
scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> \
  129ffc5f86ca3334fe4c0aa91af61af5b67ead4f \
  d3d2b875d5a2e6e6ad2409f900a4df06fd245c3e
```

The script copies the five library files from the library revision, and the pristine attribution
config from the configuration revision, then derives its fixed-year runtime copy. Both revisions
are validated before any vendored file is replaced. Re-check upstream's `sections.js` resource path
and `build_docs.js` imports against the bridge before trusting a new library pin.

`bash scripts/test-vendor-generator.sh` exercises single-commit and split-commit reproduction against
a disposable upstream Git repository whose library and configuration revisions differ.

Then update this record and run, from `app/`:

```sh
npx tsx scripts/fidelity-spike.ts
npx tsx scripts/adapter-fidelity.ts
```

Also bump `GENERATOR_RENDER_VERSION` when output can change so cached DOCX, PDF, and HTML previews
cannot serve bytes from the previous renderer.

The upload contract is not copied by the script: when upstream's `ares-contract.schema.json` changes, copy
it byte-verbatim over `ingest/ares-contract.schema.json` (after moving the old one aside as
`ingest/ares-contract-<old version>.schema.json` if older files must stay accepted), update its row above,
and add the old file to `SCHEMAS` in `ingest/contract.ts`.
