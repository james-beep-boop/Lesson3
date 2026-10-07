# Vendored ARES generator — provenance

The four files under `lib/` are copied byte-verbatim from the ARES CBE generation system and must
not be edited locally. Lesson3 integration remains outside those files. The fidelity gates, not the
commit label alone, are the acceptance proof for this pin.

## Current source pin

- **Repository:** `markknit/cbe-generation-system`
- **Branch:** `main`
- **Pinned commit:** `b3743ff6d90f8623ba5a4a0c34c79162bd34c472` (`b3743ff`, upstream 2026-10-07; a direct child
  of the previous pin `6591146`)
- **Vendored:** 2026-10-08
- **Reason:** adopt upstream's fix for Markdown data tables that printed as literal `| a | b |` text. `richCell`
  moved from `build_docs.js` into `docx_kit.js` **unchanged** (same row definition) and is now used for the Final
  Explanation `instructions` (five of the 95 current plans have a data table there) and for the lesson-plan
  `overview` and the four implementation-framework fields (`learnerExperience`, `teacherMoves`,
  `sensemakingStrategy`, `formativeAssessment`; two plans have tables there). Also adds **keep-with-next**: a
  section header stays with its prompt and a student prompt stays with its answer box. Only `build_docs.js`,
  `sections.js` and `docx_kit.js` changed; `attribution.js`, `config/attribution.yaml` and upstream's
  `aresResources.js` (which the Lesson3-owned bridge mirrors) are byte-identical to the previous pin.
  **Previous pins:** `6591146` (2026-10-06), `a546ee3` (2026-09-19).
- **Mirror tag:** none created for this local change. Create one only as a separately approved
  upstream-repository operation.

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
| `lib/sections.js` | `generators/lib/sections.js` | `e004b658801059097332fc6491b2b8f49ccbd5396ae103f2b2d2b678b068c018` |
| `lib/docx_kit.js` | `generators/lib/docx_kit.js` | `c670d5fe84965893017ff910b180c0aca5f20709bb7f117c147afd13366b1ccb` |
| `lib/attribution.js` | `generators/lib/attribution.js` | `7ac867b861ea1be8f6cfe8590cf7171c94b5536cc828c4d29983bd6abe6f9288` |
| `vendor/config/attribution.upstream.yaml` | `config/attribution.yaml` | `950f68dbceee79d12de4dc49e9b5827434dca5fb81ddf4bfd188c173041f4104` |

`tests/unit/vendorProvenance.spec.ts` recomputes these hashes from the files on disk, so this table cannot
silently drift from the vendored bytes.

## Attribution config — the one deliberate deviation

`lib/attribution.js` reads `config/attribution.yaml` (by default relative to itself: `generator/config/`; in the
production bundle that default does not resolve, so `generator/index.ts` sets `ATTRIBUTION_YAML` explicitly). Upstream's
file says `year: auto`, which stamps the **render-time** year: the same immutable snapshot re-rendered in
January would change bytes, contradicting the byte-stability contract in `renderVersion.ts`.

Lesson3 therefore ships `generator/config/attribution.yaml` (SHA-256
`4203befb96b6a9a0546f5cf79a4080b23252e5389fda5c124b560ab82b30b183`) whose **only** difference from the pristine
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
scripts/vendor-generator.sh <path-to-cbe-generation-system-clone> <commit-sha>
```

The script copies the four lib files and derives the fixed-year attribution config. Re-check upstream's
`sections.js` resource path and `build_docs.js` imports against the bridge before trusting a new pin.

Then update this record and run, from `app/`:

```sh
npx tsx scripts/fidelity-spike.ts
npx tsx scripts/adapter-fidelity.ts
```

Also bump `GENERATOR_RENDER_VERSION` when output can change so cached DOCX, PDF, and HTML previews
cannot serve bytes from the previous renderer.
