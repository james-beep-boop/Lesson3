# Vendored ARES generator — provenance

The four files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current library source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Library commit:** `f83db61931566df6bde9252db552bd353ed43d7a` (`f83db61`, upstream 2026-10-08 UTC; a direct
  child of the previous pin `b3743ff`)
- **Vendored:** 2026-10-08
- **Reason:** adopt upstream's fix for the cramped table layout we reported. A Markdown table in a
  lesson-framework column (`learnerExperience`, `teacherMoves`, `sensemakingStrategy`, `formativeAssessment`)
  is now pulled out of the narrow cell (`stripTables`, new in `docx_kit.js`), a "(table below)" pointer is
  left behind, and the table prints **full-width in a row of its own under the phase** (`sections.js`).
  `richCell` also now treats a table as TWO OR MORE consecutive pipe rows — a lone `|x| = 3` line is maths and
  stays text. Only `sections.js` and `docx_kit.js` changed; `build_docs.js`, `attribution.js`
  and upstream's `aresResources.js` are byte-identical to the previous library pin. Attribution
  configuration has its own newer pin below; it is not sourced from this library revision.
  **Previous pins:** `b3743ff` (2026-10-07), `6591146` (2026-10-06), `a546ee3` (2026-09-19).
- **Mirror tag:** none created for this local change. Create one only as a separately approved
  upstream-repository operation.

## Attribution configuration pin — 2026-10-22

- **Configuration commit:** `d3d2b875d5a2e6e6ad2409f900a4df06fd245c3e` (upstream 2026-10-21).
- Only `config/attribution.yaml` is synced from this revision. The four vendored `lib/` files
  remain byte-identical to Lesson3's `f83db61` pin above; this is not a renderer-library re-pin.
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
gap without changing the authorship or provenance of the three byte-pristine files.

## Pristine files

| Lesson3 path | Upstream path | SHA-256 |
| --- | --- | --- |
| `lib/build_docs.js` | `generators/lib/build_docs.js` | `0d41e8efa1fa5b0bece27e00abe52fad3dc11ec32d689fbe4bdddb43e64972de` |
| `lib/sections.js` | `generators/lib/sections.js` | `55b431ab1760606ea1a6ac666c26122744393fe045ff1a9a29a841548d6c82a3` |
| `lib/docx_kit.js` | `generators/lib/docx_kit.js` | `3359cf217a07975b276907ecb2628970ef0b8981b509c67e1bc37a686486cfbd` |
| `lib/attribution.js` | `generators/lib/attribution.js` | `7ac867b861ea1be8f6cfe8590cf7171c94b5536cc828c4d29983bd6abe6f9288` |
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
  f83db61931566df6bde9252db552bd353ed43d7a \
  d3d2b875d5a2e6e6ad2409f900a4df06fd245c3e
```

The script copies the four library files from the library revision, and the pristine attribution
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
